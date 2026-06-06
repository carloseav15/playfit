import type { ProductPlatformOption, ProductSeedData, SeedGame } from "../types";
import { supabase } from "./supabase";

interface GameRow {
  game_id: string;
  title: string;
  aliases: string[];
  series: string;
  primary_genre: string;
  platforms: string[];
  platform_names: string[];
  release_year: string;
  release_state: string;
  source_type: string;
  source_ref: string;
  cover_url: string;
  tags: string[];
  notes: string;
  sort_date: string;
  release_label: string;
}

interface PlatformRow {
  id: string;
  name: string;
  rawg_id: number | null;
}

async function fetchGames(): Promise<GameRow[]> {
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

  return all;
}

async function fetchPlatforms(): Promise<PlatformRow[]> {
  const { data, error } = await supabase
    .schema("games_library")
    .from("platforms")
    .select("*")
    .order("id");
  if (error) throw new Error(`Failed to load platforms: ${error.message}`);
  return (data as PlatformRow[]) ?? [];
}

interface PlatformMeta {
  family: string;
  vendor: string;
  kind: ProductPlatformOption["kind"];
  gen: number;
}

function platformsToOptions(rows: PlatformRow[]): ProductPlatformOption[] {
  const known: Record<string, PlatformMeta> = {
    switch_2: { family: "nintendo", vendor: "Nintendo", kind: "hybrid", gen: 10 },
    ps5: { family: "playstation", vendor: "Sony", kind: "console", gen: 9 },
    xbox_series_xs: { family: "xbox", vendor: "Microsoft", kind: "console", gen: 9 },
    switch_1: { family: "nintendo", vendor: "Nintendo", kind: "hybrid", gen: 9 },
    ps4: { family: "playstation", vendor: "Sony", kind: "console", gen: 8 },
    xbox_one: { family: "xbox", vendor: "Microsoft", kind: "console", gen: 8 },
    wii_u: { family: "nintendo", vendor: "Nintendo", kind: "console", gen: 8 },
    "3ds": { family: "nintendo", vendor: "Nintendo", kind: "handheld", gen: 8 },
    ps_vita: { family: "playstation", vendor: "Sony", kind: "handheld", gen: 8 },
    ps3: { family: "playstation", vendor: "Sony", kind: "console", gen: 7 },
    xbox_360: { family: "xbox", vendor: "Microsoft", kind: "console", gen: 7 },
    wii: { family: "nintendo", vendor: "Nintendo", kind: "console", gen: 7 },
    psp: { family: "playstation", vendor: "Sony", kind: "handheld", gen: 7 },
    ds: { family: "nintendo", vendor: "Nintendo", kind: "handheld", gen: 7 },
    ps2: { family: "playstation", vendor: "Sony", kind: "console", gen: 6 },
    gamecube: { family: "nintendo", vendor: "Nintendo", kind: "console", gen: 6 },
    gba: { family: "nintendo", vendor: "Nintendo", kind: "handheld", gen: 6 },
    dreamcast: { family: "sega", vendor: "SEGA", kind: "console", gen: 6 },
    xbox_original: { family: "xbox", vendor: "Microsoft", kind: "console", gen: 6 },
    ps1: { family: "playstation", vendor: "Sony", kind: "console", gen: 5 },
    n64: { family: "nintendo", vendor: "Nintendo", kind: "console", gen: 5 },
    saturn: { family: "sega", vendor: "SEGA", kind: "console", gen: 5 },
    snes: { family: "nintendo", vendor: "Nintendo", kind: "console", gen: 4 },
    genesis: { family: "sega", vendor: "SEGA", kind: "console", gen: 4 },
    gbc: { family: "nintendo", vendor: "Nintendo", kind: "handheld", gen: 4 },
    nes: { family: "nintendo", vendor: "Nintendo", kind: "console", gen: 3 },
    gb: { family: "nintendo", vendor: "Nintendo", kind: "handheld", gen: 4 },
    pc: { family: "pc", vendor: "PC", kind: "computer", gen: 0 },
    macos: { family: "pc", vendor: "Apple", kind: "computer", gen: 0 },
    ios: { family: "apple", vendor: "Apple", kind: "other", gen: 0 },
    android: { family: "google", vendor: "Google", kind: "other", gen: 0 },
    linux: { family: "pc", vendor: "Linux", kind: "computer", gen: 0 },
    sega_master_system: { family: "sega", vendor: "SEGA", kind: "console", gen: 3 },
    neo_geo: { family: "snk", vendor: "SNK", kind: "console", gen: 4 },
    game_gear: { family: "sega", vendor: "SEGA", kind: "handheld", gen: 3 },
    atari_2600: { family: "atari", vendor: "Atari", kind: "console", gen: 2 },
  };

  return rows.map((row) => {
    const meta = known[row.id] ?? {
      family: "other",
      vendor: "Other",
      kind: "other" as const,
      gen: 99,
    };
    return {
      platformId: row.id,
      displayName: row.name,
      family: meta.family,
      kind: meta.kind,
      activeStatus: "active",
      sortOrder: meta.gen,
    };
  });
}

const SEED_CACHE_KEY = "playfit_seed_cache_v1";
const SEED_CACHE_TTL = 86_400_000; // 24 hours

function mapGames(gameRows: GameRow[], platformById: Map<string, ProductPlatformOption>) {
  return gameRows.map((row) => {
    const resolvedPlatformNames =
      row.platform_names.length > 0
        ? row.platform_names
        : row.platforms.map((id) => platformById.get(id)?.displayName ?? id).filter(Boolean);

    const releaseState = row.release_state === "unreleased" ? "unreleased" : "released";

    return {
      gameId: row.game_id,
      title: row.title,
      aliases: row.aliases ?? [],
      series: row.series ?? "",
      source: row.source_type as SeedGame["source"],
      primaryGenre: row.primary_genre || "unknown",
      tags: row.tags ?? [],
      notes: row.notes ?? "",
      coverPath: row.cover_url,
      externalCoverUrl: row.cover_url.startsWith("http") ? row.cover_url : undefined,
      releaseYear: row.release_year || undefined,
      sourceRef: row.source_ref || undefined,
      availablePlatformIds: row.platforms ?? [],
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

export async function loadProductSeedData(): Promise<ProductSeedData> {
  const cached = readSeedCache();
  let gameRows: GameRow[];
  let platformRows: PlatformRow[];

  if (cached) {
    gameRows = cached.gameRows;
    platformRows = cached.platformRows;
  } else {
    [gameRows, platformRows] = await Promise.all([fetchGames(), fetchPlatforms()]);
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
