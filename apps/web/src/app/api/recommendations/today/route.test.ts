import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildPlayNextModel: vi.fn(),
  loadRecommendationState: vi.fn(),
}));

vi.mock("../shared", () => ({
  buildPlayNextModel: mocks.buildPlayNextModel,
  loadRecommendationState: mocks.loadRecommendationState,
}));

const storedState = {
  version: 2,
  user: {
    onboarding: {
      step: "anchors",
      platforms: [{ platformId: "switch_2", status: "available" }],
      likedGameIds: ["zelda_tears"],
      dislikedGameIds: ["horror_game"],
    },
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    profile: {
      summary: "Likes expressive adventure games.",
      likedGenres: ["action_adventure"],
      avoidedGenres: ["horror"],
      likedTags: { exploration: 2 },
      dislikedTags: { jump_scare: 1 },
      ratedCount: 4,
      signals: [],
    },
    gameStates: {},
    lastUpdatedAt: "2026-01-01T00:00:00.000Z",
  },
};

const playNextModel = {
  primary: null,
  alternatives: [],
  savedPickIds: [],
  stateVersion: "2026-01-01T00:00:00.000Z",
};

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("today recommendations API route", () => {
  beforeEach(() => {
    mocks.loadRecommendationState.mockResolvedValue({
      ok: true,
      userId: "user-1",
      state: storedState,
      stateVersion: "2026-01-01T00:00:00.000Z",
    });
    mocks.buildPlayNextModel.mockResolvedValue(playNextModel);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses the session state and returns the /play DTO", async () => {
    const { POST } = await loadRoute();
    const request = new Request("http://playfit.test/api/recommendations/today", {
      method: "POST",
    });

    const response = await POST(request);

    await expect(response.json()).resolves.toEqual(playNextModel);
    expect(response.status).toBe(200);
    expect(mocks.loadRecommendationState).toHaveBeenCalledWith(request);
    expect(mocks.buildPlayNextModel).toHaveBeenCalledWith({
      state: storedState,
      stateVersion: "2026-01-01T00:00:00.000Z",
      userId: "user-1",
    });
  });

  it("rejects profile state sent by the client", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/recommendations/today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: null, onboarding: {}, gameStates: {} }),
      }),
    );

    await expect(response.json()).resolves.toEqual({
      error: "Recommendations are session-scoped; do not send profile state.",
    });
    expect(response.status).toBe(400);
    expect(mocks.loadRecommendationState).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/recommendations/today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON payload" });
    expect(response.status).toBe(400);
    expect(mocks.loadRecommendationState).not.toHaveBeenCalled();
  });

  it("requires a valid recommendation session", async () => {
    mocks.loadRecommendationState.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Recommendation session required",
    });
    const { POST } = await loadRoute();

    const response = await POST(
      new Request("http://playfit.test/api/recommendations/today", {
        method: "POST",
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "Recommendation session required" });
    expect(response.status).toBe(401);
    expect(mocks.buildPlayNextModel).not.toHaveBeenCalled();
  });

  it("returns a controlled scoring error", async () => {
    mocks.buildPlayNextModel.mockRejectedValue(new Error("database unavailable"));
    const { POST } = await loadRoute();

    const response = await POST(
      new Request("http://playfit.test/api/recommendations/today", {
        method: "POST",
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "Failed to score recommendations" });
    expect(response.status).toBe(500);
  });
});
