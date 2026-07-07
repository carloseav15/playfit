import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  games: [] as GameRow[],
  aliases: [] as AliasRow[],
  platforms: [] as PlatformRow[],
  series: [] as SeriesRow[],
  ftsError: null as { message: string } | null,
}));

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

interface AliasRow {
  game_id: string;
  alias: string;
}

interface PlatformRow {
  game_id: string;
  platform_id: string;
  platforms: unknown;
}

interface SeriesRow {
  id: string;
  name: string;
}

interface QueryState {
  table: string;
  orderColumn?: string;
  count?: boolean;
  textSearch?: { column: string; query: string };
  ilike?: { column: string; pattern: string };
  inFilter?: { column: string; values: string[] };
  limit?: number;
}

vi.mock("@/lib/game-mapper", () => ({
  GAME_PLATFORM_SELECT: "game_id, platform_id, platforms:platform_ref(name)",
  GAME_SELECT:
    "game_id, title, aliases, series_id, genre_id, release_year, release_state, source_type, source_ref, cover_url, tags, notes, sort_date, series:series_ref(name), genre:genre_ref(name)",
  mapGameRowToSeedGame: vi.fn((game: GameRow) => ({
    gameId: game.game_id,
    title: game.title,
    aliases: game.aliases ?? [],
    series: "",
    seriesId: game.series_id ?? undefined,
    source: "catalog",
    primaryGenre: "RPG",
    genreId: game.genre_id ?? undefined,
    tags: game.tags ?? [],
    notes: game.notes,
    coverPath: game.cover_url,
    externalCoverUrl: undefined,
    releaseYear: game.release_year != null ? String(game.release_year) : undefined,
    sourceRef: game.source_ref || undefined,
    availablePlatformIds: [],
    availablePlatformNames: [],
    releaseState: "released",
    sortDate: game.sort_date ?? undefined,
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAnonClient: vi.fn(() => ({
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => createQuery(table)),
    })),
  })),
}));

function gameRow(gameId: string, title: string, overrides: Partial<GameRow> = {}): GameRow {
  return {
    game_id: gameId,
    title,
    aliases: null,
    series_id: null,
    genre_id: "rpg",
    release_year: 2006,
    release_state: "released",
    source_type: "catalog",
    source_ref: "",
    cover_url: "/covers/example.jpg",
    tags: ["story"],
    notes: "",
    sort_date: "2006-01-01",
    release_label: "2006",
    series: null,
    genre: { name: "RPG" },
    ...overrides,
  };
}

function createQuery(table: string) {
  const state: QueryState = { table };
  const builder = {
    select(_select: string, options?: { count?: "exact" }) {
      state.count = options?.count === "exact";
      return builder;
    },
    order(column: string) {
      state.orderColumn = column;
      return builder;
    },
    range(from: number, to: number) {
      const result = resolveQuery(state);
      return Promise.resolve({
        ...result,
        data: result.data?.slice(from, to + 1),
      });
    },
    textSearch(column: string, query: string) {
      state.textSearch = { column, query };
      return builder;
    },
    ilike(column: string, pattern: string) {
      state.ilike = { column, pattern };
      return builder;
    },
    in(column: string, values: string[]) {
      state.inFilter = { column, values };
      if (table === "games" && column === "series_id") {
        return {
          limit(limit: number) {
            state.limit = limit;
            return Promise.resolve(resolveQuery(state));
          },
        };
      }
      return Promise.resolve(resolveQuery(state));
    },
    limit(limit: number) {
      state.limit = limit;
      return Promise.resolve(resolveQuery(state));
    },
  };
  return builder;
}

interface QueryResult {
  data: (GameRow | AliasRow | PlatformRow | SeriesRow)[] | null;
  error: { message: string } | null;
  count?: number;
}

function resolveQuery(state: QueryState): QueryResult {
  if (state.table === "games") return resolveGamesQuery(state);
  if (state.table === "game_aliases") return resolveAliasQuery(state);
  if (state.table === "game_platforms") {
    return {
      data: mocks.platforms.filter((row) => state.inFilter?.values.includes(row.game_id)),
      error: null,
    };
  }
  if (state.table === "series") return resolveSeriesQuery(state);
  return { data: [], error: null };
}

function resolveGamesQuery(state: QueryState): QueryResult {
  if (state.textSearch) {
    if (mocks.ftsError) return { data: null, error: mocks.ftsError };
    return {
      data: mocks.games.filter((game) => matchesTerm(game.title, state.textSearch?.query ?? "")),
      error: null,
    };
  }

  let data = [...mocks.games];

  if (state.inFilter?.column === "game_id") {
    data = data.filter((game) => state.inFilter?.values.includes(game.game_id));
  }

  if (state.inFilter?.column === "series_id") {
    data = data.filter((game) => game.series_id && state.inFilter?.values.includes(game.series_id));
  }

  if (state.ilike?.column === "title") {
    data = data.filter((game) => matchesPattern(game.title, state.ilike?.pattern ?? ""));
  }

  if (state.orderColumn === "title") {
    data.sort((a, b) => a.title.localeCompare(b.title));
  }

  if (state.limit != null) data = data.slice(0, state.limit);

  return { data, error: null, count: mocks.games.length };
}

function resolveAliasQuery(state: QueryState): QueryResult {
  let data = [...mocks.aliases];

  if (state.inFilter?.column === "game_id") {
    data = data.filter((row) => state.inFilter?.values.includes(row.game_id));
  }

  if (state.ilike?.column === "alias") {
    data = data.filter((row) => matchesPattern(row.alias, state.ilike?.pattern ?? ""));
  }

  if (state.limit != null) data = data.slice(0, state.limit);

  return { data, error: null };
}

function resolveSeriesQuery(state: QueryState): QueryResult {
  let data = [...mocks.series];

  if (state.ilike?.column === "name") {
    data = data.filter((row) => matchesPattern(row.name, state.ilike?.pattern ?? ""));
  }

  if (state.limit != null) data = data.slice(0, state.limit);

  return { data, error: null };
}

function matchesPattern(value: string, pattern: string): boolean {
  return value.toLowerCase().includes(pattern.replaceAll("%", "").toLowerCase());
}

function matchesTerm(value: string, term: string): boolean {
  return value.toLowerCase().includes(term.toLowerCase());
}

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("games API route", () => {
  beforeEach(() => {
    mocks.games = [];
    mocks.aliases = [];
    mocks.platforms = [];
    mocks.series = [];
    mocks.ftsError = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to title search when search_document is missing", async () => {
    mocks.ftsError = { message: "column games.search_document does not exist" };
    mocks.series = [{ id: "final_fantasy", name: "Final Fantasy" }];
    mocks.games = [
      gameRow("final_fantasy_xii", "Final Fantasy XII", {
        series_id: "final_fantasy",
        series: { name: "Final Fantasy" },
      }),
    ];

    const { GET } = await loadRoute();
    const response = await GET(
      new Request("http://playfit.test/api/games?q=final%20fantasy%20XII"),
    );

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.games).toHaveLength(1);
    expect(json.games[0].gameId).toBe("final_fantasy_xii");
    expect(json.games[0].game_id).toBeUndefined();
  });

  it("matches roman numerals when the query uses numbers", async () => {
    mocks.ftsError = { message: "column games.search_document does not exist" };
    mocks.games = [gameRow("final_fantasy_xii", "Final Fantasy XII")];

    const { GET } = await loadRoute();
    const response = await GET(new Request("http://playfit.test/api/games?q=final%20fantasy%2012"));

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.games[0].gameId).toBe("final_fantasy_xii");
  });

  it("returns alias-only matches when search_document is missing", async () => {
    mocks.ftsError = { message: "column games.search_document does not exist" };
    mocks.games = [gameRow("final_fantasy_xii_zodiac", "Final Fantasy XII: The Zodiac Age")];
    mocks.aliases = [{ game_id: "final_fantasy_xii_zodiac", alias: "FFXII" }];

    const { GET } = await loadRoute();
    const response = await GET(new Request("http://playfit.test/api/games?q=ffxii"));

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.games[0].gameId).toBe("final_fantasy_xii_zodiac");
  });

  it("maps browse results to SeedGame shape", async () => {
    mocks.games = [gameRow("chrono_trigger", "Chrono Trigger")];

    const { GET } = await loadRoute();
    const response = await GET(new Request("http://playfit.test/api/games?page=1&pageSize=20"));

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.total).toBe(1);
    expect(json.games[0].gameId).toBe("chrono_trigger");
    expect(json.games[0].game_id).toBeUndefined();
  });
});
