import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/api-cache", () => ({
  getCache: mocks.getCache,
  setCache: mocks.setCache,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAnonClient: vi.fn(() => ({
    rpc: mocks.rpc,
  })),
}));

const now = "2026-01-01T00:00:00.000Z";

function validPayload() {
  return {
    profile: {
      summary: "Likes expressive adventure games.",
      likedGenres: ["action_adventure"],
      avoidedGenres: ["horror"],
      likedTags: { exploration: 2 },
      dislikedTags: { jump_scare: 1 },
      ratedCount: 4,
      signals: [
        {
          id: "zelda_tears",
          tone: "positive",
          label: "The Legend of Zelda: Tears of the Kingdom",
          reason: "Loved exploration",
        },
      ],
    },
    onboarding: {
      step: "anchors",
      platforms: [
        { platformId: "switch_2", status: "available" },
        { platformId: "ps5", status: "planned" },
      ],
      likedGameIds: ["zelda_tears"],
      dislikedGameIds: ["horror_game"],
    },
    gameStates: {
      zelda_tears: {
        gameId: "zelda_tears",
        title: "The Legend of Zelda: Tears of the Kingdom",
        rating: 5,
        inBacklog: false,
        inWishlist: false,
        inPlayfitPicks: false,
        excluded: false,
        source: "onboarding",
        createdAt: now,
        updatedAt: now,
      },
    },
  };
}

function todayModel() {
  return {
    currentRun: [],
    nextUp: [],
    resume: [],
    picks: [],
  };
}

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("today recommendations API route", () => {
  beforeEach(() => {
    mocks.getCache.mockResolvedValue(null);
    mocks.setCache.mockResolvedValue(undefined);
    mocks.rpc.mockResolvedValue({ data: todayModel(), error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("scores a valid recommendations payload", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/recommendations/today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validPayload()),
      }),
    );

    await expect(response.json()).resolves.toEqual(todayModel());
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "score_today_recommendations",
      expect.objectContaining({
        p_accessible_platform_ids: ["switch_2"],
        p_onboarding_liked_ids: ["zelda_tears"],
        p_onboarding_disliked_ids: ["horror_game"],
      }),
    );
    expect(mocks.setCache).toHaveBeenCalledWith(
      expect.stringMatching(/^recs:today:/),
      todayModel(),
      3600,
      expect.anything(),
    );
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
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects payloads outside the recommendations schema", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/recommendations/today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ profile: null, gameStates: {} }),
      }),
    );

    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid recommendations payload");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns a controlled scoring error", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });

    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/recommendations/today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validPayload()),
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "Failed to score recommendations" });
    expect(response.status).toBe(500);
  });

  it("returns a controlled scoring error when the RPC rejects", async () => {
    mocks.rpc.mockRejectedValue(new Error("network timeout"));

    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/recommendations/today", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validPayload()),
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "Failed to score recommendations" });
    expect(response.status).toBe(500);
  });
});
