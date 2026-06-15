import { describe, expect, it } from "vitest";
import { createInitialState } from "../store/indexed-db";
import type { ProductProfile, ProductState, SeedGame } from "../types";
import { applyProductDecisionFeedback } from "./feedback";
import { buildTodayModel } from "./recommendations";

function createGame(gameId: string, title: string, overrides: Partial<SeedGame> = {}): SeedGame {
  return {
    gameId,
    title,
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre: "jrpg",
    tags: ["story_rich", "turn_based"],
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
    avoidedGenres: [],
    likedTags: { story_rich: 3, turn_based: 2 },
    dislikedTags: {},
    ratedCount: 3,
    signals: [],
  };
}

function createState(): ProductState {
  const state = createInitialState();
  state.user.profile = createProfile();
  state.user.onboarding.platforms = [{ platformId: "ps5", status: "available" }];
  state.user.onboarding.likedGameIds = ["anchor-a", "anchor-b", "anchor-c"];
  return state;
}

describe("decision feedback", () => {
  it.each([
    ["loved", 5],
    ["liked", 4],
    ["mixed", 3],
    ["not_for_me", 2],
  ] as const)("maps %s to rating %s", (feedback, rating) => {
    const game = createGame("target", "Target");
    const gamesById = new Map([
      ["target", game],
      ["anchor-a", createGame("anchor-a", "Anchor A")],
      ["anchor-b", createGame("anchor-b", "Anchor B")],
      ["anchor-c", createGame("anchor-c", "Anchor C")],
    ]);
    const state = createState();

    const next = applyProductDecisionFeedback({
      state,
      game,
      gamesById,
      feedback,
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(next.rating).toBe(rating);
  });

  it("marks maybe later as shelved backlog", () => {
    const game = createGame("target", "Target");
    const state = createState();

    const next = applyProductDecisionFeedback({
      state,
      game,
      gamesById: new Map([["target", game]]),
      feedback: "later",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(next.status).toBe("shelved");
    expect(next.inBacklog).toBe(true);
  });

  it.each([
    ["played_loved", "completed", 5, false],
    ["played_liked", "completed", 4, false],
    ["played_mixed", "completed", 3, false],
    ["played_dropped", "abandoned", 2, true],
  ] as const)("maps %s to played state", (feedback, status, rating, excluded) => {
    const game = createGame("target", "Target");
    const state = createState();

    const next = applyProductDecisionFeedback({
      state,
      game,
      gamesById: new Map([["target", game]]),
      feedback,
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(next.status).toBe(status);
    expect(next.rating).toBe(rating);
    expect(next.excluded).toBe(excluded);
    expect(next.inBacklog).toBe(false);
    expect(next.inPlayfitPicks).toBe(false);
  });

  it("removes a pick when feedback says it is not for the user", () => {
    const game = createGame("target", "Target");
    const state = createState();
    state.user.gameStates.target = {
      gameId: "target",
      title: "Target",
      inBacklog: false,
      inWishlist: false,
      inPlayfitPicks: true,
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const next = applyProductDecisionFeedback({
      state,
      game,
      gamesById: new Map([["target", game]]),
      feedback: "not_for_me",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(next.rating).toBe(2);
    expect(next.excluded).toBe(true);
    expect(next.inPlayfitPicks).toBe(false);
  });

  it("excludes not for me games from future play next candidates", () => {
    const target = createGame("target", "Target");
    const alternate = createGame("alternate", "Alternate");
    const state = createState();
    const gamesById = new Map([
      ["target", target],
      ["alternate", alternate],
      ["anchor-a", createGame("anchor-a", "Anchor A")],
      ["anchor-b", createGame("anchor-b", "Anchor B")],
      ["anchor-c", createGame("anchor-c", "Anchor C")],
    ]);

    applyProductDecisionFeedback({
      state,
      game: target,
      gamesById,
      feedback: "not_for_me",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    const model = buildTodayModel([target, alternate], state, state.user.profile);

    expect(state.user.gameStates.target.excluded).toBe(true);
    expect(state.user.gameStates.target.rating).toBe(2);
    expect(model.nextUp.map((entry) => entry.game.gameId)).not.toContain("target");
  });

  it("removes already played games from future play next candidates", () => {
    const target = createGame("target", "Target");
    const alternate = createGame("alternate", "Alternate");
    const state = createState();
    const gamesById = new Map([
      ["target", target],
      ["alternate", alternate],
      ["anchor-a", createGame("anchor-a", "Anchor A")],
      ["anchor-b", createGame("anchor-b", "Anchor B")],
      ["anchor-c", createGame("anchor-c", "Anchor C")],
    ]);

    applyProductDecisionFeedback({
      state,
      game: target,
      gamesById,
      feedback: "played_loved",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    const model = buildTodayModel([target, alternate], state, state.user.profile);

    expect(state.user.gameStates.target.status).toBe("completed");
    expect(state.user.gameStates.target.rating).toBe(5);
    expect(model.nextUp.map((entry) => entry.game.gameId)).not.toContain("target");
  });

  it("rebuilds the profile with the game that just received feedback", () => {
    const target = createGame("target", "Target", {
      genreId: "survival_horror",
      primaryGenre: "survival_horror",
      tags: ["survival_horror", "resource_pressure"],
    });
    const state = createState();
    const gamesById = new Map([
      ["target", target],
      ["anchor-a", createGame("anchor-a", "Anchor A")],
      ["anchor-b", createGame("anchor-b", "Anchor B")],
      ["anchor-c", createGame("anchor-c", "Anchor C")],
    ]);

    applyProductDecisionFeedback({
      state,
      game: target,
      gamesById,
      feedback: "not_for_me",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(state.user.profile?.avoidedGenres).toContain("survival_horror");
    expect(state.user.profile?.dislikedTags.survival_horror).toBeGreaterThan(0);
  });

  it("rebuilds the profile from already played feedback", () => {
    const target = createGame("target", "Target", {
      genreId: "survival_horror",
      primaryGenre: "survival_horror",
      tags: ["survival_horror", "resource_pressure"],
    });
    const state = createState();
    const gamesById = new Map([
      ["target", target],
      ["anchor-a", createGame("anchor-a", "Anchor A")],
      ["anchor-b", createGame("anchor-b", "Anchor B")],
      ["anchor-c", createGame("anchor-c", "Anchor C")],
    ]);

    applyProductDecisionFeedback({
      state,
      game: target,
      gamesById,
      feedback: "played_dropped",
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(state.user.profile?.avoidedGenres).toContain("survival_horror");
    expect(state.user.profile?.dislikedTags.survival_horror).toBeGreaterThan(0);
  });
});
