import { jsonError } from "@/lib/api-errors";
import { resolveGameRedirect } from "@/lib/game-redirects";
import { captureApiError } from "@/lib/monitoring";
import { createAnonClient } from "@/lib/supabase/server";
import { fetchFullGamesById } from "../shared";

const SIMILAR_LIMIT = 20;
const SERIES_LIMIT = 20;

export const maxDuration = 30;

export async function POST(request: Request) {
  const { gameId } = (await request.json()) as { gameId: string };

  if (!gameId) {
    return jsonError("gameId is required", 400);
  }

  const supabase = createAnonClient();
  const redirect = await resolveGameRedirect(supabase, gameId);

  if (redirect.error) {
    captureApiError(new Error(redirect.error), {
      route: "/api/recommendations/similar",
      request,
      operation: "resolve_game_redirect",
      statusCode: 500,
    });
    return jsonError(redirect.error, 500);
  }

  const { data: baseGame, error: baseGameError } = await supabase
    .schema("games_library")
    .from("games")
    .select("game_id, series_id")
    .eq("game_id", redirect.gameId)
    .maybeSingle();

  if (baseGameError || !baseGame) {
    return jsonError("Game not found", 404);
  }

  try {
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
  } catch (error) {
    captureApiError(error, {
      route: "/api/recommendations/similar",
      request,
      operation: "fetch_similar_games",
      statusCode: 500,
    });
    return jsonError("Failed to load similar games", 500);
  }
}
