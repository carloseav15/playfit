import type { ProductState } from "@playfit/core/types";
import { describe, expect, it } from "vitest";
import { applyProfileMutationPatch, diffUserPatch } from "./profile-mutation-patch";

function state(overrides: Partial<ProductState["user"]> = {}, stateVersion = "1"): ProductState {
  return {
    version: 2,
    stateVersion,
    user: {
      onboarding: { step: "dislikes", platforms: [], likedGameIds: [], dislikedGameIds: [] },
      onboardingCompletedAt: "2026-08-18T00:00:00.000Z",
      profile: null,
      gameStates: {},
      lastUpdatedAt: null,
      ...overrides,
    },
  };
}

describe("diffUserPatch / applyProfileMutationPatch", () => {
  it("captures a new gameStates entry and applying it sets exactly that value", () => {
    const current = state();
    const next = structuredClone(current);
    next.user.gameStates.g1 = {
      gameId: "g1",
      title: "g1",
      inBacklog: true,
      inWishlist: false,
      inPlayfitPicks: false,
      source: "manual",
      createdAt: "t",
      updatedAt: "t",
    };

    const patch = diffUserPatch(current, next);
    expect(patch.gameStates?.g1).toMatchObject({ inBacklog: true });

    const target = state();
    applyProfileMutationPatch(target, patch);
    expect(target.user.gameStates.g1).toMatchObject({ inBacklog: true });
  });

  it("captures a deletion as null and applying it removes the entry", () => {
    const existing = {
      gameId: "g1",
      title: "g1",
      inBacklog: false,
      inWishlist: false,
      inPlayfitPicks: false,
      source: "manual" as const,
      createdAt: "t",
      updatedAt: "t",
    };
    const current = state({ gameStates: { g1: existing } });
    const next = structuredClone(current);
    delete next.user.gameStates.g1;

    const patch = diffUserPatch(current, next);
    expect(patch.gameStates?.g1).toBeNull();

    const target = state({ gameStates: { g1: existing } });
    applyProfileMutationPatch(target, patch);
    expect(target.user.gameStates.g1).toBeUndefined();
  });

  it("is a no-op patch when nothing changed", () => {
    const current = state({
      gameStates: {
        g1: {
          gameId: "g1",
          title: "g1",
          inBacklog: true,
          inWishlist: false,
          inPlayfitPicks: false,
          source: "manual",
          createdAt: "t",
          updatedAt: "t",
        },
      },
    });
    const next = structuredClone(current);

    const patch = diffUserPatch(current, next);
    expect(patch).toEqual({});
  });

  it("applying the same patch twice in a row is idempotent (the core replay-safety property)", () => {
    const current = state();
    const next = structuredClone(current);
    next.user.gameStates.g1 = {
      gameId: "g1",
      title: "g1",
      inBacklog: true,
      inWishlist: false,
      inPlayfitPicks: false,
      source: "manual",
      createdAt: "t",
      updatedAt: "t",
    };
    const patch = diffUserPatch(current, next);

    const target = state();
    applyProfileMutationPatch(target, patch);
    applyProfileMutationPatch(target, patch);
    applyProfileMutationPatch(target, patch);

    expect(target.user.gameStates.g1).toMatchObject({ inBacklog: true });
  });

  it("onboarding, onboardingCompletedAt, and profile changes are captured only when they actually differ", () => {
    const current = state();
    const next = structuredClone(current);
    next.user.onboarding.likedGameIds = ["g1"];
    next.user.onboardingCompletedAt = "2026-08-20T00:00:00.000Z";
    next.user.profile = {
      summary: "x",
      likedGenres: [],
      avoidedGenres: [],
      likedTags: {},
      dislikedTags: {},
      ratedCount: 0,
      signals: [],
    };

    const patch = diffUserPatch(current, next);
    expect(patch.onboarding?.likedGameIds).toEqual(["g1"]);
    expect(patch.onboardingCompletedAt).toBe("2026-08-20T00:00:00.000Z");
    expect(patch.profile?.summary).toBe("x");

    // Unrelated field is untouched, so it should not appear in the patch at all.
    const currentB = state();
    const nextB = structuredClone(currentB);
    nextB.user.onboarding.step = "anchors";
    const patchB = diffUserPatch(currentB, nextB);
    expect(patchB.onboardingCompletedAt).toBeUndefined();
    expect(patchB.profile).toBeUndefined();
  });

  it("replaceUser wholesale-replaces draft.user and composes with other fields applied after it", () => {
    const target = state({
      gameStates: {
        stale: {
          gameId: "stale",
          title: "stale",
          inBacklog: false,
          inWishlist: false,
          inPlayfitPicks: false,
          source: "manual",
          createdAt: "t",
          updatedAt: "t",
        },
      },
    });
    const cleanUser = state().user;

    applyProfileMutationPatch(target, { replaceUser: cleanUser, onboardingCompletedAt: null });

    expect(target.user.gameStates.stale).toBeUndefined();
    expect(target.user.onboardingCompletedAt).toBeNull();
  });

  it("an empty patch changes nothing", () => {
    const target = state({
      gameStates: {
        g1: {
          gameId: "g1",
          title: "g1",
          inBacklog: true,
          inWishlist: false,
          inPlayfitPicks: false,
          source: "manual",
          createdAt: "t",
          updatedAt: "t",
        },
      },
    });
    const before = structuredClone(target);
    applyProfileMutationPatch(target, {});
    expect(target).toEqual(before);
  });
});
