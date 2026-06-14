import { resolveGameRedirect } from "@/lib/game-redirects";
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
  release_label: string | null;
  series: unknown;
  genre: unknown;
}

interface PlatformJoinRow {
  platform_id: string;
  platforms: unknown;
}

interface AliasRow {
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

export async function GET(_request: Request, props: { params: Promise<{ gameId: string }> }) {
  const { gameId } = await props.params;

  const supabase = createAnonClient();
  const redirect = await resolveGameRedirect(supabase, gameId);

  if (redirect.error) {
    return Response.json({ error: redirect.error }, { status: 500 });
  }

  const { data: raw, error } = await supabase
    .schema("games_library")
    .from("games")
    .select(
      "game_id, title, aliases, series_id, genre_id, release_year, release_state, source_type, source_ref, cover_url, tags, notes, sort_date, release_label, series:series_id(name), genre:genre_id(name)",
    )
    .eq("game_id", redirect.gameId)
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const game = raw as GameRow | null;
  if (!game) {
    return Response.json({ error: "Game not found" }, { status: 404 });
  }

  const { data: rawPlatforms } = await supabase
    .schema("games_library")
    .from("game_platforms")
    .select("platform_id, platforms:platform_id(name)")
    .eq("game_id", redirect.gameId);

  const { data: rawAliases } = await supabase
    .schema("games_library")
    .from("game_aliases")
    .select("alias")
    .eq("game_id", redirect.gameId);

  const platformRows = (rawPlatforms ?? []) as PlatformJoinRow[];
  const platformIds = platformRows.map((p) => p.platform_id);
  const platformNames = platformRows
    .map((p) => resolveJoinedName(p.platforms) ?? p.platform_id)
    .filter(Boolean);

  const aliasList = ((rawAliases ?? []) as AliasRow[]).map((a) => a.alias);

  const seriesName = resolveJoinedName(game.series);
  const genreName = resolveJoinedName(game.genre);

  return Response.json({
    gameId: game.game_id,
    title: game.title,
    aliases: [...new Set([...(game.aliases ?? []), ...aliasList])],
    series: seriesName ?? game.series_id ?? "",
    seriesId: game.series_id ?? undefined,
    source: game.source_type as "catalog" | "universe" | "finder",
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
    releaseLabel: game.release_label || undefined,
  });
}
