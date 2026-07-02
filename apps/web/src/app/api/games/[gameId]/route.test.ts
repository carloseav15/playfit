import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirectsIn: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  platformsEq: vi.fn(),
  aliasesEq: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAnonClient: vi.fn(() => ({
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => {
        if (table === "game_redirects") {
          return { select: vi.fn(() => ({ in: mocks.redirectsIn })) };
        }
        if (table === "game_platforms") {
          return { select: vi.fn(() => ({ eq: mocks.platformsEq })) };
        }
        if (table === "game_aliases") {
          return { select: vi.fn(() => ({ eq: mocks.aliasesEq })) };
        }
        return { select: vi.fn(() => ({ eq: mocks.eq, single: mocks.single })) };
      }),
    })),
  })),
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("game detail API route", () => {
  beforeEach(() => {
    mocks.redirectsIn.mockResolvedValue({ data: [], error: null });
    mocks.eq.mockReturnValue({ single: mocks.single });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns a game by ID", async () => {
    mocks.single.mockResolvedValue({
      data: {
        game_id: "zelda_tears",
        title: "The Legend of Zelda: Tears of the Kingdom",
        aliases: ["Zelda TOTK"],
        series_id: "the_legend_of_zelda",
        genre_id: "action_adventure",
        release_year: 2023,
        release_state: "released",
        source_type: "catalog",
        source_ref: "",
        cover_url: "/covers/zelda_tears.jpg",
        tags: ["open_world", "puzzle"],
        notes: "",
        sort_date: "2023-05-12",
        release_label: "2023",
        series: [{ name: "The Legend of Zelda" }],
        genre: [{ name: "Action-Adventure" }],
      },
      error: null,
    });

    mocks.platformsEq.mockResolvedValue({
      data: [{ platform_id: "switch_2", platforms: { name: "Switch 2" } }],
      error: null,
    });

    mocks.aliasesEq.mockResolvedValue({
      data: [{ alias: "Zelda TOTK alt" }],
      error: null,
    });

    const { GET } = await loadRoute();
    const response = await GET(new Request("http://playfit.test/api/games/zelda_tears"), {
      params: Promise.resolve({ gameId: "zelda_tears" }),
    });

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.gameId).toBe("zelda_tears");
    expect(json.title).toBe("The Legend of Zelda: Tears of the Kingdom");
    expect(json.series).toBe("The Legend of Zelda");
    expect(json.primaryGenre).toBe("Action-Adventure");
    expect(json.availablePlatformIds).toEqual(["switch_2"]);
    expect(json.aliases).toContain("Zelda TOTK");
    expect(json.aliases).toContain("Zelda TOTK alt");
  });

  it("resolves redirected game IDs before loading details", async () => {
    mocks.redirectsIn.mockResolvedValue({
      data: [{ from_game_id: "old_zelda_tears", to_game_id: "zelda_tears" }],
      error: null,
    });
    mocks.single.mockResolvedValue({
      data: {
        game_id: "zelda_tears",
        title: "The Legend of Zelda: Tears of the Kingdom",
        aliases: [],
        series_id: "the_legend_of_zelda",
        genre_id: "action_adventure",
        release_year: 2023,
        release_state: "released",
        source_type: "catalog",
        source_ref: "",
        cover_url: "/covers/zelda_tears.jpg",
        tags: [],
        notes: "",
        sort_date: "2023-05-12",
        release_label: "2023",
        series: [{ name: "The Legend of Zelda" }],
        genre: [{ name: "Action-Adventure" }],
      },
      error: null,
    });
    mocks.platformsEq.mockResolvedValue({ data: [], error: null });
    mocks.aliasesEq.mockResolvedValue({ data: [], error: null });

    const { GET } = await loadRoute();
    const response = await GET(new Request("http://playfit.test/api/games/old_zelda_tears"), {
      params: Promise.resolve({ gameId: "old_zelda_tears" }),
    });

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.gameId).toBe("zelda_tears");
    expect(mocks.redirectsIn).toHaveBeenCalledWith("from_game_id", ["old_zelda_tears"]);
    expect(mocks.eq).toHaveBeenCalledWith("game_id", "zelda_tears");
    expect(mocks.platformsEq).toHaveBeenCalledWith("game_id", "zelda_tears");
    expect(mocks.aliasesEq).toHaveBeenCalledWith("game_id", "zelda_tears");
  });

  it("returns 404 when game not found", async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "Cannot coerce the result to a single JSON object" },
    });

    const { GET } = await loadRoute();
    const response = await GET(new Request("http://playfit.test/api/games/nonexistent"), {
      params: Promise.resolve({ gameId: "nonexistent" }),
    });

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe("Game not found");
  });

  it("keeps unexpected database failures as server errors", async () => {
    mocks.single.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "Database unavailable" },
    });

    const { GET } = await loadRoute();
    const response = await GET(new Request("http://playfit.test/api/games/celeste"), {
      params: Promise.resolve({ gameId: "celeste" }),
    });

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe("Database unavailable");
  });
});
