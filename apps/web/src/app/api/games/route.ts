import { computeScore, searchQualityPenalty, searchTerms } from "@playfit/core";
import type { SeedGame } from "@playfit/core/types";
import { jsonError } from "@/lib/api-errors";
import { GAME_SELECT } from "@/lib/game-mapper";
import {
  fetchAliasCandidates,
  fetchSeriesCandidates,
  fetchTitleCandidates,
  type GameRow,
  mapRowsToSeedGames,
} from "@/lib/games-db";
import { createAnonClient } from "@/lib/supabase/server";

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
      return jsonError(error.message, 500);
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
    return jsonError(searchErrors[0] ?? "Unable to search games", 500);
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

    const partialSeedGame = {
      title: game.title,
      series: seriesName ?? "",
      aliases: game.aliases ?? [],
      tags: game.tags ?? [],
      genreId: game.genre_id ?? undefined,
      coverPath: game.cover_url ?? "",
    } as unknown as SeedGame;

    const penalty = searchQualityPenalty(partialSeedGame);
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
