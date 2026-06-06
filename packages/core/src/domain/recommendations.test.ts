import { describe, expect, it } from "vitest";
import { createInitialState } from "../store/indexed-db";
import type { ProductGameState, ProductProfile, ProductState, SeedGame } from "../types";
import {
  buildFinderIndex,
  buildTodayModel,
  findExactSeedGame,
  findSimilarGames,
  scoreSeedGame,
  searchSeedGames,
} from "./recommendations";

function createGame(gameId: string, title: string, overrides: Partial<SeedGame> = {}): SeedGame {
  return {
    gameId,
    title,
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre: "jrpg",
    tags: ["story_rich", "turn_based", "fantasy", "lore_heavy"],
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
    likedGenres: ["jrpg"],
    avoidedGenres: ["looter"],
    likedTags: {
      story_rich: 3,
      turn_based: 2,
      fantasy: 2,
      tactical: 1,
    },
    dislikedTags: {
      horror: 2,
      shooter: 1,
    },
    ratedCount: 6,
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
      "status" | "rating" | "inBacklog" | "inWishlist" | "source" | "createdAt" | "updatedAt"
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
  it("scores games with affinity based on tag overlap", () => {
    const state = createState();
    const gamesById = new Map<string, SeedGame>();
    const strongFit = createGame("fit", "Strong Fit", {
      tags: ["story_rich", "turn_based", "fantasy", "lore_heavy", "tactical"],
    });

    gamesById.set(strongFit.gameId, strongFit);
    const ranked = scoreSeedGame(strongFit, state, getProfile(state), gamesById);

    expect(ranked.affinityScore).toBeGreaterThan(40);
    expect(ranked.platformAvailability).toBe("available");
    expect(ranked.inBacklog).toBe(false);
    expect(ranked.inWishlist).toBe(false);
    expect(ranked.fitReasons.length).toBeGreaterThan(0);
  });

  it("penalizes games with disliked tags", () => {
    const state = createState();
    const gamesById = new Map<string, SeedGame>();
    const riskyFit = createGame("risky", "Risky Fit", {
      tags: ["horror", "shooter", "dark", "first_person"],
    });

    gamesById.set(riskyFit.gameId, riskyFit);
    const ranked = scoreSeedGame(riskyFit, state, getProfile(state), gamesById);

    expect(ranked.riskScore).toBeGreaterThan(30);
    expect(ranked.cautionReasons.length).toBeGreaterThan(0);
  });

  it("uses net tag evidence when a saved profile has the same tag on both sides", () => {
    const state = createState();
    if (state.user.profile) {
      state.user.profile.likedTags.action_combat = 12;
      state.user.profile.dislikedTags.action_combat = 2;
    }
    const gamesById = new Map<string, SeedGame>();
    const actionGame = createGame("action", "Action Game", {
      tags: ["action_combat"],
    });

    gamesById.set(actionGame.gameId, actionGame);
    const ranked = scoreSeedGame(actionGame, state, getProfile(state), gamesById);

    expect(ranked.fitReasons).toContain("You tend to like action combat");
    expect(ranked.cautionReasons).not.toContain("You tend to dislike action combat");
  });

  it("keeps early recommendations low confidence until enough outcomes exist", () => {
    const state = createState();
    if (state.user.profile) {
      state.user.profile.ratedCount = 1;
    }
    const gamesById = new Map<string, SeedGame>();
    const strongFit = createGame("fit", "Strong Fit", {
      tags: ["story_rich", "turn_based", "fantasy"],
    });

    gamesById.set(strongFit.gameId, strongFit);
    const ranked = scoreSeedGame(strongFit, state, getProfile(state), gamesById);

    expect(ranked.confidence).toBe("low");
    expect(ranked.affinityScore).toBeLessThanOrEqual(75);
  });

  it("raises confidence with more rated games", () => {
    const state = createState();
    if (state.user.profile) {
      state.user.profile.ratedCount = 7;
    }
    const gamesById = new Map<string, SeedGame>();
    const game = createGame("test", "Test Game", {
      tags: ["story_rich"],
    });

    gamesById.set(game.gameId, game);
    const ranked = scoreSeedGame(game, state, getProfile(state), gamesById);

    expect(ranked.confidence).toBe("high");
  });

  it("treats untagged games as unscored", () => {
    const state = createState();
    const gamesById = new Map<string, SeedGame>();
    const untagged = createGame("untagged", "Untagged Game", {
      tags: [],
    });

    gamesById.set(untagged.gameId, untagged);
    const ranked = scoreSeedGame(untagged, state, getProfile(state), gamesById);

    expect(ranked.affinityScore).toBe(0);
    expect(ranked.confidence).toBe("low");
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
  });

  it("supports multiple playing games in current run", () => {
    const state = createState();
    const currentRun = createGame("current", "Current Run", {
      tags: ["story_rich", "turn_based"],
    });
    const sideRun = createGame("side", "Side Run", {
      tags: ["story_rich", "action_combat"],
    });
    const nextUp = createGame("next", "Next Up", {
      tags: ["story_rich", "tactical"],
    });
    const alternative = createGame("alternative", "Alternative", {
      tags: ["story_rich", "tactical"],
    });
    const unreleased = createGame("future", "Future Game", {
      releaseState: "unreleased",
      tags: ["story_rich", "action_combat"],
    });
    const games = [currentRun, sideRun, nextUp, alternative, unreleased];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    state.user.gameStates[currentRun.gameId] = makeGameState(currentRun.gameId, currentRun.title, {
      status: "playing",
    });
    state.user.gameStates[sideRun.gameId] = makeGameState(sideRun.gameId, sideRun.title, {
      status: "playing",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    state.user.gameStates[nextUp.gameId] = makeGameState(nextUp.gameId, nextUp.title);
    state.user.gameStates[alternative.gameId] = makeGameState(
      alternative.gameId,
      alternative.title,
    );

    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.currentRun.map((entry) => entry.game.gameId)).toContain("current");
    expect(model.currentRun.map((entry) => entry.game.gameId)).toContain("side");
    expect(model.currentRun[0].game.gameId).toBe("current");
    expect(model.nextUp[0].game.gameId).toBe("next");
    expect(model.nextUp[0].game.gameId).not.toBe("current");
    expect(model.nextUp[0].game.gameId).not.toBe("side");
    expect(model.nextUp[1].game.gameId).toBe("alternative");
    expect(model.nextUp[0].game.gameId).not.toBe("future");
  });

  it("removes completed games from Today model", () => {
    const state = createState();
    const completed = createGame("done", "Finished Run", {
      tags: ["story_rich", "turn_based"],
    });
    const nextUp = createGame("next", "Next Up", {
      tags: ["story_rich", "tactical"],
    });
    const games = [completed, nextUp];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    state.user.gameStates[completed.gameId] = makeGameState(completed.gameId, completed.title, {
      status: "completed",
    });
    state.user.gameStates[nextUp.gameId] = makeGameState(nextUp.gameId, nextUp.title);

    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.currentRun.length).toBe(0);
    expect(model.nextUp[0].game.gameId).toBe("next");
  });

  it("excludes terminated-status games from Today slots", () => {
    const state = createState();
    const terminated = createGame("terminated", "Terminated Game");
    const nextUp = createGame("next", "Next Up", {
      tags: ["story_rich", "tactical"],
    });
    const games = [terminated, nextUp];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    state.user.gameStates[terminated.gameId] = makeGameState(terminated.gameId, terminated.title, {
      status: "abandoned",
    });
    state.user.gameStates[nextUp.gameId] = makeGameState(nextUp.gameId, nextUp.title);

    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.nextUp[0].game.gameId).toBe("next");
    expect(model.nextUp[0].game.gameId).not.toBe("terminated");
  });

  it("selects highest affinity game for next up slot", () => {
    const state = createState();
    const higherScored = createGame("higher", "Higher Scored", {
      tags: ["story_rich", "turn_based", "fantasy", "tactical", "branching_narrative"],
    });
    const lowerScored = createGame("lower", "Lower Scored", {
      tags: ["story_rich"],
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

    expect(model.nextUp[0].game.gameId).toBe("higher");
    expect(model.nextUp[1].game.gameId).toBe("lower");
  });

  it("caps nextUp at 10 and resume at 10", () => {
    const state = createState();
    const likedTagGames = new Array(12).fill(null).map((_, i) =>
      createGame(`candidate-${i}`, `Candidate ${i}`, {
        tags: ["story_rich", "turn_based", "fantasy", "tactical"],
      }),
    );
    const games = likedTagGames;
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.nextUp.length).toBe(10);
    expect(model.currentRun.length).toBe(0);
    expect(model.resume.length).toBe(0);
  });

  it("caps resume at 10", () => {
    const state = createState();
    const heldGames = new Array(12).fill(null).map((_, i) =>
      createGame(`hold-${i}`, `Hold ${i}`, {
        tags: ["story_rich", "turn_based", "fantasy"],
      }),
    );
    const games = heldGames;
    const gamesById = new Map(games.map((game) => [game.gameId, game]));

    for (const game of heldGames) {
      state.user.gameStates[game.gameId] = makeGameState(game.gameId, game.title, {
        status: "on_hold",
      });
    }

    const model = buildTodayModel(games, state, state.user.profile, gamesById);

    expect(model.resume.length).toBe(10);
    expect(model.nextUp.length).toBe(0);
  });

  it("returns similar games based on tag cosine similarity", () => {
    const reference = createGame("reference", "Reference Game", {
      tags: ["story_rich", "turn_based", "fantasy", "lore_heavy"],
    });
    const similar = createGame("similar", "Similar Game", {
      tags: ["story_rich", "turn_based", "fantasy", "lore_heavy", "tactical"],
    });
    const different = createGame("different", "Different Game", {
      tags: ["shooter", "first_person", "horror", "dark"],
    });

    const allGames = [reference, similar, different];
    const results = findSimilarGames(reference, allGames, 3);

    expect(results[0]?.gameId).toBe("similar");
    expect(results.map((g) => g.gameId)).not.toContain("reference");
    expect(results.findIndex((g) => g.gameId === "similar")).toBeLessThan(
      results.findIndex((g) => g.gameId === "different"),
    );
  });

  it("keeps untagged Finder records searchable but out of Today scoring", () => {
    const state = createState();
    const scored = createGame("scored", "Scored Game", {
      tags: ["story_rich", "turn_based"],
    });
    const basic = createGame("steam-basic", "Steam Basic Game", {
      source: "finder",
      aliases: ["Basic Alias"],
      tags: [],
    });
    const games = [scored, basic];
    const gamesById = new Map(games.map((game) => [game.gameId, game]));
    state.user.gameStates[scored.gameId] = makeGameState(scored.gameId, scored.title);

    const rankedBasic = scoreSeedGame(basic, state, getProfile(state), gamesById);
    const model = buildTodayModel(games, state, state.user.profile, gamesById);
    const index = buildFinderIndex(games);

    expect(rankedBasic.confidence).toBe("low");
    expect(rankedBasic.fitReasons[0]).toContain("hasn't been categorized");
    expect(model.nextUp[0].game.gameId).toBe("scored");
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
