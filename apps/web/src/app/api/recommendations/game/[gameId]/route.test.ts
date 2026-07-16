import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadRecommendationState: vi.fn(),
  scoreOneGame: vi.fn(),
}));

vi.mock("../../shared", () => ({
  loadRecommendationState: mocks.loadRecommendationState,
  scoreOneGame: mocks.scoreOneGame,
}));

const request = (gameId = "hades") =>
  new Request(`http://playfit.test/api/recommendations/game/${gameId}`);

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("game recommendation API route", () => {
  beforeEach(() => {
    mocks.loadRecommendationState.mockResolvedValue({
      ok: true,
      userId: "user-1",
      state: { version: 2 },
      stateVersion: "2026-01-01T00:00:00.000Z",
    });
    mocks.scoreOneGame.mockResolvedValue({
      game: { gameId: "hades", title: "Hades" },
      score: 88,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the scored game and state version", async () => {
    const { GET } = await loadRoute();
    const response = await GET(request("hades"), { params: Promise.resolve({ gameId: "hades" }) });

    await expect(response.json()).resolves.toEqual({
      entry: {
        game: { gameId: "hades", title: "Hades" },
        score: 88,
      },
      stateVersion: "2026-01-01T00:00:00.000Z",
    });
    expect(response.status).toBe(200);
    expect(mocks.loadRecommendationState).toHaveBeenCalledWith(expect.any(Request));
    expect(mocks.scoreOneGame).toHaveBeenCalledWith({
      gameId: "hades",
      state: { version: 2 },
    });
  });

  it("requires a valid recommendation session", async () => {
    mocks.loadRecommendationState.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Recommendation session required",
    });
    const { GET } = await loadRoute();

    const response = await GET(request(), { params: Promise.resolve({ gameId: "hades" }) });

    await expect(response.json()).resolves.toEqual({ error: "Recommendation session required" });
    expect(response.status).toBe(401);
    expect(mocks.scoreOneGame).not.toHaveBeenCalled();
  });

  it("returns not found when the game cannot be scored", async () => {
    mocks.scoreOneGame.mockResolvedValue(null);
    const { GET } = await loadRoute();

    const response = await GET(request("missing-game"), {
      params: Promise.resolve({ gameId: "missing-game" }),
    });

    await expect(response.json()).resolves.toEqual({ error: "Recommendation game not found" });
    expect(response.status).toBe(404);
  });
});
