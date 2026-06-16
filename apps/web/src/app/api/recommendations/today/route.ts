import { buildTodayModel } from "@playfit/core/domain";
import type {
  ProductGameState,
  ProductOnboardingDraft,
  ProductProfile,
  ProductState,
  ProductTodayModel,
  SeedGame,
} from "@playfit/core/types";
import { getCache, setCache } from "@/lib/api-cache";
import { mapGameRowToSeedGame } from "@/lib/game-mapper";
import { createAnonClient } from "@/lib/supabase/server";

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

interface TodayRequest {
  profile: ProductProfile;
  gameStates: Record<string, ProductGameState>;
  onboarding: ProductOnboardingDraft;
}

const DB_VERSION = 2;
const CATALOG_CACHE_KEY = "catalog:games";
const CATALOG_CACHE_TTL = 300;
const RECS_CACHE_TTL = 3600;
const debug = process.env.NODE_ENV === "development";

function simpleHash(data: unknown): string {
  const json = JSON.stringify(data);
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = (hash << 5) + hash + json.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function computeRecsCacheKey(
  profile: ProductProfile,
  gameStates: Record<string, ProductGameState>,
  onboarding: ProductOnboardingDraft,
): string {
  const relevantData = {
    lT: profile.likedTags,
    dT: profile.dislikedTags,
    lG: profile.likedGenres,
    aG: profile.avoidedGenres,
    rC: profile.ratedCount,
    p: onboarding.platforms
      .map((p) => `${p.platformId}:${p.status}`)
      .sort()
      .join(","),
    gs: Object.entries(gameStates)
      .map(
        ([id, s]) =>
          `${id}:${s.status ?? ""}:${s.excluded ? "x" : ""}:${s.inWishlist ? "w" : ""}:${s.inPlayfitPicks ? "p" : ""}`,
      )
      .sort()
      .join(","),
    v: DB_VERSION,
  };
  return `recs:today:${simpleHash(relevantData)}`;
}

async function fetchAllGames(supabase: ReturnType<typeof createAnonClient>): Promise<SeedGame[]> {
  const cached = await getCache<SeedGame[]>(CATALOG_CACHE_KEY, supabase);
  if (cached) {
    if (debug) {
      console.log(
        JSON.stringify({
          stage: "fetchAllGames.cacheHit",
          cacheKey: CATALOG_CACHE_KEY,
          cachedCount: cached.length,
          sampleIds: cached.slice(0, 3).map((g) => ({ id: g.gameId, title: g.title })),
        }),
      );
    }
    return cached;
  }
  if (debug) {
    console.log(
      JSON.stringify({
        stage: "fetchAllGames.cacheMiss",
        cacheKey: CATALOG_CACHE_KEY,
      }),
    );
  }

  // Single RPC call replaces ~46 paginated queries
  const { data, error } = await supabase.rpc("get_full_catalog");
  if (error) throw new Error(`Failed to load catalog: ${error.message}`);

  const catalog = data as {
    games: GameRow[];
    platforms: { game_id: string; platform_id: string; platforms: unknown }[];
    aliases: { game_id: string; alias: string }[];
  };

  const platformsByGame = new Map<string, { platform_id: string; platforms: unknown }[]>();
  for (const row of catalog.platforms) {
    const entry = platformsByGame.get(row.game_id) ?? [];
    entry.push(row);
    platformsByGame.set(row.game_id, entry);
  }

  const aliasesByGame = new Map<string, string[]>();
  for (const row of catalog.aliases) {
    const entry = aliasesByGame.get(row.game_id) ?? [];
    entry.push(row.alias);
    aliasesByGame.set(row.game_id, entry);
  }

  const seedGames = catalog.games.map((game) =>
    mapGameRowToSeedGame(
      game,
      platformsByGame.get(game.game_id) ?? [],
      (aliasesByGame.get(game.game_id) ?? []).map((a) => ({ alias: a })),
    ),
  );

  const catalogSeedCount = seedGames.filter((g) => g.source === "catalog").length;
  const finderSeedCount = seedGames.filter((g) => g.source === "finder").length;

  if (debug) {
    console.log(
      JSON.stringify({
        stage: "fetchAllGames.rpcResult",
        allGamesCount: seedGames.length,
        catalogCount: catalogSeedCount,
        finderCount: finderSeedCount,
      }),
    );
  }

  void setCache(CATALOG_CACHE_KEY, seedGames, CATALOG_CACHE_TTL, supabase);

  return seedGames;
}

export const maxDuration = 30;

export async function POST(request: Request) {
  const body = (await request.json()) as TodayRequest;
  const { profile, gameStates, onboarding } = body;

  const supabase = createAnonClient();

  const recsCacheKey = computeRecsCacheKey(profile, gameStates, onboarding);

  const cachedModel = await getCache<ProductTodayModel>(recsCacheKey, supabase);
  if (cachedModel) {
    if (debug) {
      console.log(
        JSON.stringify({
          stage: "recommendations/today.recsCacheHit",
          cacheKey: recsCacheKey,
        }),
      );
    }
    return Response.json(cachedModel);
  }

  const allGames = await fetchAllGames(supabase);

  if (debug) {
    console.log(
      JSON.stringify({
        stage: "recommendations/today.cacheMiss",
        cacheKey: recsCacheKey,
        allGames: allGames.length,
        gamesWithTags: allGames.filter((g) => g.tags.length > 0).length,
        gamesWithoutTags: allGames.filter((g) => g.tags.length === 0).length,
        hasProfile: !!profile,
        onboardingPlatforms: onboarding?.platforms?.length ?? 0,
        likedGames: onboarding?.likedGameIds?.length ?? 0,
        dislikedGames: onboarding?.dislikedGameIds?.length ?? 0,
        gameStatesCount: Object.keys(gameStates ?? {}).length,
      }),
    );
  }

  const state: ProductState = {
    version: DB_VERSION,
    user: {
      onboarding,
      onboardingCompletedAt: null,
      profile,
      gameStates,
      lastUpdatedAt: null,
    },
  };

  const model = buildTodayModel(allGames, state, profile);

  void setCache(recsCacheKey, model, RECS_CACHE_TTL, supabase);

  return Response.json(model);
}
