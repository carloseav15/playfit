import { describe, expect, it } from "vitest";
import { createInitialState } from "../store/indexed-db";
import type { ProductProfile, ProductState, SeedGame } from "../types";
import {
  applyProductDecisionFeedback,
  applyProductStartedAction,
  applyProductTasteAction,
  applyProductTasteUndo,
} from "./feedback";
import { buildAdaptiveProfile } from "./onboarding";
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

function semanticState(state: ProductState) {
  return {
    onboarding: state.user.onboarding,
    onboardingCompletedAt: state.user.onboardingCompletedAt,
    profile: state.user.profile,
    gameStates: Object.fromEntries(
      Object.entries(state.user.gameStates).map(([gameId, gameState]) => {
        const { createdAt: _createdAt, updatedAt: _updatedAt, ...semanticGameState } = gameState;
        return [gameId, semanticGameState];
      }),
    ),
  };
}

describe("decision feedback", () => {
  it("starts a recommendation without changing taste evidence or maturity", () => {
    const game = createGame("target", "Target");
    const state = createState();
    state.user.gameStates.target = {
      gameId: "target",
      title: "Target",
      inBacklog: true,
      inWishlist: false,
      inPlayfitPicks: true,
      excluded: true,
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const profileBefore = structuredClone(state.user.profile);

    const next = applyProductStartedAction({
      state,
      game,
      timestamp: "2026-01-02T00:00:00.000Z",
    });

    expect(next.status).toBe("playing");
    expect(next.rating).toBeUndefined();
    expect(next.inPlayfitPicks).toBe(false);
    expect(next.inBacklog).toBe(false);
    expect(next.excluded).toBe(false);
    expect(state.user.profile).toEqual(profileBefore);
  });

  it.each([
    "not_for_me",
    "loved",
    "liked",
  ] as const)("restores the semantic state after canonical %s is undone", (actionType) => {
    const target = createGame("target", "Target");
    const existing = createGame("existing", "Existing", { tags: ["exploration"] });
    const anchors = [
      createGame("anchor-a", "Anchor A"),
      createGame("anchor-b", "Anchor B"),
      createGame("anchor-c", "Anchor C"),
    ];
    const gamesById = new Map(
      [target, existing, ...anchors].map((game) => [game.gameId, game] as const),
    );
    const state = createState();
    state.user.gameStates.existing = {
      gameId: "existing",
      title: "Existing",
      rating: 4,
      inBacklog: false,
      inWishlist: true,
      inPlayfitPicks: true,
      source: "manual",
      createdAt: "2025-12-01T00:00:00.000Z",
      updatedAt: "2025-12-01T00:00:00.000Z",
    };
    state.user.profile = buildAdaptiveProfile(
      state.user.onboarding,
      gamesById,
      state.user.gameStates,
    );
    const before = structuredClone(state);

    applyProductTasteAction({
      state,
      game: target,
      gamesById,
      actionType,
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    applyProductTasteUndo({
      state,
      gameId: target.gameId,
      previousGameState: null,
      gamesById,
      timestamp: "2026-01-02T00:00:00.000Z",
    });

    expect(semanticState(state)).toEqual(semanticState(before));
  });

  it("restores every field of a pre-existing game state before rebuilding the profile", () => {
    const target = createGame("target", "Target");
    const gamesById = new Map([[target.gameId, target]]);
    const state = createState();
    const previous = {
      gameId: "target",
      title: "Target",
      status: "on_hold" as const,
      rating: 3 as const,
      inBacklog: true,
      inWishlist: true,
      inPlayfitPicks: true,
      excluded: false,
      source: "finder" as const,
      createdAt: "2025-12-01T00:00:00.000Z",
      updatedAt: "2025-12-02T00:00:00.000Z",
    };
    state.user.gameStates.target = structuredClone(previous);
    state.user.profile = buildAdaptiveProfile(
      state.user.onboarding,
      gamesById,
      state.user.gameStates,
    );

    applyProductTasteAction({ state, game: target, gamesById, actionType: "not_for_me" });
    applyProductTasteUndo({ state, gameId: target.gameId, previousGameState: previous, gamesById });

    expect(state.user.gameStates.target).toEqual(previous);
  });

  it.each([
    ["not_for_me", 2, true],
    ["loved", 5, false],
    ["liked", 4, false],
  ] as const)("applies canonical %s transitions", (actionType, rating, excluded) => {
    const game = createGame("target", "Target");
    const state = createState();

    const next = applyProductTasteAction({
      state,
      game,
      gamesById: new Map([["target", game]]),
      actionType,
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(next.rating).toBe(rating);
    expect(next.excluded ?? false).toBe(excluded);
    expect(state.user.lastUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
    if (actionType === "not_for_me") {
      expect(state.user.profile?.dislikedTags.story_rich).toBe(1);
    } else {
      expect(state.user.profile?.likedTags.story_rich).toBe(actionType === "loved" ? 2 : 1);
    }
  });

  it("marks canonical Loved as completed when it came from Already Played", () => {
    const game = createGame("target", "Target");
    const state = createState();

    const next = applyProductTasteAction({
      state,
      game,
      gamesById: new Map([["target", game]]),
      actionType: "loved",
      played: true,
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(next.status).toBe("completed");
    expect(next.rating).toBe(5);
  });

  it("records canonical Mixed without adding taste evidence or maturity", () => {
    const game = createGame("target", "Target", {
      genreId: "survival_horror",
      primaryGenre: "survival_horror",
      tags: ["survival_horror", "resource_pressure"],
    });
    const state = createState();
    const gamesById = new Map([[game.gameId, game]]);
    state.user.profile = buildAdaptiveProfile(
      state.user.onboarding,
      gamesById,
      state.user.gameStates,
    );
    const profileBefore = structuredClone(state.user.profile);

    const next = applyProductTasteAction({
      state,
      game,
      gamesById,
      actionType: "mixed",
      played: true,
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(next).toMatchObject({ status: "completed", rating: 3, excluded: false });
    expect(state.user.profile).toEqual(profileBefore);
  });

  it("records canonical Dropped as terminal negative evidence", () => {
    const game = createGame("target", "Target", {
      genreId: "survival_horror",
      primaryGenre: "survival_horror",
      tags: ["survival_horror", "resource_pressure"],
    });
    const state = createState();
    const next = applyProductTasteAction({
      state,
      game,
      gamesById: new Map([[game.gameId, game]]),
      actionType: "dropped",
      played: true,
      timestamp: "2026-01-01T00:00:00.000Z",
    });

    expect(next).toMatchObject({ status: "abandoned", rating: 2, excluded: true });
    expect(state.user.profile?.dislikedTags.survival_horror).toBeGreaterThan(0);
  });

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
