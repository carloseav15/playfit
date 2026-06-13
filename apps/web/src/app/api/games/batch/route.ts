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

interface PlatformJoinRow {
  game_id: string;
  platform_id: string;
  platforms: unknown;
}

interface AliasJoinRow {
  game_id: string;
  alias: string;
}

export const maxDuration = 30;

export async function POST(request: Request) {
  const { gameIds } = (await request.json()) as { gameIds: string[] };

  if (!Array.isArray(gameIds) || gameIds.length === 0) {
    return Response.json({ games: [] });
  }

  if (gameIds.length > 500) {
    return Response.json({ error: "Too many game IDs (max 500)" }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();

  const { data: rawGames, error } = await supabase
    .schema("games_library")
    .from("games")
    .select(GAME_SELECT)
    .in("game_id", gameIds);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const games = (rawGames as GameRow[]) ?? [];
  if (games.length === 0) {
    return Response.json({ games: [] });
  }

  const fetchedIds = games.map((g) => g.game_id);

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

  const seedGames = games.map((game) =>
    mapGameRowToSeedGame(
      game,
      platformsByGame.get(game.game_id) ?? [],
      (aliasesByGame.get(game.game_id) ?? []).map((a) => ({ alias: a })),
    ),
  );

  return Response.json({ games: seedGames });
}
