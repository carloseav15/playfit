import type { SeedGame } from "@playfit/core/types";
import { GAME_PLATFORM_SELECT, GAME_SELECT, mapGameRowToSeedGame } from "@/lib/game-mapper";
import { createAnonClient } from "@/lib/supabase/server";

const LOW_QUALITY_TERMS = [
  "bonus disc",
  "classic nes series",
  "collector's edition",
  "demo",
  "demo disc",
  "not for resale",
  "picross",
  "soundtrack",
  "wii u",
];

function qualityPenalty(
  title: string,
  hasTags: boolean,
  hasGenre: boolean,
  hasCover: boolean,
): number {
  let penalty = 0;
  const lower = title.toLowerCase();
  for (const term of LOW_QUALITY_TERMS) {
    if (lower.includes(term)) penalty += 22;
  }
  if (!hasTags) penalty += 20;
  if (!hasGenre) penalty += 16;
  if (!hasCover) penalty += 6;
  return penalty;
}

const ROMAN_TO_NUMBER: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
  xi: "11",
  xii: "12",
  xiii: "13",
  xiv: "14",
  xv: "15",
  xvi: "16",
};

const NUMBER_TO_ROMAN = Object.fromEntries(
  Object.entries(ROMAN_TO_NUMBER).map(([roman, number]) => [number, roman]),
);

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function swapNumberTokens(value: string, lookup: Record<string, string>): string {
  return value
    .split(" ")
    .map((token) => lookup[token] ?? token)
    .join(" ");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function textVariants(value: string): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return unique([
    normalized,
    swapNumberTokens(normalized, ROMAN_TO_NUMBER),
    swapNumberTokens(normalized, NUMBER_TO_ROMAN),
  ]);
}

function searchTerms(value: string): string[] {
  const variants = textVariants(value);
  const tokens = variants
    .flatMap((variant) => variant.split(" "))
    .filter((token) => token.length >= 3)
    .sort((a, b) => b.length - a.length);

  return unique([...variants, ...tokens]).slice(0, 8);
}

function computeScore(title: string, query: string): number {
  let score = 0;
  for (const valueVariant of textVariants(title)) {
    const valueTokens = new Set(valueVariant.split(" "));
    for (const queryVariant of textVariants(query)) {
      const queryTokens = queryVariant.split(" ").filter(Boolean);
      if (valueVariant === queryVariant) score = Math.max(score, 160);
      else if (valueVariant.startsWith(queryVariant)) score = Math.max(score, 126);
      else if (valueVariant.includes(queryVariant)) score = Math.max(score, 96);
      else if (queryTokens.length > 1 && queryTokens.every((token) => valueTokens.has(token))) {
        score = Math.max(score, 72);
      }
    }
  }
  return score;
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

type SupabaseClient = ReturnType<typeof createAnonClient>;

interface CandidateResult {
  rows: GameRow[];
  scoresById?: Map<string, number>;
  ok: boolean;
  errors: string[];
}

async function mapRowsToSeedGames(supabase: SupabaseClient, games: GameRow[]): Promise<SeedGame[]> {
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

async function fetchGamesByIds(
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

async function fetchTitleCandidates(
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

async function fetchAliasCandidates(
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

async function fetchSeriesCandidates(
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 50));
  const from = (page - 1) * pageSize;

  const supabase = createAnonClient();

  if (!query) {
    const baseQuery = supabase
      .schema("games_library")
      .from("games")
      .select(GAME_SELECT, { count: "exact" })
      .order("title");

    const { data, error, count } = await baseQuery.range(from, from + pageSize - 1);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const games = await mapRowsToSeedGames(supabase, (data as GameRow[]) ?? []);

    return Response.json({
      games,
      total: count ?? 0,
      page,
      pageSize,
    });
  }

  const sanitized = query.replace(/[^a-zA-Z0-9 ]/g, "").trim();
  const terms = searchTerms(sanitized);
  if (terms.length === 0) {
    return Response.json({ games: [], total: 0, page: 1, pageSize: 12 });
  }

  const ftsPromise = supabase
    .schema("games_library")
    .from("games")
    .select(GAME_SELECT)
    .textSearch("search_document", sanitized, { config: "english" })
    .limit(100);

  const [ftsResult, titleResult, aliasResult, seriesResult] = await Promise.all([
    ftsPromise,
    fetchTitleCandidates(supabase, terms),
    fetchAliasCandidates(supabase, terms, query),
    fetchSeriesCandidates(supabase, terms),
  ]);

  const searchErrors = [
    ftsResult.error?.message,
    ...titleResult.errors,
    ...aliasResult.errors,
    ...seriesResult.errors,
  ].filter(Boolean);

  const anySearchSucceeded =
    !ftsResult.error || titleResult.ok || aliasResult.ok || seriesResult.ok;
  if (!anySearchSucceeded) {
    return Response.json({ error: searchErrors[0] ?? "Unable to search games" }, { status: 500 });
  }

  const seen = new Map<string, GameRow>();
  const addRows = (games: GameRow[]) => {
    for (const game of games) {
      if (!seen.has(game.game_id)) seen.set(game.game_id, game);
    }
  };

  if (!ftsResult.error) addRows((ftsResult.data as GameRow[]) ?? []);
  addRows(titleResult.rows);
  addRows(aliasResult.rows);
  addRows(seriesResult.rows);

  const scored: Array<{ game: GameRow; score: number }> = [];

  for (const game of seen.values()) {
    const seriesName = resolveName(game.series);
    const titleScore = computeScore(game.title, query);
    const aliasScore = Math.max(
      aliasResult.scoresById?.get(game.game_id) ?? 0,
      ...(game.aliases ?? []).map((alias) => computeScore(alias, query) - 8),
    );
    const seriesScore = seriesName ? computeScore(seriesName, query) - 18 : 0;
    const penalty = qualityPenalty(
      game.title,
      (game.tags?.length ?? 0) > 0,
      game.genre_id != null && game.genre_id !== "unknown",
      !!game.cover_url,
    );
    const score = Math.max(titleScore, aliasScore, seriesScore) - penalty;
    if (score > 0) scored.push({ game, score });
  }

  scored.sort((a, b) => b.score - a.score || a.game.title.localeCompare(b.game.title));

  const top = scored.slice(0, 12);
  const games = await mapRowsToSeedGames(
    supabase,
    top.map(({ game }) => game),
  );

  return Response.json({
    games,
    total: top.length,
    page: 1,
    pageSize: 12,
  });
}

function resolveName(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" && "name" in first
      ? (first as { name: string }).name
      : null;
  }
  return typeof value === "object" && "name" in value ? (value as { name: string }).name : null;
}
