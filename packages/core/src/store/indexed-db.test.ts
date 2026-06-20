import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authenticatedFetch, createInitialState, setCachedAuth } from "./indexed-db";

function mockFetch(response: unknown) {
  return vi.fn().mockImplementation(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(response),
    }),
  );
}

describe("product indexeddb store", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch({ state: null }));
    vi.stubGlobal("localStorage", {
      getItem: vi.fn().mockReturnValue("test-device-id"),
      setItem: vi.fn(),
    });
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("test-device-id") });
  });

  afterEach(() => {
    setCachedAuth(null, null);
    vi.unstubAllGlobals();
  });

  it("returns a clean default state when nothing was saved", async () => {
    const { loadProductState } = await import("./indexed-db");
    const state = await loadProductState();
    expect(state.user.onboarding.step).toBe("platforms");
    expect(state.user.profile).toBeNull();
  });

  it("persists and restores product state", async () => {
    const { loadProductState, saveProductState } = await import("./indexed-db");
    const state = createInitialState();
    state.user.onboardingCompletedAt = "2026-01-01T00:00:00.000Z";
    state.user.onboarding.platforms = [{ platformId: "ps5", status: "available" }];
    state.user.lastUpdatedAt = "2026-01-01T00:00:00.000Z";
    const saved = structuredClone(state);
    saved.user.lastUpdatedAt = null;

    vi.stubGlobal(
      "fetch",
      mockFetch({
        state: {
          onboarding: {
            step: saved.user.onboarding.step,
            platforms: saved.user.onboarding.platforms,
            likedGameIds: saved.user.onboarding.likedGameIds,
            dislikedGameIds: saved.user.onboarding.dislikedGameIds,
            onboardingCompletedAt: saved.user.onboardingCompletedAt,
          },
          profile: saved.user.profile,
          game_states: saved.user.gameStates,
          created_at: saved.user.lastUpdatedAt,
        },
      }),
    );

    await saveProductState(state);
    const restored = await loadProductState();

    expect(restored.user.onboardingCompletedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(restored.user.onboarding.platforms).toHaveLength(1);
  });

  it("merges legacy v1 state into the v2 schema gracefully", async () => {
    const { loadProductState, saveProductState } = await import("./indexed-db");
    const legacyState = {
      version: 1,
      user: {
        onboarding: {
          step: "anchors",
          platforms: [{ platformId: "ps5", status: "available" }],
          likedGameIds: ["a", "b", "c"],
          dislikedGameIds: ["d", "e", "f"],
          currentGameId: null,
          answers: {
            love: "story",
            frustration: "slow starts",
          },
          draftProfile: null,
        },
        onboardingCompletedAt: null,
        profile: null,
        gameStates: {},
        checkins: [],
        finderActions: {},
        lastUpdatedAt: null,
      },
    };

    vi.stubGlobal(
      "fetch",
      mockFetch({
        state: {
          onboarding: {
            step: "anchors",
            platforms: [{ platformId: "ps5", status: "available" }],
            likedGameIds: ["a", "b", "c"],
            dislikedGameIds: ["d"],
            onboardingCompletedAt: null,
          },
          profile: null,
          game_states: {},
          created_at: null,
        },
      }),
    );

    await saveProductState(legacyState as never);
    const restored = await loadProductState();

    expect(restored.user.onboarding.step).toBe("anchors");
    expect(restored.user.onboarding.platforms).toHaveLength(1);
    expect(restored.user.onboarding.likedGameIds).toHaveLength(3);
    expect(restored.user.onboarding.dislikedGameIds).toEqual(["d"]);
    expect(restored.user.gameStates).toEqual({});
    expect(restored.user.profile).toBeNull();
  });

  it("defaults missing disliked setup games when loading older profiles", async () => {
    const { loadProductState } = await import("./indexed-db");

    vi.stubGlobal(
      "fetch",
      mockFetch({
        state: {
          onboarding: {
            step: "anchors",
            platforms: [{ platformId: "ps5", status: "available" }],
            likedGameIds: ["a", "b", "c"],
            onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
          },
          profile: null,
          game_states: {},
          created_at: null,
        },
      }),
    );

    const restored = await loadProductState();

    expect(restored.user.onboarding.dislikedGameIds).toEqual([]);
  });

  it("defaults missing Playfit Picks state when loading older game states", async () => {
    const { loadProductState } = await import("./indexed-db");

    vi.stubGlobal(
      "fetch",
      mockFetch({
        state: {
          onboarding: {
            step: "anchors",
            platforms: [{ platformId: "ps5", status: "available" }],
            likedGameIds: ["a", "b", "c"],
            dislikedGameIds: [],
            onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
          },
          profile: null,
          game_states: {
            chrono_trigger: {
              gameId: "chrono_trigger",
              title: "Chrono Trigger",
              inBacklog: false,
              inWishlist: false,
              source: "manual",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
            },
          },
          created_at: null,
        },
      }),
    );

    const restored = await loadProductState();

    expect(restored.user.gameStates.chrono_trigger?.inPlayfitPicks).toBe(false);
  });

  it("falls back to a clean default state when the API returns invalid profile data", async () => {
    const { loadProductState } = await import("./indexed-db");

    vi.stubGlobal(
      "fetch",
      mockFetch({
        state: {
          onboarding: {
            step: "invalid-step",
            platforms: [{ platformId: "ps5", status: "available" }],
            likedGameIds: [],
            onboardingCompletedAt: null,
          },
          profile: null,
          game_states: {},
          created_at: null,
        },
      }),
    );

    const restored = await loadProductState();

    expect(restored.user.onboarding.step).toBe("platforms");
    expect(restored.user.onboarding.platforms).toEqual([]);
  });

  it("adds the cached bearer token to authenticated fetches", async () => {
    setCachedAuth("cached-token", "test-user-id");

    await authenticatedFetch("/api/recommendations/today", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });

    const [, init] = (fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock
      .calls[0];
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer cached-token");
    expect(headers.get("content-type")).toBe("application/json");
  });

  it("preserves an explicit authorization header", async () => {
    setCachedAuth("cached-token", "test-user-id");

    await authenticatedFetch("/api/recommendations/model", {
      method: "POST",
      headers: { authorization: "Bearer explicit-token" },
    });

    const [, init] = (fetch as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock
      .calls[0];
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer explicit-token");
  });
});
