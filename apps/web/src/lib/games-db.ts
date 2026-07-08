import { computeScore } from "@playfit/core";
import type { SeedGame } from "@playfit/core/types";
import { GAME_PLATFORM_SELECT, GAME_SELECT, mapGameRowToSeedGame } from "@/lib/game-mapper";
import type { createAnonClient } from "@/lib/supabase/server";

export interface GameRow {
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

export interface PlatformJoinRow {
  game_id: string;
  platform_id: string;
  platforms: unknown;
}

export interface AliasJoinRow {
  game_id: string;
  alias: string;
}

export type SupabaseClient = ReturnType<typeof createAnonClient>;

export interface CandidateResult {
  rows: GameRow[];
  scoresById?: Map<string, number>;
  ok: boolean;
  errors: string[];
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export async function mapRowsToSeedGames(
  supabase: SupabaseClient,
  games: GameRow[],
): Promise<SeedGame[]> {
  if (games.length === 0) return [];

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

  return games.map((game) =>
    mapGameRowToSeedGame(
      game,
      platformsByGame.get(game.game_id) ?? [],
      (aliasesByGame.get(game.game_id) ?? []).map((alias) => ({ alias })),
    ),
  );
}

export async function fetchGamesByIds(
  supabase: SupabaseClient,
  gameIds: string[],
): Promise<CandidateResult> {
  const ids = unique(gameIds);
  if (ids.length === 0) return { rows: [], ok: true, errors: [] };

  const { data, error } = await supabase
    .schema("games_library")
    .from("games")
    .select(GAME_SELECT)
    .in("game_id", ids);

  if (error) return { rows: [], ok: false, errors: [error.message] };
  return { rows: (data as GameRow[]) ?? [], ok: true, errors: [] };
}

export async function fetchTitleCandidates(
  supabase: SupabaseClient,
  terms: string[],
): Promise<CandidateResult> {
  const results = await Promise.all(
    terms.map((term) =>
      supabase
        .schema("games_library")
        .from("games")
        .select(GAME_SELECT)
        .ilike("title", `%${term}%`)
        .limit(120),
    ),
  );

  const rows: GameRow[] = [];
  const errors: string[] = [];
  let ok = false;

  for (const result of results) {
    if (result.error) {
      errors.push(result.error.message);
      continue;
    }
    ok = true;
    rows.push(...((result.data as GameRow[]) ?? []));
  }

  return { rows, ok, errors };
}

export async function fetchAliasCandidates(
  supabase: SupabaseClient,
  terms: string[],
  query: string,
): Promise<CandidateResult> {
  const results = await Promise.all(
    terms.map((term) =>
      supabase
        .schema("games_library")
        .from("game_aliases")
        .select("game_id, alias")
        .ilike("alias", `%${term}%`)
        .limit(120),
    ),
  );

  const errors: string[] = [];
  const gameIds: string[] = [];
  const scoresById = new Map<string, number>();
  let ok = false;

  for (const result of results) {
    if (result.error) {
      errors.push(result.error.message);
      continue;
    }
    ok = true;
    for (const row of (result.data as AliasJoinRow[]) ?? []) {
      gameIds.push(row.game_id);
      scoresById.set(
        row.game_id,
        Math.max(scoresById.get(row.game_id) ?? 0, computeScore(row.alias, query) - 8),
      );
    }
  }

  const gamesResult = await fetchGamesByIds(supabase, gameIds);
  return {
    rows: gamesResult.rows,
    scoresById,
    ok: ok && gamesResult.ok,
    errors: [...errors, ...gamesResult.errors],
  };
}

export async function fetchSeriesCandidates(
  supabase: SupabaseClient,
  terms: string[],
): Promise<CandidateResult> {
  const results = await Promise.all(
    terms.map((term) =>
      supabase
        .schema("games_library")
        .from("series")
        .select("id")
        .ilike("name", `%${term}%`)
        .limit(50),
    ),
  );

  const errors: string[] = [];
  const seriesIds: string[] = [];
  let ok = false;

  for (const result of results) {
    if (result.error) {
      errors.push(result.error.message);
      continue;
    }
    ok = true;
    for (const row of (result.data as { id: string }[]) ?? []) {
      seriesIds.push(row.id);
    }
  }

  const ids = unique(seriesIds);
  if (ids.length === 0) return { rows: [], ok, errors };

  const { data, error } = await supabase
    .schema("games_library")
    .from("games")
    .select(GAME_SELECT)
    .in("series_id", ids)
    .limit(120);

  if (error) return { rows: [], ok, errors: [...errors, error.message] };
  return { rows: (data as GameRow[]) ?? [], ok: true, errors };
}
