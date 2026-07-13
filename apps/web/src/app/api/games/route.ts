import { computeScore, searchQualityPenalty, searchTerms } from "@playfit/core";
import type { SeedGame } from "@playfit/core/types";
import { jsonError } from "@/lib/api-errors";
import { GAME_SELECT, resolveJoinedName } from "@/lib/game-mapper";
import {
  fetchAliasCandidates,
  fetchSeriesCandidates,
  fetchTitleCandidates,
  filterGameIdsByPlatform,
  type GameRow,
  mapRowsToSeedGames,
} from "@/lib/games-db";
import { createAnonClient } from "@/lib/supabase/server";

function parseCsvParam(value: string | null): string[] {
  return value
    ? value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
    : [];
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const genreIds = parseCsvParam(searchParams.get("genre"));
  const platformIds = parseCsvParam(searchParams.get("platform"));

  const supabase = createAnonClient();

  if (!query) {
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize")) || 50));
    const from = (page - 1) * pageSize;

    // A platform can have thousands of games, so filtering catalog-wide can't pre-fetch
    // matching game_ids into an .in() clause (blows past the URL length limit). Use a
    // game_platforms!inner(...) embedded-resource filter instead -- verified against the
    // live schema to produce correct count: "exact" with no duplicate-row fan-out, since
    // game_platforms has a real FK (unlike the genre_id/series_id text-column PGRST200
    // landmine noted on GAME_SELECT).
    const select =
      platformIds.length > 0 ? `${GAME_SELECT}, game_platforms!inner(platform_id)` : GAME_SELECT;

    let baseQuery = supabase
      .schema("games_library")
      .from("games")
      .select(select, { count: "exact" })
      .order("title");

    if (genreIds.length > 0) baseQuery = baseQuery.in("genre_id", genreIds);
    if (platformIds.length > 0) baseQuery = baseQuery.in("game_platforms.platform_id", platformIds);

    const { data, error, count } = await baseQuery.range(from, from + pageSize - 1);

    if (error) {
      return jsonError(error.message, 500);
    }

    // The select string is built conditionally (not a literal), so supabase-js's typed
    // select-string parser can't statically infer columns here -- cast via unknown, same
    // as the game_platforms embed elsewhere in this file.
    const games = await mapRowsToSeedGames(supabase, (data as unknown as GameRow[]) ?? []);

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
    return Response.json({ games: [], total: 0, page: 1, pageSize: 24 });
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

  // Apply platform/genre filters before scoring, not after -- otherwise the top-N
  // cap below would be computed over the unfiltered set and legitimate filtered
  // matches could get dropped even though they scored well. The candidate pool
  // here (seen) is already bounded (FTS capped at 100, title/alias/series candidates
  // capped per term), so scoping the platform lookup to just these game_ids keeps
  // the .in() clause small -- unlike the catalog-wide browse case above.
  if (platformIds.length > 0) {
    const platformFilter = await filterGameIdsByPlatform(supabase, [...seen.keys()], platformIds);
    if (!platformFilter.ok) {
      return jsonError(platformFilter.errors[0] ?? "Unable to filter by platform", 500);
    }
    const matchedIds = new Set(platformFilter.gameIds);
    for (const gameId of seen.keys()) {
      if (!matchedIds.has(gameId)) seen.delete(gameId);
    }
  }
  if (genreIds.length > 0) {
    for (const [gameId, game] of seen) {
      if (!game.genre_id || !genreIds.includes(game.genre_id)) seen.delete(gameId);
    }
  }

  const scored: Array<{ game: GameRow; score: number }> = [];

  for (const game of seen.values()) {
    const seriesName = resolveJoinedName(game.series);
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

  // scored is drawn from a bounded candidate pool (FTS capped at 100 rows, title/alias/
  // series candidates capped per term) -- total below is the size of that pool after
  // filtering/scoring, not a true catalog-wide count. Deep pagination past it isn't
  // meaningful for a fuzzy search; page/pageSize just slice within this bounded set.
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(60, Math.max(1, Number(searchParams.get("pageSize")) || 24));
  const from = (page - 1) * pageSize;
  const pageItems = scored.slice(from, from + pageSize);

  const games = await mapRowsToSeedGames(
    supabase,
    pageItems.map(({ game }) => game),
  );

  return Response.json({
    games,
    total: scored.length,
    page,
    pageSize,
  });
}
