import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirectsIn: vi.fn(),
  gamesIn: vi.fn(),
  platformsIn: vi.fn(),
  aliasesIn: vi.fn(),
}));

vi.mock("@/lib/game-mapper", () => ({
  GAME_PLATFORM_SELECT: "game_id, platform_id, platforms:platform_ref(name)",
  GAME_SELECT:
    "game_id, title, aliases, series_id, genre_id, release_year, release_state, source_type, source_ref, cover_url, tags, notes, sort_date, series:series_ref(name), genre:genre_ref(name)",
  mapGameRowToSeedGame: vi.fn((game: { game_id: string; title: string }) => ({
    gameId: game.game_id,
    title: game.title,
    aliases: [],
    series: "",
    seriesId: null,
    source: "catalog",
    primaryGenre: "unknown",
    genreId: null,
    tags: [],
    notes: "",
    coverPath: "",
    externalCoverUrl: null,
    releaseYear: null,
    sourceRef: null,
    availablePlatformIds: [],
    availablePlatformNames: [],
    releaseState: "released",
    sortDate: null,
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAnonClient: vi.fn(() => ({
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table === "game_redirects") {
          return { select: vi.fn(() => ({ in: mocks.redirectsIn })) };
        }
        if (table === "game_platforms") {
          return { select: vi.fn(() => ({ in: mocks.platformsIn })) };
        }
        if (table === "game_aliases") {
          return { select: vi.fn(() => ({ in: mocks.aliasesIn })) };
        }
        return { select: vi.fn(() => ({ in: mocks.gamesIn })) };
      }),
    })),
  })),
}));

function gameRow(gameId: string) {
  return {
    game_id: gameId,
    title: gameId.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
    aliases: null,
    series_id: null,
    genre_id: null,
    release_year: 2023,
    release_state: "released",
    source_type: "catalog",
    source_ref: "",
    cover_url: "",
    tags: [],
    notes: "",
    sort_date: "2023-01-01",
    release_label: "2023",
    series: null,
    genre: null,
  };
}

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("games batch API route", () => {
  beforeEach(() => {
    mocks.redirectsIn.mockResolvedValue({ data: [], error: null });
    mocks.gamesIn.mockResolvedValue({ data: [], error: null });
    mocks.platformsIn.mockResolvedValue({ data: [], error: null });
    mocks.aliasesIn.mockResolvedValue({ data: [], error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns games for given IDs", async () => {
    const mockGames = [gameRow("zelda_tears"), gameRow("metroid_prime")];

    mocks.gamesIn.mockResolvedValue({ data: mockGames, error: null });
    mocks.platformsIn.mockResolvedValue({
      data: [{ game_id: "zelda_tears", platform_id: "switch_2", platforms: { name: "Switch 2" } }],
      error: null,
    });
    mocks.aliasesIn.mockResolvedValue({
      data: [{ game_id: "zelda_tears", alias: "Zelda: Tears of the Kingdom" }],
      error: null,
    });

    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/games/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameIds: ["zelda_tears", "metroid_prime"] }),
      }),
    );

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.games).toHaveLength(2);
    expect(json.games[0].gameId).toBe("zelda_tears");
    expect(json.games[1].gameId).toBe("metroid_prime");
    expect(mocks.redirectsIn).toHaveBeenCalledWith("from_game_id", [
      "zelda_tears",
      "metroid_prime",
    ]);
    expect(mocks.gamesIn).toHaveBeenCalledWith("game_id", ["zelda_tears", "metroid_prime"]);
  });

  it("returns canonical games for redirected IDs", async () => {
    mocks.redirectsIn.mockResolvedValue({
      data: [{ from_game_id: "old_zelda_tears", to_game_id: "zelda_tears" }],
      error: null,
    });
    mocks.gamesIn.mockResolvedValue({ data: [gameRow("zelda_tears")], error: null });

    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/games/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameIds: ["old_zelda_tears"] }),
      }),
    );

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.games).toHaveLength(1);
    expect(json.games[0].gameId).toBe("zelda_tears");
    expect(mocks.gamesIn).toHaveBeenCalledWith("game_id", ["zelda_tears"]);
  });

  it("returns empty array for empty input", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/games/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameIds: [] }),
      }),
    );

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.games).toEqual([]);
  });

  it("rejects malformed game id payloads", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/games/batch", {
        method: "POST",
        body: JSON.stringify({ gameIds: ["valid", 42] }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "gameIds must be an array of strings",
    });
  });

  it("rejects more than 500 IDs", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/games/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameIds: Array.from({ length: 501 }, (_, i) => `game_${i}`) }),
      }),
    );

    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json.error).toContain("Too many");
  });

  it("handles missing games gracefully", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/games/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameIds: ["nonexistent_game"] }),
      }),
    );

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.games).toEqual([]);
  });
});
