import { buildAdaptiveProfile } from "@playfit/core/domain";
import { productGameStateSchema, productStateSchema } from "@playfit/core/schemas";
import type { SeedGame } from "@playfit/core/types";
import { z } from "zod";
import { adaptiveProfileResponseSchema } from "@/lib/api-contracts";
import { jsonData, jsonError } from "@/lib/api-errors";
import { GAME_PLATFORM_SELECT, GAME_SELECT, mapGameRowToSeedGame } from "@/lib/game-mapper";
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
  series: unknown;
  genre: unknown;
}

const profileRequestSchema = z
  .object({
    onboarding: productStateSchema.shape.user.shape.onboarding,
    gameStates: z.record(z.string(), productGameStateSchema),
  })
  .strict();

type ProfileRequest = z.infer<typeof profileRequestSchema>;

export const maxDuration = 30;

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError("Invalid JSON payload", 400);
  }

  const parsedBody = profileRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return Response.json(
      { error: "Invalid recommendations profile payload", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  const body: ProfileRequest = parsedBody.data;
  const { onboarding, gameStates } = body;

  const gameIds = new Set([
    ...onboarding.likedGameIds,
    ...(onboarding.dislikedGameIds ?? []),
    ...Object.keys(gameStates),
  ]);

  if (gameIds.size === 0) {
    const fallback = buildAdaptiveProfile(onboarding, new Map(), gameStates);
    return jsonData(adaptiveProfileResponseSchema, { profile: fallback });
  }

  const supabase = createAnonClient();

  const { data: rawGames, error } = await supabase
    .schema("games_library")
    .from("games")
    .select(GAME_SELECT)
    .in("game_id", [...gameIds]);

  if (error) {
    return jsonError(error.message, 500);
  }

  const games = (rawGames as GameRow[]) ?? [];

  const fetchedIds = games.map((g) => g.game_id);

  const [platformResult, aliasResult] = await Promise.all([
    supabase
      .schema("games_library")
      .from("game_platforms")
      .select(GAME_PLATFORM_SELECT)
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

  const gamesById = new Map<string, SeedGame>();
  for (const game of games) {
    gamesById.set(
      game.game_id,
      mapGameRowToSeedGame(
        game,
        platformsByGame.get(game.game_id) ?? [],
        (aliasesByGame.get(game.game_id) ?? []).map((a) => ({ alias: a })),
      ),
    );
  }

  const profile = buildAdaptiveProfile(onboarding, gamesById, gameStates);

  return jsonData(adaptiveProfileResponseSchema, { profile });
}
