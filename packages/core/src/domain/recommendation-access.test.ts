import { describe, expect, it } from "vitest";
import type { ProductState, RankedSeedGame, SeedGame } from "../types";
import {
  buildAccessiblePlatformIds,
  getAccessStatus,
  getPlatformAvailability,
  isPlayableNow,
} from "./recommendation-access";

function createGame(overrides: Partial<SeedGame> = {}): SeedGame {
  return {
    gameId: "game-1",
    title: "Game One",
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre: "action",
    genreId: "action",
    tags: ["story_rich"],
    notes: "",
    coverPath: "",
    availablePlatformIds: ["ps5"],
    availablePlatformNames: ["PS5"],
    releaseState: "released",
    ...overrides,
  };
}

function createState(): ProductState {
  return {
    version: 1,
    user: {
      onboardingCompletedAt: "2026-07-15T00:00:00Z",
      onboarding: {
        step: "dislikes",
        platforms: [
          { platformId: "ps5", status: "available" },
          { platformId: "switch_2", status: "limited" },
          { platformId: "pc", status: "planned" },
        ],
        likedGameIds: [],
        dislikedGameIds: [],
      },
      profile: null,
      gameStates: {},
      lastUpdatedAt: null,
    },
  };
}

function createEntry(accessStatus: RankedSeedGame["accessStatus"]): RankedSeedGame {
  return {
    game: createGame(),
    affinityScore: 50,
    riskScore: 10,
    confidence: "medium",
    fitReasons: [],
    cautionReasons: [],
    platformAvailability: "available",
    accessStatus,
    inBacklog: false,
    inWishlist: false,
    inPlayfitPicks: false,
    similarGames: [],
  };
}

describe("recommendation-access", () => {
  it("includes available and limited platforms only", () => {
    expect([...buildAccessiblePlatformIds(createState())]).toEqual(["ps5", "switch_2"]);
  });

  it("resolves platform availability including unknown catalogs", () => {
    const state = createState();
    const accessible = buildAccessiblePlatformIds(state);

    expect(getPlatformAvailability(createGame(), accessible)).toBe("available");
    expect(getPlatformAvailability(createGame({ availablePlatformIds: ["pc"] }), accessible)).toBe(
      "unavailable",
    );
    expect(getPlatformAvailability(createGame({ availablePlatformIds: [] }), accessible)).toBe(
      "unknown",
    );
  });

  it("prioritizes unreleased and platform status in access status", () => {
    expect(getAccessStatus(createGame({ releaseState: "unreleased" }), "available")).toBe(
      "unreleased",
    );
    expect(getAccessStatus(createGame(), "unavailable")).toBe("not_on_platforms");
    expect(getAccessStatus(createGame(), "unknown")).toBe("unknown_platform");
    expect(getAccessStatus(createGame(), "available")).toBe("playable");
  });

  it("accepts only playable recommendation entries", () => {
    expect(isPlayableNow(createEntry("playable"))).toBe(true);
    expect(isPlayableNow(createEntry("unreleased"))).toBe(false);
    expect(isPlayableNow(createEntry("not_on_platforms"))).toBe(false);
  });
});
