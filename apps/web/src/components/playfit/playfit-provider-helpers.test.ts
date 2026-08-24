import { createInitialState } from "@playfit/core/store";
import type { ProductPlatformOption } from "@playfit/core/types";
import { describe, expect, it } from "vitest";
import { withDefaultPlatforms } from "./playfit-provider-helpers";

function platform(platformId: string, family: string): ProductPlatformOption {
  return {
    platformId,
    displayName: platformId,
    family,
    kind: "console",
    activeStatus: "active",
    sortOrder: 1,
  };
}

const knownPlatforms = [platform("switch_2", "nintendo"), platform("ps5", "playstation")];

describe("withDefaultPlatforms (P1 #5 — fresh onboarding platform default)", () => {
  it("defaults a brand-new, untouched profile to every known platform selected", () => {
    const state = createInitialState();
    expect(state.user.onboarding.platforms).toEqual([]);

    const result = withDefaultPlatforms(state, knownPlatforms);

    expect(result.user.onboarding.platforms.map((p) => p.platformId).sort()).toEqual(
      ["ps5", "switch_2"].sort(),
    );
  });

  it("does not silently re-apply the all-platforms default once the user has made an explicit selection", () => {
    const state = createInitialState();
    state.user.onboarding.platforms = [{ platformId: "switch_2", status: "available" }];

    const result = withDefaultPlatforms(state, knownPlatforms);

    // Must stay exactly what the user chose -- not fall back to "all".
    expect(result.user.onboarding.platforms).toEqual([
      { platformId: "switch_2", status: "available" },
    ]);
  });

  it("does not re-apply once onboarding is completed, even if platforms were later narrowed to a subset", () => {
    const state = createInitialState();
    state.user.onboarding.platforms = [{ platformId: "ps5", status: "available" }];
    state.user.onboardingCompletedAt = "2026-01-01T00:00:00.000Z";

    const result = withDefaultPlatforms(state, knownPlatforms);

    expect(result.user.onboarding.platforms).toEqual([{ platformId: "ps5", status: "available" }]);
  });

  it("leaves an already-empty, completed profile's platforms untouched (no forced default post-completion)", () => {
    const state = createInitialState();
    state.user.onboardingCompletedAt = "2026-01-01T00:00:00.000Z";

    const result = withDefaultPlatforms(state, knownPlatforms);

    expect(result.user.onboarding.platforms).toEqual([]);
  });
});
