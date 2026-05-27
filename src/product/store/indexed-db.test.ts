import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import {
  createInitialState,
  loadProductState,
  resetProductState,
  saveProductState,
} from "./indexed-db";

describe("product indexeddb store", () => {
  beforeEach(async () => {
    await resetProductState();
  });

  it("returns a clean default state when nothing was saved", async () => {
    const state = await loadProductState();
    expect(state.user.onboarding.step).toBe("platforms");
    expect(state.user.profile).toBeNull();
  });

  it("persists and restores product state", async () => {
    const state = createInitialState();
    state.user.onboardingCompletedAt = "2026-01-01T00:00:00.000Z";
    state.user.onboarding.platforms = [{ platformId: "ps5", status: "available" }];
    state.user.lastUpdatedAt = "2026-01-01T00:00:00.000Z";

    await saveProductState(state);
    const restored = await loadProductState();

    expect(restored.user.onboardingCompletedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(restored.user.onboarding.platforms).toHaveLength(1);
  });

  it("backfills new structured onboarding fields from older saved state", async () => {
    const legacyState = {
      version: 1,
      user: {
        onboarding: {
          step: "interview",
          platforms: [{ platformId: "ps5", status: "available" }],
          likedGameIds: ["a", "b", "c"],
          dislikedGameIds: ["d", "e", "f"],
          currentGameId: null,
          answers: {
            love: "story",
            frustration: "slow starts",
            priorities: "story",
            playPattern: "watch on youtube",
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

    await saveProductState(legacyState as never);
    const restored = await loadProductState();

    expect(restored.user.onboarding.answers.selectedPriorities).toEqual([]);
    expect(restored.user.onboarding.answers.selectedFrictionSignals).toEqual([]);
    expect(restored.user.onboarding.answers.selectedPlayPattern).toBe("");
    expect(restored.user.onboarding.anchorReasons).toEqual({});
    expect(restored.user.onboarding.anchorOwnership).toEqual({});
    expect(restored.user.gameStates).toEqual({});
  });
});
