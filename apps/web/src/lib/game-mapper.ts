import type { SeedGame } from "@playfit/core/types";

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
  series?: unknown;
  genre?: unknown;
}

export interface GamePlatformRow {
  game_id?: string;
  platform_id: string;
  platforms: unknown;
}

export interface GameAliasRow {
  game_id?: string;
  alias: string;
}

function resolveJoinedName(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const first = value[0];
    return first && typeof first === "object" && "name" in first
      ? (first as { name: string }).name
      : null;
  }
  return typeof value === "object" && "name" in value ? (value as { name: string }).name : null;
}

export function mapGameRowToSeedGame(
  game: GameRow,
  platforms: GamePlatformRow[],
  aliases: GameAliasRow[],
): SeedGame {
  const platformIds = platforms.map((p) => p.platform_id);
  const platformNames = platforms
    .map((p) => resolveJoinedName(p.platforms) ?? p.platform_id)
    .filter(Boolean);

  const seriesName = resolveJoinedName(game.series);
  const genreName = resolveJoinedName(game.genre);

  return {
    gameId: game.game_id,
    title: game.title,
    aliases: [...new Set([...(game.aliases ?? []), ...aliases.map((a) => a.alias)])],
    series: seriesName ?? game.series_id ?? "",
    seriesId: game.series_id ?? undefined,
    source: game.source_type as SeedGame["source"],
    primaryGenre: genreName ?? game.genre_id ?? "unknown",
    genreId: game.genre_id ?? undefined,
    tags: game.tags ?? [],
    notes: game.notes ?? "",
    coverPath: game.cover_url,
    externalCoverUrl: game.cover_url?.startsWith("http") ? game.cover_url : undefined,
    releaseYear: game.release_year != null ? String(game.release_year) : undefined,
    sourceRef: game.source_ref || undefined,
    availablePlatformIds: platformIds,
    availablePlatformNames: platformNames,
    releaseState: game.release_state === "unreleased" ? "unreleased" : "released",
    sortDate: game.sort_date || undefined,
  };
}

// series_id/genre_id (text) have no FK constraint -- the real FK is on
// series_ref/genre_ref (bigint, see games_series_ref_fkey/games_genre_ref_fkey).
// Embedding via series_id/genre_id fails PostgREST's relationship lookup
// entirely (PGRST200), silently returning an empty result from any caller.
// Keep this shared select aligned with the live schema; display labels are
// derived from release_year rather than stored separately.
export const GAME_SELECT = `
  game_id, title, aliases, series_id, genre_id, release_year,
  release_state, source_type, source_ref, cover_url, tags,
  notes, sort_date,
  series:series_ref(name),
  genre:genre_ref(name)
`;

export const GAME_PLATFORM_SELECT = "game_id, platform_id, platforms:platform_ref(name)";
