import { resolveGameRedirect } from "@/lib/game-redirects";
import { createAnonClient } from "@/lib/supabase/server";
import { fetchFullGamesById } from "../shared";

const SIMILAR_LIMIT = 20;
const SERIES_LIMIT = 20;

export const maxDuration = 30;

export async function POST(request: Request) {
  const { gameId } = (await request.json()) as { gameId: string };

  if (!gameId) {
    return Response.json({ error: "gameId is required" }, { status: 400 });
  }

  const supabase = createAnonClient();
  const redirect = await resolveGameRedirect(supabase, gameId);

  if (redirect.error) {
    return Response.json({ error: redirect.error }, { status: 500 });
  }

  const { data: baseGame, error: baseGameError } = await supabase
    .schema("games_library")
    .from("games")
    .select("game_id, series_id")
    .eq("game_id", redirect.gameId)
    .maybeSingle();

  if (baseGameError || !baseGame) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }

  const [similarResult, seriesResult] = await Promise.all([
    supabase
      .schema("games_library")
      .from("game_similar_games")
      .select("similar_game_id")
      .eq("game_id", baseGame.game_id)
      .limit(SIMILAR_LIMIT),
    baseGame.series_id
      ? supabase
          .schema("games_library")
          .from("games")
          .select("game_id")
          .eq("series_id", baseGame.series_id)
          .neq("game_id", baseGame.game_id)
          .limit(SERIES_LIMIT)
      : Promise.resolve({ data: [] as { game_id: string }[], error: null }),
  ]);

  const similarIds = (similarResult.data ?? []).map((row) => row.similar_game_id as string);
  const seriesIds = (seriesResult.data ?? []).map((row) => row.game_id);

  const gamesById = await fetchFullGamesById([...similarIds, ...seriesIds]);

  const similar = similarIds.map((id) => gamesById.get(id)).filter((game) => game !== undefined);
  const series = seriesIds.map((id) => gamesById.get(id)).filter((game) => game !== undefined);

  return Response.json({ similar, series });
}
