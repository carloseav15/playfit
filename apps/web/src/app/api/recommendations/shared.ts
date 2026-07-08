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
import { createAnonClient } from "@/lib/supabase/server";

export type { LoadedRecommendationState, PersistedProfilePayload } from "./state-loader";
export { loadRecommendationState } from "./state-loader";

const CATALOG_VERSION = "20260705030000";
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
  return `recs:${scope}:${userId}:${stateVersion}:${CATALOG_VERSION}`;
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

function normalizeModel(model: ProductTodayModel): ProductTodayModel {
  return {
    currentRun: model.currentRun ?? [],
    nextUp: model.nextUp ?? [],
    resume: model.resume ?? [],
    picks: model.picks ?? [],
  };
}

async function callScoringRpc(
  state: ProductState,
  skipBuckets: string[] = [],
): Promise<ProductTodayModel> {
  const profile = state.user.profile;
  if (!profile || !state.user.onboardingCompletedAt) {
    return { currentRun: [], nextUp: [], resume: [], picks: [] };
  }

  const supabase = createAnonClient();
  const accessiblePlatformIds = state.user.onboarding.platforms
    .filter((platform) => platform.status === "available" || platform.status === "limited")
    .map((platform) => platform.platformId);
  const likedTags = buildLikedTagsFromProfile(profile);
  const dislikedTags = buildDislikedTagsFromProfile(profile);

  const { data, error } = await supabase.rpc("score_today_recommendations", {
    p_liked_tags: likedTags as Record<string, number>,
    p_disliked_tags: dislikedTags as Record<string, number>,
    p_liked_genres: profile.likedGenres,
    p_avoided_genres: profile.avoidedGenres,
    p_rated_count: profile.ratedCount,
    p_accessible_platform_ids: accessiblePlatformIds,
    p_onboarding_liked_ids: state.user.onboarding.likedGameIds,
    p_onboarding_disliked_ids: state.user.onboarding.dislikedGameIds ?? [],
    p_game_states: state.user.gameStates as Record<string, unknown>,
    p_skip_buckets: skipBuckets,
  });

  if (error) {
    throw new Error(error.message);
  }

  return normalizeModel(data as unknown as ProductTodayModel);
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

export async function scoreTodayModel({
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

  function hydrate(entries: RankedSeedGame[], p: ProductProfile) {
    return entries.map((entry) => {
      const fullGame = gamesById.get(entry.game.gameId);
      if (!fullGame) return entry;
      const scored = scoreSeedGame(fullGame, scoringState, p);
      return {
        ...entry,
        game: fullGame,
        fitReasons: scored.fitReasons,
        cautionReasons: scored.cautionReasons,
        similarGames: scored.similarGames,
      };
    });
  }

  const hydrated: ProductTodayModel = {
    currentRun: hydrate(model.currentRun, profile),
    nextUp: hydrate(model.nextUp, profile),
    resume: hydrate(model.resume, profile),
    picks: hydrate(model.picks, profile),
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

export async function buildPlayNextModel({
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

  // Skip all buckets except nextUp
  const model = await callScoringRpc(state, ["currentRun", "resume", "picks"]);
  const batch = model.nextUp.slice(0, 20);

  const profile = state.user.profile;
  if (!batch.length || !profile) {
    const empty: ProductPlayNextModel = {
      primary: null,
      alternatives: [],
      savedPickIds: activeSavedPickIds(state),
      stateVersion,
    };
    void setCache(cacheKey, empty, RECS_CACHE_TTL);
    return empty;
  }

  const gamesById = await fetchFullGamesById(batch.map((entry) => entry.game.gameId));
  const scoringState = buildStateForScoring(state, profile, state.user.onboarding);

  const hydrated = batch.map((entry) => {
    const fullGame = gamesById.get(entry.game.gameId);
    if (!fullGame) return entry;
    const scored = scoreSeedGame(fullGame, scoringState, profile);
    return {
      ...entry,
      game: fullGame,
      fitReasons: scored.fitReasons,
      cautionReasons: scored.cautionReasons,
      similarGames: scored.similarGames,
    };
  });

  const playNextModel: ProductPlayNextModel = {
    primary: hydrated[0] ?? null,
    alternatives: hydrated.slice(1),
    savedPickIds: activeSavedPickIds(state),
    stateVersion,
  };

  void setCache(cacheKey, playNextModel, RECS_CACHE_TTL);
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

  const gamesById = await fetchFullGamesById([gameId]);
  const game = gamesById.get(gameId);
  if (!game) return null;

  return scoreSeedGame(game, state, profile);
}
