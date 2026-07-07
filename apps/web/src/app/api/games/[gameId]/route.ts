import { jsonError } from "@/lib/api-errors";
import {
  GAME_PLATFORM_SELECT,
  GAME_SELECT,
  type GameAliasRow,
  type GamePlatformRow,
  type GameRow,
  mapGameRowToSeedGame,
} from "@/lib/game-mapper";
import { resolveGameRedirect } from "@/lib/game-redirects";
import { createAnonClient } from "@/lib/supabase/server";

export async function GET(_request: Request, props: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await props.params;

  const supabase = createAnonClient();
  const redirect = await resolveGameRedirect(supabase, gameId);

  if (redirect.error) {
    return jsonError(redirect.error, 500);
  }

  const { data: raw, error } = await supabase
    .schema("games_library")
    .from("games")
    .select(GAME_SELECT)
    .eq("game_id", redirect.gameId)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return jsonError("Game not found", 404);
    }
    return jsonError(error.message, 500);
  }

  const game = raw as GameRow | null;
  if (!game) {
    return jsonError("Game not found", 404);
  }

  const { data: rawPlatforms } = await supabase
    .schema("games_library")
    .from("game_platforms")
    .select(GAME_PLATFORM_SELECT)
    .eq("game_id", redirect.gameId);

  const { data: rawAliases } = await supabase
    .schema("games_library")
    .from("game_aliases")
    .select("alias")
    .eq("game_id", redirect.gameId);

  return Response.json(
    mapGameRowToSeedGame(
      game,
      (rawPlatforms ?? []) as GamePlatformRow[],
      (rawAliases ?? []) as GameAliasRow[],
    ),
  );
}
