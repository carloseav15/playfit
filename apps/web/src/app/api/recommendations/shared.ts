import {
  buildDislikedTagsFromProfile,
  buildLikedTagsFromProfile,
  scoreSeedGame,
} from "@playfit/core/domain";
import { productStateSchema } from "@playfit/core/schemas";
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
import { isValidDeviceId } from "@/lib/device-id";
import { GAME_SELECT, mapGameRowToSeedGame } from "@/lib/game-mapper";
import { createAnonClient, createSupabaseServerClient } from "@/lib/supabase/server";

const PRODUCT_STATE_VERSION = 2;
const CATALOG_VERSION = "20260620200001";
const RECS_CACHE_TTL = 3600;

interface PersistedProfilePayload {
  game_states?: Record<string, unknown>;
  profile?: unknown;
  onboarding?: {
    step?: unknown;
    platforms?: unknown;
    likedGameIds?: unknown;
    dislikedGameIds?: unknown;
    onboardingCompletedAt?: unknown;
  };
  created_at?: string | null;
  updated_at?: string | null;
}

interface GameRow {
  game_id: string;
  title: string;
  aliases: string[] | null;
  series_id: string | null;
  genre_id: string | null;
  release_year: number | null;
  release_state: string;
  source_type: string;
  source_ref: string;
  cover_url: string;
  tags: string[] | null;
  notes: string;
  sort_date: string | null;
  release_label: string | null;
  series: unknown;
  genre: unknown;
}

interface PlatformJoinRow {
  game_id: string;
  platform_id: string;
  platforms: unknown;
}

interface AliasJoinRow {
  game_id: string;
  alias: string;
}

export type LoadedRecommendationState =
  | {
      ok: true;
      userId: string;
      state: ProductState;
      stateVersion: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function simpleHash(data: unknown): string {
  const json = JSON.stringify(data);
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = (hash << 5) + hash + json.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export async function getRequestUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (jwt) {
    const supabase = createAnonClient();
    const { data } = await supabase.auth.getUser(jwt);
    return data.user?.id ?? null;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.id) return user.id;

  const deviceId = new URL(request.url).searchParams.get("device_id");
  if (deviceId && isValidDeviceId(deviceId)) return deviceId;

  return null;
}

function mapPersistedState(data: PersistedProfilePayload): ProductState {
  const mapped: ProductState = {
    version: PRODUCT_STATE_VERSION,
    user: {
      onboarding: {
        step:
          data.onboarding?.step === "anchors" || data.onboarding?.step === "dislikes"
            ? data.onboarding.step
            : "platforms",
        platforms: Array.isArray(data.onboarding?.platforms) ? data.onboarding.platforms : [],
        likedGameIds: Array.isArray(data.onboarding?.likedGameIds)
          ? data.onboarding.likedGameIds
          : [],
        dislikedGameIds: Array.isArray(data.onboarding?.dislikedGameIds)
          ? data.onboarding.dislikedGameIds
          : [],
      },
      onboardingCompletedAt:
        typeof data.onboarding?.onboardingCompletedAt === "string"
          ? data.onboarding.onboardingCompletedAt
          : null,
      profile: (data.profile ?? null) as ProductProfile | null,
      gameStates: (data.game_states ?? {}) as ProductState["user"]["gameStates"],
      lastUpdatedAt: data.updated_at ?? data.created_at ?? null,
    },
  };

  const parsed = productStateSchema.safeParse(mapped);
  if (!parsed.success) {
    throw new Error("Invalid persisted recommendation state");
  }
  return parsed.data;
}

function computeStateVersion(data: PersistedProfilePayload, state: ProductState) {
  return (
    data.updated_at ??
    data.created_at ??
    simpleHash({
      onboarding: state.user.onboarding,
      onboardingCompletedAt: state.user.onboardingCompletedAt,
      profile: state.user.profile,
      gameStates: state.user.gameStates,
    })
  );
}

export async function loadRecommendationState(
  request: Request,
): Promise<LoadedRecommendationState> {
  const userId = await getRequestUserId(request);
  if (!userId) {
    return { ok: false, status: 401, error: "Recommendation session required" };
  }

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("get_profile", { p_user_id: userId });
  if (error) {
    return { ok: false, status: 500, error: "Failed to load recommendation state" };
  }
  if (!data) {
    return { ok: false, status: 404, error: "Recommendation profile not found" };
  }

  try {
    const payload = data as PersistedProfilePayload;
    const state = mapPersistedState(payload);
    return {
      ok: true,
      userId,
      state,
      stateVersion: computeStateVersion(payload, state),
    };
  } catch {
    return { ok: false, status: 500, error: "Invalid recommendation state" };
  }
}

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
  const { data: rawGames, error } = await supabase
    .schema("games_library")
    .from("games")
    .select(GAME_SELECT)
    .in("game_id", uniqueIds);

  if (error || !rawGames || rawGames.length === 0) {
    return new Map();
  }

  const games = rawGames as GameRow[];
  const fetchedIds = games.map((game) => game.game_id);

  const [platformResult, aliasResult] = await Promise.all([
    supabase
      .schema("games_library")
      .from("game_platforms")
      .select("game_id, platform_id, platforms:platform_id(name)")
      .in("game_id", fetchedIds),
    supabase
      .schema("games_library")
      .from("game_aliases")
      .select("game_id, alias")
      .in("game_id", fetchedIds),
  ]);

  const platformsByGame = new Map<string, PlatformJoinRow[]>();
  for (const row of (platformResult.data as PlatformJoinRow[]) ?? []) {
    const entry = platformsByGame.get(row.game_id) ?? [];
    entry.push(row);
    platformsByGame.set(row.game_id, entry);
  }

  const aliasesByGame = new Map<string, string[]>();
  for (const row of (aliasResult.data as AliasJoinRow[]) ?? []) {
    const entry = aliasesByGame.get(row.game_id) ?? [];
    entry.push(row.alias);
    aliasesByGame.set(row.game_id, entry);
  }

  const map = new Map<string, SeedGame>();
  for (const game of games) {
    map.set(
      game.game_id,
      mapGameRowToSeedGame(
        game,
        platformsByGame.get(game.game_id) ?? [],
        (aliasesByGame.get(game.game_id) ?? []).map((alias) => ({ alias })),
      ),
    );
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
