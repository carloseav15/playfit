import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  in: vi.fn(),
}));

vi.mock("@/lib/game-mapper", () => ({
  GAME_SELECT:
    "game_id, title, aliases, series_id, genre_id, release_year, release_state, source_type, source_ref, cover_url, tags, notes, sort_date, release_label, series:series_id(name), genre:genre_id(name)",
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
    releaseLabel: null,
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(() => ({
    schema: vi.fn(() => ({
      from: vi.fn(() => ({
        select: mocks.select,
      })),
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
    mocks.select.mockReturnValue({
      in: mocks.in,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns games for given IDs", async () => {
    const mockGames = [gameRow("zelda_tears"), gameRow("metroid_prime")];

    const platformPromise = Promise.resolve({
      data: [{ game_id: "zelda_tears", platform_id: "switch_2", platforms: { name: "Switch 2" } }],
      error: null,
    });

    const aliasPromise = Promise.resolve({
      data: [{ game_id: "zelda_tears", alias: "Zelda: Tears of the Kingdom" }],
      error: null,
    });

    const inFn = vi.fn();
    inFn.mockImplementation((_col: string, _ids: string[]) => {
      if (mockGames.length > 0) {
        const data = mockGames.splice(0);
        mockGames.length = 0;
        return Promise.resolve({ data, error: null });
      }
      return platformPromise;
    });
    inFn.mockReturnValueOnce(Promise.resolve({ data: mockGames, error: null }));
    inFn.mockReturnValueOnce(platformPromise);
    inFn.mockReturnValueOnce(aliasPromise);

    mocks.in.mockImplementation(inFn);

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
    mocks.select.mockReturnValue({
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    });

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
