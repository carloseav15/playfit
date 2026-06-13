import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductPlatformOption, ProductSeedData, SeedGame } from "../types";

// biome-ignore lint/suspicious/noExplicitAny: SupabaseClient generics are overly complex for our usage
type SeedSupabase = SupabaseClient<any, any, any, any, any>;

interface GameRow {
  game_id: string;
  title: string;
  aliases: string[];
  series_id: string | null;
  series_name?: string;
  genre_id: string | null;
  release_year: number | null;
  release_state: string;
  source_type: string;
  source_ref: string;
  cover_url: string;
  tags: string[];
  notes: string;
  sort_date: string | null;
  release_label: string;
  platforms?: string[];
  platform_names?: string[];
}

interface PlatformRow {
  id: string;
  name: string;
  rawg_id: number | null;
  family: string;
  vendor: string;
  kind: string;
  gen: number;
}

interface GamePlatformRow {
  game_id: string;
  platform_id: string;
  platforms: { name: string }[] | null;
}

async function fetchGames(supabase: SeedSupabase): Promise<GameRow[]> {
  const all: GameRow[] = [];
  const pageSize = 1000;
  let from = 0;
  let done = false;

  while (!done) {
    const { data, error } = await supabase
      .schema("games_library")
      .from("games")
      .select("*")
      .order("title")
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`Failed to load games: ${error.message}`);

    const batch = (data as GameRow[]) ?? [];
    all.push(...batch);
    from += pageSize;
    if (batch.length < pageSize) done = true;
  }

  const gpAll: GamePlatformRow[] = [];
  let gpFrom = 0;
  let gpDone = false;

  while (!gpDone) {
    const { data, error } = await supabase
      .schema("games_library")
      .from("game_platforms")
      .select("game_id, platform_id, platforms:platform_id(name)")
      .range(gpFrom, gpFrom + pageSize - 1);

    if (error) throw new Error(`Failed to load game platforms: ${error.message}`);

    const batch = (data as GamePlatformRow[]) ?? [];
    gpAll.push(...batch);
    gpFrom += pageSize;
    if (batch.length < pageSize) gpDone = true;
  }

  const platformsByGame = new Map<string, { ids: string[]; names: string[] }>();
  for (const row of gpAll) {
    const entry = platformsByGame.get(row.game_id) ?? { ids: [], names: [] };
    entry.ids.push(row.platform_id);
    const platformName = row.platforms?.[0]?.name ?? row.platform_id;
    entry.names.push(platformName);
    platformsByGame.set(row.game_id, entry);
  }

  for (const game of all) {
    const p = platformsByGame.get(game.game_id);
    game.platforms = p?.ids ?? [];
    game.platform_names = p?.names ?? [];
  }

  // Resolve tags from game_tags join table
  const gtAll: { game_id: string; tag_id: string }[] = [];
  let gtFrom = 0;
  let gtDone = false;

  while (!gtDone) {
    const { data, error } = await supabase
      .schema("games_library")
      .from("game_tags")
      .select("game_id, tag_id")
      .range(gtFrom, gtFrom + pageSize - 1);

    if (error) throw new Error(`Failed to load game tags: ${error.message}`);

    const batch = (data as { game_id: string; tag_id: string }[]) ?? [];
    gtAll.push(...batch);
    gtFrom += pageSize;
    if (batch.length < pageSize) gtDone = true;
  }

  const tagsByGame = new Map<string, string[]>();
  for (const row of gtAll) {
    const entry = tagsByGame.get(row.game_id) ?? [];
    entry.push(row.tag_id);
    tagsByGame.set(row.game_id, entry);
  }

  for (const game of all) {
    const gameTags = tagsByGame.get(game.game_id);
    if (gameTags) {
      game.tags = gameTags;
    }
  }

  // Resolve aliases from game_aliases join table
  const { data: gaData, error: gaError } = await supabase
    .schema("games_library")
    .from("game_aliases")
    .select("game_id, alias");

  if (gaError) throw new Error(`Failed to load game aliases: ${gaError.message}`);

  const aliasesByGame = new Map<string, string[]>();
  for (const row of (gaData as { game_id: string; alias: string }[]) ?? []) {
    const entry = aliasesByGame.get(row.game_id) ?? [];
    entry.push(row.alias);
    aliasesByGame.set(row.game_id, entry);
  }

  for (const game of all) {
    const gameAliases = aliasesByGame.get(game.game_id);
    if (gameAliases) {
      game.aliases = gameAliases;
    }
  }

  // Resolve series names from the series table
  const { data: seriesData, error: seriesError } = await supabase
    .schema("games_library")
    .from("series")
    .select("id, name");

  if (seriesError) throw new Error(`Failed to load series: ${seriesError.message}`);

  const seriesNames = new Map((seriesData ?? []).map((s) => [s.id, s.name]));
  for (const game of all) {
    if (game.series_id) {
      game.series_name = seriesNames.get(game.series_id) ?? "";
    }
  }

  return all;
}

async function fetchPlatforms(supabase: SeedSupabase): Promise<PlatformRow[]> {
  const { data, error } = await supabase
    .schema("games_library")
    .from("platforms")
    .select("*")
    .order("id");
  if (error) throw new Error(`Failed to load platforms: ${error.message}`);
  return (data as PlatformRow[]) ?? [];
}

function platformsToOptions(rows: PlatformRow[]): ProductPlatformOption[] {
  return rows.map((row) => ({
    platformId: row.id,
    displayName: row.name,
    family: row.family,
    kind: row.kind as ProductPlatformOption["kind"],
    activeStatus: "active",
    sortOrder: row.gen,
  }));
}

const SEED_CACHE_KEY = "playfit_seed_cache_v4";
const SEED_CACHE_TTL = 86_400_000; // 24 hours

function mapGames(gameRows: GameRow[], platformById: Map<string, ProductPlatformOption>) {
  return gameRows.map((row) => {
    const availablePlatformIds = row.platforms ?? [];
    const availablePlatformNames = row.platform_names ?? [];
    const resolvedPlatformNames =
      availablePlatformNames.length > 0
        ? availablePlatformNames
        : availablePlatformIds.map((id) => platformById.get(id)?.displayName ?? id).filter(Boolean);

    const releaseState = row.release_state === "unreleased" ? "unreleased" : "released";

    return {
      gameId: row.game_id,
      title: row.title,
      aliases: row.aliases ?? [],
      series: row.series_name ?? row.series_id ?? "",
      seriesId: row.series_id ?? undefined,
      source: row.source_type as SeedGame["source"],
      primaryGenre: row.genre_id ?? "unknown",
      genreId: row.genre_id ?? undefined,
      tags: row.tags ?? [],
      notes: row.notes ?? "",
      coverPath: row.cover_url,
      externalCoverUrl: row.cover_url.startsWith("http") ? row.cover_url : undefined,
      releaseYear: row.release_year != null ? String(row.release_year) : undefined,
      sourceRef: row.source_ref || undefined,
      availablePlatformIds: availablePlatformIds,
      availablePlatformNames: resolvedPlatformNames,
      releaseState,
      sortDate: row.sort_date || undefined,
      releaseLabel: row.release_label || undefined,
    } satisfies SeedGame;
  });
}

function readSeedCache(): { gameRows: GameRow[]; platformRows: PlatformRow[] } | null {
  try {
    const raw = localStorage.getItem(SEED_CACHE_KEY);
    if (!raw) return null;
    const { timestamp, gameRows, platformRows } = JSON.parse(raw);
    if (Date.now() - timestamp > SEED_CACHE_TTL) {
      localStorage.removeItem(SEED_CACHE_KEY);
      return null;
    }
    return { gameRows, platformRows };
  } catch {
    return null;
  }
}

function writeSeedCache(gameRows: GameRow[], platformRows: PlatformRow[]) {
  try {
    const payload = JSON.stringify({ timestamp: Date.now(), gameRows, platformRows });
    localStorage.setItem(SEED_CACHE_KEY, payload);
  } catch {
    // storage full or unavailable — silently ignore
  }
}

export async function loadProductSeedData(supabase: SeedSupabase): Promise<ProductSeedData> {
  const cached = readSeedCache();
  let gameRows: GameRow[];
  let platformRows: PlatformRow[];

  if (cached) {
    gameRows = cached.gameRows;
    platformRows = cached.platformRows;
  } else {
    [gameRows, platformRows] = await Promise.all([fetchGames(supabase), fetchPlatforms(supabase)]);
    writeSeedCache(gameRows, platformRows);
  }

  const platforms = platformsToOptions(platformRows);
  const platformById = new Map(platforms.map((row) => [row.platformId, row]));

  const allGames = mapGames(gameRows, platformById);
  const gamesById = new Map(allGames.map((row) => [row.gameId, row]));
  const catalogGames = allGames.filter((game) => game.source === "catalog");

  return {
    allGames,
    catalogGames,
    gamesById,
    platforms,
  };
}
