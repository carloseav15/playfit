import { describe, expect, it } from "vitest";

import { buildFinderIndex, buildTodayModel, findExactSeedGame, scoreSeedGame, searchSeedGames } from "./recommendations";
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

  it("keeps early recommendations low confidence until enough outcomes exist", () => {
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

    expect(ranked.confidence).toBe("low");
    expect(ranked.affinityScore).toBeLessThanOrEqual(72);
  });

  it("keeps platform access out of friction scoring", () => {
    const availableState = createState();
    const unavailableState = createState();
    const gamesById = new Map<string, SeedGame>();
    const available = createGame("available", "Available Fit", {
      availablePlatformIds: ["ps5"],
      availablePlatformNames: ["PS5"],
    });
    const unavailable = createGame("unavailable", "Unavailable Fit", {
      availablePlatformIds: ["switch_1"],
      availablePlatformNames: ["Switch"],
    });

    gamesById.set(available.gameId, available);
    gamesById.set(unavailable.gameId, unavailable);

    const rankedAvailable = scoreSeedGame(available, availableState, availableState.user.profile!, gamesById);
    const rankedUnavailable = scoreSeedGame(unavailable, unavailableState, unavailableState.user.profile!, gamesById);

    expect(rankedAvailable.accessStatus).toBe("playable");
    expect(rankedUnavailable.accessStatus).toBe("not_on_platforms");
    expect(rankedUnavailable.riskScore).toBe(rankedAvailable.riskScore);
    expect(rankedUnavailable.cautionReasons.join(" ")).not.toContain("platform");
  });

  it("supports multiple playing games while choosing one main focus", () => {
    const state = createState();
    const currentRun = createGame("current", "Current Run", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const sideRun = createGame("side", "Side Run", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
      aestheticFit: "high",
      emotionalComplexity: "high",
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
    const alternative = createGame("alternative", "Alternative", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "medium",
      endgameRepetitionRisk: "low",
    });
    const unreleased = createGame("future", "Future Game", {
      releaseState: "unreleased",
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const games = [currentRun, sideRun, nextUp, avoid, wishlist, alternative, unreleased];
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
    state.user.gameStates[sideRun.gameId] = {
      gameId: sideRun.gameId,
      title: sideRun.title,
      status: "playing",
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
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
      collectionStatus: "wishlist",
      ownershipStatus: "wishlist",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    state.user.gameStates[alternative.gameId] = {
      gameId: alternative.gameId,
      title: alternative.title,
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.playingNow.map((entry) => entry.game.gameId)).toEqual(["side", "current"]);
    expect(model.currentRun?.game.gameId).toBe("side");
    expect(model.nextUp?.game.gameId).toBe("next");
    expect(model.nextUp?.game.gameId).not.toBe("current");
    expect(model.nextUp?.game.gameId).not.toBe("side");
    expect(model.wishlistFit?.game.gameId).toBe("wishlist");
    expect(model.playableAlternative?.game.gameId).toBe("alternative");
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
    expect(model.playableAlternative?.game.gameId).toBe("target");
    expect(model.wishlistFit).toBeNull();
    expect(withMixed.affinityScore).toBe(withoutMixed.affinityScore);
    expect(withMixed.riskScore).toBe(withoutMixed.riskScore);
  });

  it("keeps mixed sentiment games out of positive Today slots", () => {
    const state = createState();
    const mixed = createGame("mixed", "Mixed Result", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const nextUp = createGame("next", "Next Up", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const alternative = createGame("alternative", "Alternative", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "medium",
    });
    const games = [mixed, nextUp, alternative];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    state.user.gameStates[mixed.gameId] = {
      gameId: mixed.gameId,
      title: mixed.title,
      sentiment: "mixed",
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const model = buildTodayModel(games, state, state.user.profile, gamesById);
    const positiveIds = [model.nextUp, model.playableAlternative, model.wishlistFit]
      .map((entry) => entry?.game.gameId)
      .filter(Boolean);

    expect(positiveIds).not.toContain("mixed");
    expect(model.nextUp?.game.gameId).toBe("next");
  });

  it("keeps paused high-friction games out of avoid while allowing resume", () => {
    const state = createState();
    const paused = createGame("paused", "Paused Risk", {
      progressionClarity: "low",
      earlyHook: "low",
      endgameRepetitionRisk: "high",
      pacingSpeed: "slow",
    });
    const games = [paused];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    state.user.gameStates[paused.gameId] = {
      gameId: paused.gameId,
      title: paused.title,
      status: "shelved",
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.resume?.game.gameId).toBe("paused");
    expect(model.avoid).toBeNull();
  });

  it("routes wishlist games without access to worth tracking instead of top pick", () => {
    const state = createState();
    const inaccessibleWishlist = createGame("wish", "Wishlist Switch Game", {
      availablePlatformIds: ["switch_1"],
      availablePlatformNames: ["Switch"],
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const playable = createGame("next", "Playable Next", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const games = [inaccessibleWishlist, playable];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    state.user.gameStates[inaccessibleWishlist.gameId] = {
      gameId: inaccessibleWishlist.gameId,
      title: inaccessibleWishlist.title,
      collectionStatus: "wishlist",
      ownershipStatus: "wishlist",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.nextUp?.game.gameId).toBe("next");
    expect(model.wishlistFit?.game.gameId).not.toBe("wish");
    expect(model.worthTracking?.game.gameId).toBe("wish");
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
    expect(model.nextUp?.game.gameId).toBe("target");
    expect(model.playableAlternative?.game.gameId).toBe("next");
    expect(model.wishlistFit).toBeNull();
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

  it("does not require ownership for a released game to be actionable", () => {
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

    expect(model.nextUp?.game.gameId).toBe("not-owned");
    expect(model.playableAlternative?.game.gameId).toBe("next");
    expect(model.wishlistFit).toBeNull();
  });

  it("keeps basic Finder records searchable but out of Today scoring", () => {
    const state = createState();
    const scored = createGame("scored", "Scored Game", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const basic = createGame("steam-basic", "Steam Basic Game", {
      source: "finder",
      scoringStatus: "basic",
      aliases: ["Basic Alias"],
    });
    const games = [scored, basic];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));
    state.user.gameStates[scored.gameId] = {
      gameId: scored.gameId,
      title: scored.title,
      ownershipStatus: "owned",
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const rankedBasic = scoreSeedGame(basic, state, state.user.profile!, gamesById);
    const model = buildTodayModel(games, state, state.user.profile, gamesById);
    const index = buildFinderIndex(games);

    expect(rankedBasic.confidence).toBe("low");
    expect(rankedBasic.fitReasons[0]).toContain("Finder-only");
    expect(model.nextUp?.game.gameId).toBe("scored");
    expect(searchSeedGames(games, "Basic Alias", index)[0]?.gameId).toBe("steam-basic");
    expect(findExactSeedGame(games, "Basic Alias")?.gameId).toBe("steam-basic");
  });

  it("distinguishes exact title matches from nearby fuzzy results", () => {
    const games = [
      createGame("shadow_mordor", "Middle-earth: Shadow of Mordor", { series: "Middle-earth" }),
      createGame("shadow_colossus", "Shadow of the Colossus", { series: "Team Ico" }),
    ];
    const index = buildFinderIndex(games);
    const results = searchSeedGames(games, "Shadow of War", index);

    expect(results.map((game) => game.gameId)).toContain("shadow_mordor");
    expect(findExactSeedGame(games, "Shadow of War")).toBeNull();
    expect(findExactSeedGame(games, "Shadow of the Colossus")?.gameId).toBe("shadow_colossus");
  });
});
