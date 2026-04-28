import { describe, expect, it } from "vitest";

import { buildTodayModel, scoreSeedGame } from "./recommendations";
import type { ProductProfile, ProductState, SeedGame } from "../types";
import { createInitialState } from "../store/indexed-db";

function createGame(
  gameId: string,
  title: string,
  overrides: Partial<SeedGame> = {},
): SeedGame {
  return {
    gameId,
    title,
    series: "",
    source: "catalog",
    primaryGenre: "jrpg",
    combatStyle: "turn-based",
    storyStrength: "medium",
    progressionClarity: "medium",
    earlyHook: "medium",
    aestheticFit: "medium",
    emotionalComplexity: "medium",
    combatDepth: "medium",
    endgameRepetitionRisk: "low",
    pacingSpeed: "medium",
    notes: "",
    coverPath: "",
    availablePlatformIds: ["ps5"],
    availablePlatformNames: ["PS5"],
    releaseState: "released",
    ...overrides,
  };
}

function createProfile(): ProductProfile {
  return {
    summary: "test",
    priorities: {
      story: "high",
      progression: "high",
      hook: "high",
      aesthetic: "medium",
      emotional: "high",
      combat: "medium",
      pace: "medium",
    },
    avoidPatterns: {
      slowStart: true,
      repetition: true,
      confusingSystems: true,
      weakEmotionalPull: false,
      shallowCombat: false,
    },
    likedGenres: ["jrpg"],
    avoidedGenres: ["looter"],
    watchVsPlayRisk: "medium",
    signals: [],
  };
}

function createState(): ProductState {
  const state = createInitialState();
  state.user.profile = createProfile();
  state.user.onboarding.platforms = [{ platformId: "ps5", status: "available" }];
  state.user.onboarding.likedGameIds = ["liked-a", "liked-b", "liked-c"];
  state.user.onboarding.dislikedGameIds = ["bad-a", "bad-b", "bad-c"];
  return state;
}

describe("recommendations domain", () => {
  it("scores games with affinity and risk signals", () => {
    const state = createState();
    const gamesById = new Map<string, SeedGame>();
    const strongFit = createGame("fit", "Strong Fit", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
      emotionalComplexity: "high",
    });

    gamesById.set(strongFit.gameId, strongFit);
    const ranked = scoreSeedGame(strongFit, state, state.user.profile!, gamesById);

    expect(ranked.affinityScore).toBeGreaterThan(70);
    expect(ranked.platformAvailability).toBe("available");
    expect(ranked.ownershipStatus).toBe("unknown");
    expect(ranked.fitReasons.length).toBeGreaterThan(0);
  });

  it("keeps current run separate from playable next up and wishlist fit", () => {
    const state = createState();
    const currentRun = createGame("current", "Current Run", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const nextUp = createGame("next", "Next Up", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
      endgameRepetitionRisk: "low",
    });
    const avoid = createGame("avoid", "Risky Pick", {
      storyStrength: "medium",
      progressionClarity: "low",
      earlyHook: "low",
      endgameRepetitionRisk: "high",
      pacingSpeed: "slow",
    });
    const wishlist = createGame("wishlist", "Wishlist Pick", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
      emotionalComplexity: "high",
    });
    const unreleased = createGame("future", "Future Game", {
      releaseState: "unreleased",
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const games = [currentRun, nextUp, avoid, wishlist, unreleased];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    state.user.gameStates[currentRun.gameId] = {
      gameId: currentRun.gameId,
      title: currentRun.title,
      status: "playing",
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    state.user.gameStates[nextUp.gameId] = {
      gameId: nextUp.gameId,
      title: nextUp.title,
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    state.user.gameStates[avoid.gameId] = {
      gameId: avoid.gameId,
      title: avoid.title,
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    state.user.gameStates[wishlist.gameId] = {
      gameId: wishlist.gameId,
      title: wishlist.title,
      ownershipStatus: "wishlist",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.currentRun?.game.gameId).toBe("current");
    expect(model.nextUp?.game.gameId).toBe("next");
    expect(model.wishlistFit?.game.gameId).toBe("wishlist");
    expect(model.playableAlternative?.game.gameId).toBe("next");
    expect(model.avoid?.game.gameId).toBe("avoid");
    expect(model.nextUp?.game.gameId).not.toBe("future");
  });

  it("removes completed games from Today and treats mixed outcomes as neutral learning", () => {
    const state = createState();
    const completed = createGame("done", "Finished Run", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const nextUp = createGame("next", "Next Up", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const target = createGame("target", "Target", {
      primaryGenre: "action",
      series: "Series A",
    });
    const mixedAnchor = createGame("mixed", "Mixed Anchor", {
      primaryGenre: "action",
      series: "Series A",
    });
    const games = [completed, nextUp, target, mixedAnchor];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    state.user.gameStates[completed.gameId] = {
      gameId: completed.gameId,
      title: completed.title,
      status: "completed",
      sentiment: "liked",
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    state.user.gameStates[nextUp.gameId] = {
      gameId: nextUp.gameId,
      title: nextUp.title,
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const withoutMixed = scoreSeedGame(target, state, state.user.profile!, gamesById);

    state.user.gameStates[mixedAnchor.gameId] = {
      gameId: mixedAnchor.gameId,
      title: mixedAnchor.title,
      status: "completed",
      sentiment: "mixed",
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const withMixed = scoreSeedGame(target, state, state.user.profile!, gamesById);
    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.currentRun).toBeNull();
    expect(model.nextUp?.game.gameId).toBe("next");
    expect(model.wishlistFit?.game.gameId).toBe("target");
    expect(withMixed.affinityScore).toBe(withoutMixed.affinityScore);
    expect(withMixed.riskScore).toBe(withoutMixed.riskScore);
  });

  it("removes dropped games from Today and keeps their negative learning signal", () => {
    const state = createState();
    const dropped = createGame("dropped", "Dropped Run", {
      primaryGenre: "action",
      series: "Series A",
      storyStrength: "high",
    });
    const target = createGame("target", "Target", {
      primaryGenre: "action",
      series: "Series A",
    });
    const nextUp = createGame("next", "Next Up", {
      primaryGenre: "jrpg",
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const games = [dropped, target, nextUp];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    const withoutDrop = scoreSeedGame(target, state, state.user.profile!, gamesById);

    state.user.gameStates[dropped.gameId] = {
      gameId: dropped.gameId,
      title: dropped.title,
      status: "dropped",
      sentiment: "disliked",
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    state.user.gameStates[nextUp.gameId] = {
      gameId: nextUp.gameId,
      title: nextUp.title,
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const withDrop = scoreSeedGame(target, state, state.user.profile!, gamesById);
    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.currentRun).toBeNull();
    expect(model.resume).toBeNull();
    expect(model.nextUp?.game.gameId).toBe("next");
    expect(model.wishlistFit?.game.gameId).toBe("target");
    expect(withDrop.cautionReasons).toContain("Shares genre overlap with games that already failed for you");
    expect(withDrop.riskScore).toBeGreaterThanOrEqual(withoutDrop.riskScore);
  });

  it("keeps ownership intact for dismissed games while excluding them from Today", () => {
    const state = createState();
    const dismissedOwned = createGame("dismissed-owned", "Dismissed Owned");
    const nextUp = createGame("next", "Next Up", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const games = [dismissedOwned, nextUp];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    state.user.gameStates[dismissedOwned.gameId] = {
      gameId: dismissedOwned.gameId,
      title: dismissedOwned.title,
      status: "dismissed",
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    state.user.gameStates[nextUp.gameId] = {
      gameId: nextUp.gameId,
      title: nextUp.title,
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const dismissedRanked = scoreSeedGame(dismissedOwned, state, state.user.profile!, gamesById);
    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(dismissedRanked.ownershipStatus).toBe("owned");
    expect(model.nextUp?.game.gameId).toBe("next");
    expect(model.nextUp?.game.gameId).not.toBe("dismissed-owned");
  });

  it("keeps not owned titles out of next up while allowing wishlist fit", () => {
    const state = createState();
    const notOwned = createGame("not-owned", "Not Owned", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
      emotionalComplexity: "high",
    });
    const nextUp = createGame("next", "Next Up", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const games = [notOwned, nextUp];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    state.user.gameStates[notOwned.gameId] = {
      gameId: notOwned.gameId,
      title: notOwned.title,
      ownershipStatus: "not_owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    state.user.gameStates[nextUp.gameId] = {
      gameId: nextUp.gameId,
      title: nextUp.title,
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.nextUp?.game.gameId).toBe("next");
    expect(model.nextUp?.game.gameId).not.toBe("not-owned");
    expect(model.wishlistFit?.game.gameId).toBe("not-owned");
  });
});
