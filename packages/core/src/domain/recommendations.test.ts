import { describe, expect, it } from "vitest";
import { createInitialState } from "../store/indexed-db";
import type { ProductGameState, ProductProfile, ProductState, SeedGame } from "../types";
import {
  buildFinderIndex,
  buildTodayModel,
  findExactSeedGame,
  scoreSeedGame,
  searchSeedGames,
} from "./recommendations";

function createGame(gameId: string, title: string, overrides: Partial<SeedGame> = {}): SeedGame {
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
  return state;
}

function getProfile(state: ProductState): ProductProfile {
  if (!state.user.profile) {
    throw new Error("Expected test state to include a profile");
  }

  return state.user.profile;
}

function makeGameState(
  gameId: string,
  title: string,
  overrides: Partial<
    Pick<
      ProductGameState,
      | "status"
      | "rating"
      | "inBacklog"
      | "inWishlist"
      | "storyCompleted"
      | "source"
      | "createdAt"
      | "updatedAt"
    >
  > = {},
): ProductGameState {
  return {
    gameId,
    title,
    inBacklog: false,
    inWishlist: false,
    source: "manual" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
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
    const ranked = scoreSeedGame(strongFit, state, getProfile(state), gamesById);

    expect(ranked.affinityScore).toBeGreaterThan(70);
    expect(ranked.platformAvailability).toBe("available");
    expect(ranked.inBacklog).toBe(false);
    expect(ranked.inWishlist).toBe(false);
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
    const ranked = scoreSeedGame(strongFit, state, getProfile(state), gamesById);

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

    const rankedAvailable = scoreSeedGame(
      available,
      availableState,
      getProfile(availableState),
      gamesById,
    );
    const rankedUnavailable = scoreSeedGame(
      unavailable,
      unavailableState,
      getProfile(unavailableState),
      gamesById,
    );

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

    state.user.gameStates[currentRun.gameId] = makeGameState(currentRun.gameId, currentRun.title, {
      status: "playing",
    });
    state.user.gameStates[sideRun.gameId] = makeGameState(sideRun.gameId, sideRun.title, {
      status: "playing",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    state.user.gameStates[nextUp.gameId] = makeGameState(nextUp.gameId, nextUp.title);
    state.user.gameStates[avoid.gameId] = makeGameState(avoid.gameId, avoid.title);
    state.user.gameStates[wishlist.gameId] = makeGameState(wishlist.gameId, wishlist.title, {
      inWishlist: true,
    });
    state.user.gameStates[alternative.gameId] = makeGameState(
      alternative.gameId,
      alternative.title,
    );

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

    state.user.gameStates[completed.gameId] = makeGameState(completed.gameId, completed.title, {
      status: "completed",
      rating: 4,
    });
    state.user.gameStates[nextUp.gameId] = makeGameState(nextUp.gameId, nextUp.title);

    const withoutMixed = scoreSeedGame(target, state, getProfile(state), gamesById);

    state.user.gameStates[mixedAnchor.gameId] = makeGameState(
      mixedAnchor.gameId,
      mixedAnchor.title,
      { status: "completed", rating: 3 },
    );

    const withMixed = scoreSeedGame(target, state, getProfile(state), gamesById);
    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.currentRun).toBeNull();
    expect(model.nextUp?.game.gameId).toBe("next");
    expect(model.playableAlternative?.game.gameId).toBe("target");
    expect(model.wishlistFit).toBeNull();
    expect(withMixed.affinityScore).toBe(withoutMixed.affinityScore);
    expect(withMixed.riskScore).toBe(withoutMixed.riskScore);
  });

  it("excludes mixed-rating games with terminal status from positive Today slots", () => {
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

    state.user.gameStates[mixed.gameId] = makeGameState(mixed.gameId, mixed.title, {
      status: "completed",
      rating: 3,
    });

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

    state.user.gameStates[paused.gameId] = makeGameState(paused.gameId, paused.title, {
      status: "shelved",
    });

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

    state.user.gameStates[inaccessibleWishlist.gameId] = makeGameState(
      inaccessibleWishlist.gameId,
      inaccessibleWishlist.title,
      { inWishlist: true },
    );

    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.nextUp?.game.gameId).toBe("next");
    expect(model.wishlistFit?.game.gameId).not.toBe("wish");
    expect(model.worthTracking?.game.gameId).toBe("wish");
  });

  it("removes abandoned games from Today and keeps their negative learning signal", () => {
    const state = createState();
    const abandoned = createGame("abandoned", "Abandoned Run", {
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
    const games = [abandoned, target, nextUp];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    const withoutDrop = scoreSeedGame(target, state, getProfile(state), gamesById);

    state.user.gameStates[abandoned.gameId] = makeGameState(abandoned.gameId, abandoned.title, {
      status: "abandoned",
      rating: 1,
    });
    state.user.gameStates[nextUp.gameId] = makeGameState(nextUp.gameId, nextUp.title);

    const withDrop = scoreSeedGame(target, state, getProfile(state), gamesById);
    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.currentRun).toBeNull();
    expect(model.resume).toBeNull();
    expect(model.nextUp?.game.gameId).toBe("target");
    expect(model.playableAlternative?.game.gameId).toBe("next");
    expect(model.wishlistFit).toBeNull();
    expect(withDrop.cautionReasons).toContain(
      "Shares genre overlap with games that already failed for you",
    );
    expect(withDrop.riskScore).toBeGreaterThanOrEqual(withoutDrop.riskScore);
  });

  it("excludes terminated-status games from Today slots", () => {
    const state = createState();
    const terminated = createGame("terminated", "Terminated Game");
    const nextUp = createGame("next", "Next Up", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const games = [terminated, nextUp];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    state.user.gameStates[terminated.gameId] = makeGameState(terminated.gameId, terminated.title, {
      status: "abandoned",
    });
    state.user.gameStates[nextUp.gameId] = makeGameState(nextUp.gameId, nextUp.title);

    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.nextUp?.game.gameId).toBe("next");
    expect(model.nextUp?.game.gameId).not.toBe("terminated");
  });

  it("selects highest-scoring game for next up slot", () => {
    const state = createState();
    const higherScored = createGame("higher", "Higher Scored", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
      emotionalComplexity: "high",
    });
    const lowerScored = createGame("lower", "Lower Scored", {
      storyStrength: "high",
      progressionClarity: "high",
      earlyHook: "high",
    });
    const games = [higherScored, lowerScored];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    state.user.gameStates[higherScored.gameId] = makeGameState(
      higherScored.gameId,
      higherScored.title,
    );
    state.user.gameStates[lowerScored.gameId] = makeGameState(
      lowerScored.gameId,
      lowerScored.title,
    );

    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.nextUp?.game.gameId).toBe("higher");
    expect(model.playableAlternative?.game.gameId).toBe("lower");
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
    state.user.gameStates[scored.gameId] = makeGameState(scored.gameId, scored.title);

    const rankedBasic = scoreSeedGame(basic, state, getProfile(state), gamesById);
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
