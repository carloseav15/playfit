import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCache: vi.fn(),
  loadRecommendationState: vi.fn(),
}));

vi.mock("@/lib/api-cache", () => ({
  getCache: mocks.getCache,
  setCache: vi.fn(),
}));
vi.mock("../shared", () => ({ loadRecommendationState: mocks.loadRecommendationState }));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("picks recommendations API route", () => {
  afterEach(() => vi.clearAllMocks());

  it("requires a recommendation session", async () => {
    mocks.loadRecommendationState.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Recommendation session required",
    });
    const { GET } = await loadRoute();

    const response = await GET(new Request("http://playfit.test/api/recommendations/picks"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Recommendation session required" });
  });

  it("returns no picks when the profile is incomplete", async () => {
    mocks.loadRecommendationState.mockResolvedValue({
      ok: true,
      userId: "user-1",
      state: {
        user: {
          profile: null,
          onboardingCompletedAt: null,
          gameStates: {},
        },
      },
      stateVersion: "v1",
    });
    const { GET } = await loadRoute();

    const response = await GET(new Request("http://playfit.test/api/recommendations/picks"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
    expect(mocks.getCache).not.toHaveBeenCalled();
  });

  it("returns no picks when the active pick set is empty", async () => {
    mocks.loadRecommendationState.mockResolvedValue({
      ok: true,
      userId: "user-1",
      state: {
        user: {
          profile: { ratedCount: 3 },
          onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
          gameStates: {},
        },
      },
      stateVersion: "v1",
    });
    const { GET } = await loadRoute();

    const response = await GET(new Request("http://playfit.test/api/recommendations/picks"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([]);
    expect(mocks.getCache).not.toHaveBeenCalled();
  });
});
