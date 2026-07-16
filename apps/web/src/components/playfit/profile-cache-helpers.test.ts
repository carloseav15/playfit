import type { ProductGameState, ProductOnboardingDraft, SeedGame } from "@playfit/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cachedGames: new Map<string, SeedGame>(),
}));

vi.mock("@/lib/game-cache", () => ({
  getCachedGame: (gameId: string) => mocks.cachedGames.get(gameId),
}));

import { buildAdaptiveProfileFromCache, buildProfileGamesById } from "./profile-cache-helpers";

function createGame(gameId: string, tags: string[]): SeedGame {
  return {
    gameId,
    title: gameId,
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre: "jrpg",
    genreId: "jrpg",
    tags,
    notes: "",
    coverPath: "",
    availablePlatformIds: ["ps5"],
    availablePlatformNames: ["PS5"],
    releaseState: "released",
  };
}

function createOnboarding(): ProductOnboardingDraft {
  return {
    step: "dislikes",
    platforms: [],
    likedGameIds: ["liked-game"],
    dislikedGameIds: ["disliked-game"],
  };
}

function createState(gameId: string): ProductGameState {
  return {
    gameId,
    title: gameId,
    rating: 5,
    inBacklog: false,
    inWishlist: false,
    inPlayfitPicks: false,
    source: "manual",
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
  };
}

describe("profile-cache-helpers", () => {
  beforeEach(() => {
    mocks.cachedGames.clear();
  });

  it("collects onboarding and game-state ids from the cache", () => {
    const onboarding = createOnboarding();
    const gameStates = { "rated-game": createState("rated-game") };
    mocks.cachedGames.set("liked-game", createGame("liked-game", ["story_rich"]));
    mocks.cachedGames.set("rated-game", createGame("rated-game", ["turn_based"]));

    const gamesById = buildProfileGamesById(onboarding, gameStates);

    expect([...gamesById.keys()]).toEqual(["liked-game", "rated-game"]);
    expect(gamesById.has("disliked-game")).toBe(false);
  });

  it("builds a profile from the same cached game set", () => {
    const onboarding = createOnboarding();
    const gameStates = { "rated-game": createState("rated-game") };
    mocks.cachedGames.set("liked-game", createGame("liked-game", ["story_rich"]));
    mocks.cachedGames.set("rated-game", createGame("rated-game", ["turn_based"]));

    const profile = buildAdaptiveProfileFromCache(onboarding, gameStates);

    expect(profile.likedGenres).toContain("jrpg");
    expect(profile.likedTags.story_rich).toBeGreaterThan(0);
    expect(profile.likedTags.turn_based).toBeGreaterThan(0);
    expect(profile.ratedCount).toBe(1);
  });
});
