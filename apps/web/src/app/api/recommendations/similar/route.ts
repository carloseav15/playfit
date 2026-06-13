import { findSeriesGames, findSimilarGames } from "@playfit/core/domain";
import type { SeedGame } from "@playfit/core/types";
import { getCache, setCache } from "@/lib/api-cache";
import { GAME_SELECT, mapGameRowToSeedGame } from "@/lib/game-mapper";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

const CACHE_KEY = "catalog:games";
const CACHE_TTL = 300;

async function fetchAllGames(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
): Promise<SeedGame[]> {
  const cached = await getCache<SeedGame[]>(CACHE_KEY, supabase);
  if (cached) return cached;

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

  const fetchedIds = allGames.map((g) => g.game_id);

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

  const platformsByGame = new Map<string, { platform_id: string; platforms: unknown }[]>();
  for (const row of (platformResult.data as {
    game_id: string;
    platform_id: string;
    platforms: unknown;
  }[]) ?? []) {
    const entry = platformsByGame.get(row.game_id) ?? [];
    entry.push(row);
    platformsByGame.set(row.game_id, entry);
  }

  const aliasesByGame = new Map<string, string[]>();
  for (const row of (aliasResult.data as { game_id: string; alias: string }[]) ?? []) {
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

  // Best-effort cache storage
  void setCache(CACHE_KEY, seedGames, CACHE_TTL, supabase);

  return seedGames;
}

export const maxDuration = 30;

export async function POST(request: Request) {
  const { gameId } = (await request.json()) as { gameId: string };

  if (!gameId) {
    return Response.json({ error: "gameId is required" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const allGames = await fetchAllGames(supabase);

  const game = allGames.find((g) => g.gameId === gameId);

  if (!game) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }

  const similar = findSimilarGames(game, allGames, 5);
  const series = findSeriesGames(game, allGames, 10);

  return Response.json({ similar, series });
}
