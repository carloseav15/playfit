import { buildTodayModel } from "@playfit/core/domain";
import type {
  ProductGameState,
  ProductOnboardingDraft,
  ProductProfile,
  ProductState,
  SeedGame,
} from "@playfit/core/types";
import { getCache, setCache } from "@/lib/api-cache";
import { GAME_SELECT, mapGameRowToSeedGame } from "@/lib/game-mapper";
import { paginateTable } from "@/lib/supabase/paginate";
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
const CACHE_KEY = "catalog:games";
const CACHE_TTL = 300;
const debug = process.env.NODE_ENV === "development";

async function fetchAllGames(supabase: ReturnType<typeof createAnonClient>): Promise<SeedGame[]> {
  const cached = await getCache<SeedGame[]>(CACHE_KEY, supabase);
  if (cached) {
    if (debug) {
      console.log(
        JSON.stringify({
          stage: "fetchAllGames.cacheHit",
          cacheKey: CACHE_KEY,
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
        cacheKey: CACHE_KEY,
      }),
    );
  }

  const pageSize = 1000;
  let from = 0;
  let done = false;
  const allGames: GameRow[] = [];

  while (!done) {
    const { data, error } = await supabase
      .schema("games_library")
      .from("games")
      .select(GAME_SELECT)
      .order("title")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to load games: ${error.message}`);

    const batch = (data as GameRow[]) ?? [];
    allGames.push(...batch);
    from += pageSize;
    if (batch.length < pageSize) done = true;
  }

  const [allPlatforms, allAliases] = await Promise.all([
    paginateTable<{ game_id: string; platform_id: string; platforms: unknown }>(
      supabase,
      "game_platforms",
      "game_id, platform_id, platforms:platform_id(name)",
    ),
    paginateTable<{ game_id: string; alias: string }>(supabase, "game_aliases", "game_id, alias"),
  ]);

  const platformsByGame = new Map<string, { platform_id: string; platforms: unknown }[]>();
  for (const row of allPlatforms) {
    const entry = platformsByGame.get(row.game_id) ?? [];
    entry.push(row);
    platformsByGame.set(row.game_id, entry);
  }

  const aliasesByGame = new Map<string, string[]>();
  for (const row of allAliases) {
    const entry = aliasesByGame.get(row.game_id) ?? [];
    entry.push(row.alias);
    aliasesByGame.set(row.game_id, entry);
  }

  const seedGames = allGames.map((game) =>
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
        stage: "fetchAllGames.dbResult",
        allGamesCount: seedGames.length,
        catalogCount: catalogSeedCount,
        finderCount: finderSeedCount,
        totalDbRows: allGames.length,
      }),
    );
  }

  // Best-effort cache storage
  void setCache(CACHE_KEY, seedGames, CACHE_TTL, supabase);

  return seedGames;
}

export const maxDuration = 30;

export async function POST(request: Request) {
  const body = (await request.json()) as TodayRequest;
  const { profile, gameStates, onboarding } = body;

  const supabase = createAnonClient();
  const allGames = await fetchAllGames(supabase);

  if (debug) {
    console.log(
      JSON.stringify({
        stage: "recommendations/today",
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

  return Response.json(model);
}
