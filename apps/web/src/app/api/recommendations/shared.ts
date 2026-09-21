import {
  buildDislikedTagsFromProfile,
  buildLikedTagsFromProfile,
  scoreSeedGame,
} from "@playfit/core/domain";
import type {
  ProductOnboardingDraft,
  ProductPlayNextModel,
  ProductProfile,
  ProductState,
  ProductTodayModel,
  RankedSeedGame,
  SeedGame,
} from "@playfit/core/types";
import { getCache, setCache } from "@/lib/api-cache";
import { fetchGamesByIds, mapRowsToSeedGames } from "@/lib/games-db";
import { peekInFlight, singleFlight } from "@/lib/single-flight";
import { createAnonClient } from "@/lib/supabase/server";
import { buildIdentityExpandedGameStates } from "./identity-equivalents";

export type { LoadedRecommendationState, PersistedProfilePayload } from "./state-loader";
export { loadRecommendationState, loadRecommendationStateFromContext } from "./state-loader";

export const RECOMMENDATION_MODEL_VERSION = "20260912-shared-sql";
const RECS_CACHE_TTL = 3600;

function buildRecsCacheKey({
  userId,
  stateVersion,
  scope,
}: {
  userId: string;
  stateVersion: string;
  scope: "play-next" | "model";
}) {
  return `recs:${scope}:${userId}:${stateVersion}:${RECOMMENDATION_MODEL_VERSION}`;
}

export async function fetchFullGamesById(gameIds: string[]): Promise<Map<string, SeedGame>> {
  const uniqueIds = [...new Set(gameIds)].filter(Boolean);
  if (uniqueIds.length === 0) return new Map();

  const supabase = createAnonClient();
  const gamesResult = await fetchGamesByIds(supabase, uniqueIds);
  if (!gamesResult.ok || gamesResult.rows.length === 0) {
    return new Map();
  }

  const seedGames = await mapRowsToSeedGames(supabase, gamesResult.rows);
  const map = new Map<string, SeedGame>();
  for (const game of seedGames) {
    map.set(game.gameId, game);
  }
  return map;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isProductTodayModel(value: unknown): value is ProductTodayModel {
  if (!isRecord(value)) return false;
  return ["currentRun", "nextUp", "resume", "picks"].every((key) => Array.isArray(value[key]));
}

function normalizeModel(model: unknown): ProductTodayModel {
  if (!isProductTodayModel(model)) {
    throw new Error("Recommendation RPC returned an invalid model.");
  }

  return {
    currentRun: model.currentRun ?? [],
    nextUp: model.nextUp ?? [],
    resume: model.resume ?? [],
    picks: model.picks ?? [],
  };
}

function scoringParams(state: ProductState) {
  const profile = state.user.profile;
  if (!profile) throw new Error("Taste profile is not ready");
  const accessiblePlatformIds = state.user.onboarding.platforms
    .filter((platform) => platform.status === "available" || platform.status === "limited")
    .map((platform) => platform.platformId);
  const likedTags = buildLikedTagsFromProfile(profile);
  const dislikedTags = buildDislikedTagsFromProfile(profile);
  return {
    p_liked_tags: likedTags as Record<string, number>,
    p_disliked_tags: dislikedTags as Record<string, number>,
    p_liked_genres: profile.likedGenres,
    p_avoided_genres: profile.avoidedGenres,
    p_rated_count: profile.ratedCount,
    p_accessible_platform_ids: accessiblePlatformIds,
    p_game_states: state.user.gameStates as Record<string, unknown>,
  };
}

async function callScoringRpc(
  state: ProductState,
  skipBuckets: string[] = [],
  gameStatesOverride?: Record<string, unknown>,
): Promise<ProductTodayModel> {
  const profile = state.user.profile;
  if (!profile || !state.user.onboardingCompletedAt) {
    return { currentRun: [], nextUp: [], resume: [], picks: [] };
  }

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("score_today_recommendations", {
    ...scoringParams(state),
    p_onboarding_liked_ids: state.user.onboarding.likedGameIds,
    p_onboarding_disliked_ids: state.user.onboarding.dislikedGameIds ?? [],
    p_game_states: gameStatesOverride ?? (state.user.gameStates as Record<string, unknown>),
    p_skip_buckets: skipBuckets,
  });

  if (error) {
    throw new Error(error.message);
  }

  return normalizeModel(data);
}

export function buildStateForScoring(
  state: ProductState,
  profile: ProductProfile,
  onboarding: ProductOnboardingDraft,
): ProductState {
  return {
    ...state,
    user: {
      ...state.user,
      profile,
      onboarding,
    },
  };
}

function hydrateScoredEntries(
  entries: RankedSeedGame[],
  state: ProductState,
  gamesById: Map<string, SeedGame>,
): RankedSeedGame[] {
  const profile = state.user.profile;
  if (!profile) return entries;
  return entries.map((entry) => {
    const game = gamesById.get(entry.game.gameId);
    if (!game) return entry;
    const reasons = scoreSeedGame(game, state, profile);
    return {
      ...entry,
      game,
      fitReasons: reasons.fitReasons,
      cautionReasons: reasons.cautionReasons,
      similarGames: reasons.similarGames,
    };
  });
}

export function scoreTodayModel(input: {
  state: ProductState;
  stateVersion: string;
  userId: string;
  cacheScope: "model";
}): Promise<ProductTodayModel> {
  const key = buildRecsCacheKey({
    userId: input.userId,
    stateVersion: input.stateVersion,
    scope: input.cacheScope,
  });
  return singleFlight(key, () => computeTodayModel(input));
}

async function computeTodayModel({
  state,
  stateVersion,
  userId,
  cacheScope,
}: {
  state: ProductState;
  stateVersion: string;
  userId: string;
  cacheScope: "model";
}): Promise<ProductTodayModel> {
  const profile = state.user.profile;
  if (!profile || !state.user.onboardingCompletedAt) {
    return { currentRun: [], nextUp: [], resume: [], picks: [] };
  }

  const cacheKey = buildRecsCacheKey({ userId, stateVersion, scope: cacheScope });
  const cached = await getCache<ProductTodayModel>(cacheKey);
  if (cached) return cached;

  const model = await callScoringRpc(state);

  // Deduplicate game IDs across all 4 buckets, fetch once
  const allIds = [
    ...model.currentRun.map((e) => e.game.gameId),
    ...model.nextUp.map((e) => e.game.gameId),
    ...model.resume.map((e) => e.game.gameId),
    ...model.picks.map((e) => e.game.gameId),
  ];
  const uniqueIds = [...new Set(allIds)].filter(Boolean);
  const gamesById = uniqueIds.length > 0 ? await fetchFullGamesById(uniqueIds) : new Map();

  const scoringState = buildStateForScoring(state, profile, state.user.onboarding);

  const hydrated: ProductTodayModel = {
    currentRun: hydrateScoredEntries(model.currentRun, scoringState, gamesById),
    nextUp: hydrateScoredEntries(model.nextUp, scoringState, gamesById),
    resume: hydrateScoredEntries(model.resume, scoringState, gamesById),
    picks: hydrateScoredEntries(model.picks, scoringState, gamesById),
  };

  void setCache(cacheKey, hydrated, RECS_CACHE_TTL);
  return hydrated;
}

function activeSavedPickIds(state: ProductState) {
  return Object.values(state.user.gameStates)
    .filter(
      (record) =>
        record.inPlayfitPicks &&
        record.status !== "completed" &&
        record.status !== "beaten" &&
        record.status !== "abandoned" &&
        !record.excluded,
    )
    .map((record) => record.gameId)
    .sort();
}

export function buildPlayNextModel(input: {
  state: ProductState;
  stateVersion: string;
  userId: string;
}): Promise<ProductPlayNextModel> {
  const key = buildRecsCacheKey({
    userId: input.userId,
    stateVersion: input.stateVersion,
    scope: "play-next",
  });
  return singleFlight(key, () => computePlayNextModel(input));
}

export function getCachedPlayNextModel({
  userId,
  stateVersion,
}: {
  userId: string;
  stateVersion: string;
}): Promise<ProductPlayNextModel | null> {
  const key = buildRecsCacheKey({ userId, stateVersion, scope: "play-next" });
  return peekInFlight<ProductPlayNextModel>(key) ?? getCache<ProductPlayNextModel>(key);
}

async function computePlayNextModel({
  state,
  stateVersion,
  userId,
}: {
  state: ProductState;
  stateVersion: string;
  userId: string;
}): Promise<ProductPlayNextModel> {
  const cacheKey = buildRecsCacheKey({ userId, stateVersion, scope: "play-next" });
  const cached = await getCache<ProductPlayNextModel>(cacheKey);
  if (cached) return cached;

  // Skip all buckets except nextUp. Confirmed identity equivalents (other
  // editions of a game the user already has a decision/state on) are added
  // to this call's game_states as excluded=true so they stay ineligible as
  // *new* recommendations -- see identity-equivalents.ts. This never
  // touches `state` itself, so scoring/hydration below still runs against
  // the user's real, unmodified game states.
  const identityGameStates = await buildIdentityExpandedGameStates(state);
  const model = await callScoringRpc(state, ["currentRun", "resume", "picks"], identityGameStates);
  const batch = model.nextUp.slice(0, 20);

  const profile = state.user.profile;
  if (!batch.length || !profile) {
    const empty: ProductPlayNextModel = {
      primary: null,
      alternatives: [],
      savedPickIds: activeSavedPickIds(state),
      stateVersion,
      rankingMetadata: {
        profileStateVersion: stateVersion,
        candidates: [],
      },
    };
    await setCache(cacheKey, empty, RECS_CACHE_TTL);
    return empty;
  }

  const gamesById = await fetchFullGamesById(batch.map((entry) => entry.game.gameId));
  const scoringState = buildStateForScoring(state, profile, state.user.onboarding);

  const hydrated = hydrateScoredEntries(batch, scoringState, gamesById);

  const playNextModel: ProductPlayNextModel = {
    primary: hydrated[0] ?? null,
    alternatives: hydrated.slice(1),
    savedPickIds: activeSavedPickIds(state),
    stateVersion,
    rankingMetadata: {
      profileStateVersion: stateVersion,
      candidates: hydrated.map((entry, index) => ({
        gameId: entry.game.gameId,
        rank: index + 1,
      })),
    },
  };

  await setCache(cacheKey, playNextModel, RECS_CACHE_TTL);
  return playNextModel;
}

export async function scoreOneGame({
  gameId,
  state,
}: {
  gameId: string;
  state: ProductState;
}): Promise<RankedSeedGame | null> {
  const profile = state.user.profile;
  if (!profile) return null;

  const entries = await scoreGamesByIds([gameId], state);
  return entries[0] ?? null;
}

export async function scoreGamesByIds(
  gameIds: string[],
  state: ProductState,
): Promise<RankedSeedGame[]> {
  if (!state.user.profile || gameIds.length === 0) return [];
  const ids = [...new Set(gameIds)];
  const supabase = createAnonClient();
  const entries: RankedSeedGame[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const { data, error } = await supabase.rpc("score_recommendation_games", {
      ...scoringParams(state),
      p_game_ids: ids.slice(offset, offset + 100),
    });
    if (error) throw new Error(error.message);
    if (!Array.isArray(data)) throw new Error("Recommendation RPC returned invalid entries");
    entries.push(...(data as RankedSeedGame[]));
  }
  const games = await fetchFullGamesById(ids);
  return hydrateScoredEntries(entries, state, games);
}
