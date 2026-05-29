import { describe, expect, it } from "vitest";
import type {
  ProductGameState,
  ProductOnboardingDraft,
  ProductProfileOverrides,
  SeedGame,
} from "../types";
import { buildAdaptiveProfile, buildFallbackProfile, canAdvanceOnboarding } from "./onboarding";

function createDraft(): ProductOnboardingDraft {
  return {
    step: "platforms",
    platforms: [],
    likedGameIds: [],
  };
}

function createGame(gameId: string, title: string, primaryGenre: string): SeedGame {
  return {
    gameId,
    title,
    series: "",
    source: "catalog",
    primaryGenre,
    combatStyle: "action",
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
    availablePlatformIds: [],
    availablePlatformNames: [],
    releaseState: "released",
  };
}

describe("onboarding domain", () => {
  it("requires platforms and at least 3 liked games to advance", () => {
    const draft = createDraft();
    expect(canAdvanceOnboarding(draft)).toBe(false);

    draft.platforms.push({ platformId: "ps5", status: "available" });
    expect(canAdvanceOnboarding(draft)).toBe(false);

    draft.likedGameIds = ["a", "b", "c"];
    expect(canAdvanceOnboarding(draft)).toBe(true);
  });

  it("builds a fallback profile from liked game genres", () => {
    const draft = createDraft();
    draft.likedGameIds = ["ff7", "ff9", "chrono"];

    const gamesById = new Map<string, SeedGame>([
      ["ff7", createGame("ff7", "Final Fantasy VII", "jrpg")],
      ["ff9", createGame("ff9", "Final Fantasy IX", "jrpg")],
      ["chrono", createGame("chrono", "Chrono Trigger", "jrpg")],
    ]);

    const profile = buildFallbackProfile(draft, gamesById);

    expect(profile.likedGenres[0]).toBe("jrpg");
    expect(profile.avoidedGenres).toEqual([]);
    expect(profile.signals[0]).toBeDefined();
    expect(profile.signals[0].id).toBe("genre-fit");
  });

  it("builds a fallback profile with default priorities", () => {
    const draft = createDraft();
    draft.likedGameIds = ["ff7", "ff9", "chrono"];

    const gamesById = new Map<string, SeedGame>([
      ["ff7", createGame("ff7", "Final Fantasy VII", "jrpg")],
      ["ff9", createGame("ff9", "Final Fantasy IX", "jrpg")],
      ["chrono", createGame("chrono", "Chrono Trigger", "jrpg")],
    ]);

    const profile = buildFallbackProfile(draft, gamesById);

    expect(profile.priorities.story).toBe("medium");
    expect(profile.priorities.combat).toBe("low");
    expect(profile.avoidPatterns.slowStart).toBe(false);
    expect(profile.watchVsPlayRisk).toBe("medium");
  });

  it("adapts profile signals from outcomes while preserving overrides", () => {
    const draft = createDraft();
    draft.likedGameIds = ["liked-a", "liked-b", "liked-c"];

    const slowStoryGames: SeedGame[] = [
      createGame("slow-1", "Slow Story 1", "adventure"),
      createGame("slow-2", "Slow Story 2", "adventure"),
      createGame("slow-3", "Slow Story 3", "adventure"),
    ].map((game) => ({
      ...game,
      storyStrength: "high",
      pacingSpeed: "slow",
      earlyHook: "low",
    }));
    const gamesById = new Map<string, SeedGame>([
      ["liked-a", createGame("liked-a", "Liked A", "jrpg")],
      ["liked-b", createGame("liked-b", "Liked B", "jrpg")],
      ["liked-c", createGame("liked-c", "Liked C", "jrpg")],
      ...slowStoryGames.map((game) => [game.gameId, game] as [string, SeedGame]),
    ]);
    const gameStates: Record<string, ProductGameState> = Object.fromEntries(
      slowStoryGames.map((game) => [
        game.gameId,
        {
          gameId: game.gameId,
          title: game.title,
          status: "completed",
          rating: 4,
          inBacklog: false,
          inWishlist: false,
          storyCompleted: false,
          source: "manual",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ]),
    );
    const overrides: ProductProfileOverrides = {
      avoidPatterns: { slowStart: false },
      watchVsPlayRisk: "low",
    };

    const profile = buildAdaptiveProfile(draft, gamesById, gameStates, overrides);

    expect(profile.watchVsPlayRisk).toBe("low");
    expect(profile.avoidPatterns.slowStart).toBe(false);
    expect(profile.signals.map((signal) => signal.id)).not.toContain("slow-start-risk");
    expect(profile.signals.map((signal) => signal.id)).toContain("watch-play-confidence");
  });

  it("raises watch risk when abandoned games have high rating and story completed", () => {
    const draft = createDraft();
    draft.likedGameIds = ["liked-a", "liked-b", "liked-c"];

    const abandonedGame = createGame("abandoned-1", "Abandoned Story", "adventure");
    const gamesById = new Map<string, SeedGame>([
      ["liked-a", createGame("liked-a", "Liked A", "jrpg")],
      ["liked-b", createGame("liked-b", "Liked B", "jrpg")],
      ["liked-c", createGame("liked-c", "Liked C", "jrpg")],
      [
        abandonedGame.gameId,
        { ...abandonedGame, storyStrength: "high", pacingSpeed: "slow", earlyHook: "low" },
      ],
    ]);
    const gameStates: Record<string, ProductGameState> = {
      [abandonedGame.gameId]: {
        gameId: abandonedGame.gameId,
        title: abandonedGame.title,
        status: "abandoned",
        rating: 4.5,
        storyCompleted: true,
        inBacklog: false,
        inWishlist: false,
        source: "manual",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };

    const profile = buildAdaptiveProfile(draft, gamesById, gameStates);

    expect(profile.watchVsPlayRisk).toBe("high");
    expect(profile.signals.map((signal) => signal.id)).toContain("watch-risk");
  });

  it("ignores unrated games when building adaptive profile", () => {
    const draft = createDraft();
    draft.likedGameIds = ["liked-a", "liked-b", "liked-c"];

    const unrated = createGame("unrated-1", "Unrated Game", "action");
    const gamesById = new Map<string, SeedGame>([
      ["liked-a", createGame("liked-a", "Liked A", "jrpg")],
      ["liked-b", createGame("liked-b", "Liked B", "jrpg")],
      ["liked-c", createGame("liked-c", "Liked C", "jrpg")],
      [unrated.gameId, { ...unrated, storyStrength: "high" }],
    ]);
    const gameStates: Record<string, ProductGameState> = {
      [unrated.gameId]: {
        gameId: unrated.gameId,
        title: unrated.title,
        inBacklog: false,
        inWishlist: false,
        source: "manual",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };

    const profile = buildAdaptiveProfile(draft, gamesById, gameStates);

    expect(profile.priorities.story).toBe("medium");
    expect(profile.signals.length).toBe(1);
  });
});
