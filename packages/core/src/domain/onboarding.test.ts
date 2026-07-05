import { describe, expect, it } from "vitest";
import type { ProductGameState, ProductOnboardingDraft, ProductRating, SeedGame } from "../types";
import {
  buildAdaptiveProfile,
  buildFallbackProfile,
  buildTagPreferenceAnalysis,
  canAdvanceOnboarding,
} from "./onboarding";

function createDraft(): ProductOnboardingDraft {
  return {
    step: "platforms",
    platforms: [],
    likedGameIds: [],
    dislikedGameIds: [],
  };
}

function createGame(
  gameId: string,
  title: string,
  primaryGenre: string,
  tags: string[] = [],
): SeedGame {
  return {
    gameId,
    title,
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre,
    tags,
    notes: "",
    coverPath: "",
    availablePlatformIds: [],
    availablePlatformNames: [],
    releaseState: "released",
  };
}

function createGameState(gameId: string, rating: ProductRating): ProductGameState {
  return {
    gameId,
    title: gameId,
    rating,
    inBacklog: false,
    inWishlist: false,
    inPlayfitPicks: false,
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("onboarding domain", () => {
  it("requires platforms, at least 3 liked games, and a disliked game to advance", () => {
    const draft = createDraft();
    expect(canAdvanceOnboarding(draft)).toBe(false);

    draft.platforms.push({ platformId: "ps5", status: "available" });
    expect(canAdvanceOnboarding(draft)).toBe(false);

    draft.likedGameIds = ["a", "b", "c"];
    expect(canAdvanceOnboarding(draft)).toBe(false);

    draft.dislikedGameIds = ["d"];
    expect(canAdvanceOnboarding(draft)).toBe(true);
  });

  it("builds a fallback profile from liked game genres and tags", () => {
    const draft = createDraft();
    draft.likedGameIds = ["ff7", "ff9", "chrono"];

    const gamesById = new Map<string, SeedGame>([
      [
        "ff7",
        createGame("ff7", "Final Fantasy VII", "jrpg", ["story_rich", "turn_based", "fantasy"]),
      ],
      [
        "ff9",
        createGame("ff9", "Final Fantasy IX", "jrpg", ["story_rich", "turn_based", "fantasy"]),
      ],
      [
        "chrono",
        createGame("chrono", "Chrono Trigger", "jrpg", ["story_rich", "turn_based", "fantasy"]),
      ],
    ]);

    const profile = buildFallbackProfile(draft, gamesById);

    expect(profile.likedGenres[0]).toBe("jrpg");
    expect(profile.likedTags.story_rich).toBe(3);
    expect(profile.likedTags.turn_based).toBe(3);
    expect(profile.likedTags.fantasy).toBe(3);
    expect(profile.signals.length).toBeGreaterThanOrEqual(1);
  });

  it("builds adaptive profile from game ratings", () => {
    const draft = createDraft();
    draft.likedGameIds = ["anchor-a", "anchor-b", "anchor-c"];

    const gamesById = new Map<string, SeedGame>([
      ["anchor-a", createGame("anchor-a", "Anchor A", "jrpg", ["story_rich", "turn_based"])],
      ["anchor-b", createGame("anchor-b", "Anchor B", "jrpg", ["story_rich", "action_combat"])],
      ["anchor-c", createGame("anchor-c", "Anchor C", "jrpg", ["turn_based", "tactical"])],
      [
        "liked-game",
        createGame("liked-game", "Liked Game", "jrpg", ["story_rich", "turn_based", "fantasy"]),
      ],
      [
        "disliked-game",
        createGame("disliked-game", "Disliked Game", "action", [
          "shooter",
          "horror",
          "first_person",
        ]),
      ],
    ]);

    const gameStates: Record<string, ProductGameState> = {
      "liked-game": {
        gameId: "liked-game",
        title: "Liked Game",
        rating: 4,
        inBacklog: false,
        inWishlist: false,
        inPlayfitPicks: false,
        source: "manual",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      "disliked-game": {
        gameId: "disliked-game",
        title: "Disliked Game",
        rating: 1,
        inBacklog: false,
        inWishlist: false,
        inPlayfitPicks: false,
        source: "manual",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };

    const profile = buildAdaptiveProfile(draft, gamesById, gameStates);

    expect(profile.likedTags.story_rich).toBeGreaterThanOrEqual(1);
    expect(profile.likedTags.turn_based).toBeGreaterThanOrEqual(1);
    // "disliked-game" is rated 1/5 -> magnitude |1-3| = 2 (a full "hated it"
    // counts for more than a mild "not for me" would).
    expect(profile.dislikedTags.shooter).toBe(2);
    expect(profile.dislikedTags.horror).toBe(2);
    expect(profile.ratedCount).toBe(2);
    expect(profile.signals.length).toBeGreaterThan(0);
  });

  it("uses disliked setup games as early negative evidence", () => {
    const draft = createDraft();
    draft.likedGameIds = ["anchor-a", "anchor-b", "anchor-c"];
    draft.dislikedGameIds = ["bad-anchor"];

    const gamesById = new Map<string, SeedGame>([
      ["anchor-a", createGame("anchor-a", "Anchor A", "jrpg", ["story_rich"])],
      ["anchor-b", createGame("anchor-b", "Anchor B", "jrpg", ["turn_based"])],
      ["anchor-c", createGame("anchor-c", "Anchor C", "jrpg", ["fantasy"])],
      ["bad-anchor", createGame("bad-anchor", "Bad Anchor", "horror", ["horror", "dark"])],
    ]);

    const profile = buildAdaptiveProfile(draft, gamesById, {});
    const analysis = buildTagPreferenceAnalysis(draft, gamesById, {});

    expect(profile.dislikedTags.horror).toBe(1);
    expect(profile.dislikedTags.dark).toBe(1);
    expect(profile.avoidedGenres).toContain("horror");
    expect(analysis.badGameCount).toBe(1);
    expect(analysis.lowerRatedTags.map((entry) => entry.tag)).toContain("horror");
  });

  it("keeps a tag out of caution signals when positive evidence dominates", () => {
    const draft = createDraft();
    draft.likedGameIds = ["anchor-a", "anchor-b", "anchor-c"];

    const gamesById = new Map<string, SeedGame>([
      ["anchor-a", createGame("anchor-a", "Anchor A", "jrpg", ["cinematic"])],
      ["anchor-b", createGame("anchor-b", "Anchor B", "jrpg", ["cinematic"])],
      ["anchor-c", createGame("anchor-c", "Anchor C", "jrpg", ["story_rich"])],
      ["liked-a", createGame("liked-a", "Liked A", "jrpg", ["cinematic", "story_rich"])],
      ["liked-b", createGame("liked-b", "Liked B", "jrpg", ["cinematic", "action_combat"])],
      ["low", createGame("low", "Low", "action", ["cinematic", "horror"])],
    ]);
    const gameStates: Record<string, ProductGameState> = {
      "liked-a": {
        gameId: "liked-a",
        title: "Liked A",
        rating: 5,
        inBacklog: false,
        inWishlist: false,
        inPlayfitPicks: false,
        source: "manual",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      "liked-b": {
        gameId: "liked-b",
        title: "Liked B",
        rating: 4,
        inBacklog: false,
        inWishlist: false,
        inPlayfitPicks: false,
        source: "manual",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      low: {
        gameId: "low",
        title: "Low",
        rating: 1,
        inBacklog: false,
        inWishlist: false,
        inPlayfitPicks: false,
        source: "manual",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };

    const profile = buildAdaptiveProfile(draft, gamesById, gameStates);

    // liked-a is rated 5 (magnitude 2) + liked-b rated 4 (magnitude 1) = 3,
    // plus 2 anchor games tagged cinematic = 5 total positive evidence.
    expect(profile.likedTags.cinematic).toBe(5);
    expect(profile.dislikedTags.cinematic).toBeUndefined();
    // "low" is rated 1/5 -> magnitude 2, not the old flat 1.
    expect(profile.dislikedTags.horror).toBe(2);
    expect(profile.signals.map((signal) => signal.id)).not.toContain("tag-risk-cinematic");
  });

  it("treats a rating of 3 (mixed) as zero evidence and excludes it from ratedCount", () => {
    const draft = createDraft();
    draft.likedGameIds = ["anchor-a", "anchor-b", "anchor-c"];

    const gamesById = new Map<string, SeedGame>([
      ["anchor-a", createGame("anchor-a", "Anchor A", "jrpg", ["story_rich"])],
      ["anchor-b", createGame("anchor-b", "Anchor B", "jrpg", ["story_rich"])],
      ["anchor-c", createGame("anchor-c", "Anchor C", "jrpg", ["story_rich"])],
      ["mixed-1", createGame("mixed-1", "Mixed 1", "action", ["horror"])],
      ["mixed-2", createGame("mixed-2", "Mixed 2", "action", ["horror"])],
      ["mixed-3", createGame("mixed-3", "Mixed 3", "action", ["horror"])],
      ["mixed-4", createGame("mixed-4", "Mixed 4", "action", ["horror"])],
      ["mixed-5", createGame("mixed-5", "Mixed 5", "action", ["horror"])],
      ["mixed-6", createGame("mixed-6", "Mixed 6", "action", ["horror"])],
    ]);
    const gameStates: Record<string, ProductGameState> = {
      "mixed-1": createGameState("mixed-1", 3),
      "mixed-2": createGameState("mixed-2", 3),
      "mixed-3": createGameState("mixed-3", 3),
      "mixed-4": createGameState("mixed-4", 3),
      "mixed-5": createGameState("mixed-5", 3),
      "mixed-6": createGameState("mixed-6", 3),
    };

    const profile = buildAdaptiveProfile(draft, gamesById, gameStates);

    // Six "mixed" (3/5) ratings should NOT push ratedCount into "high"
    // confidence -- they carry zero evidence, not full-strength evidence.
    expect(profile.ratedCount).toBe(0);
    expect(profile.likedTags.horror).toBeUndefined();
    expect(profile.dislikedTags.horror).toBeUndefined();
  });

  it("scales tag evidence by how far a rating is from neutral (3)", () => {
    const draft = createDraft();

    const gamesById = new Map<string, SeedGame>([
      ["loved", createGame("loved", "Loved", "jrpg", ["metroidvania"])],
      ["liked", createGame("liked", "Liked", "jrpg", ["metroidvania"])],
    ]);
    const gameStates: Record<string, ProductGameState> = {
      loved: createGameState("loved", 5),
      liked: createGameState("liked", 4),
    };

    const profile = buildAdaptiveProfile(draft, gamesById, gameStates);

    // rating 5 -> magnitude 2, rating 4 -> magnitude 1: a "loved it" should
    // count for more than a "liked it", not the same flat +1 each.
    expect(profile.likedTags.metroidvania).toBe(3);
  });

  it("ignores unrated games when building adaptive profile", () => {
    const draft = createDraft();
    draft.likedGameIds = ["liked-a", "liked-b", "liked-c"];

    const gamesById = new Map<string, SeedGame>([
      ["liked-a", createGame("liked-a", "Liked A", "jrpg", ["story_rich"])],
      ["liked-b", createGame("liked-b", "Liked B", "jrpg", ["turn_based"])],
      ["liked-c", createGame("liked-c", "Liked C", "jrpg", ["fantasy"])],
      ["unrated", createGame("unrated", "Unrated Game", "action", ["shooter"])],
    ]);
    const gameStates: Record<string, ProductGameState> = {
      unrated: {
        gameId: "unrated",
        title: "Unrated Game",
        inBacklog: false,
        inWishlist: false,
        inPlayfitPicks: false,
        source: "manual",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    };

    const profile = buildAdaptiveProfile(draft, gamesById, gameStates);

    expect(profile.ratedCount).toBe(0);
    expect(Object.keys(profile.dislikedTags)).toHaveLength(0);
  });

  it("treats a zero rating as unrated profile evidence", () => {
    const draft = createDraft();
    draft.likedGameIds = ["liked-a", "liked-b", "liked-c"];

    const gamesById = new Map<string, SeedGame>([
      ["liked-a", createGame("liked-a", "Liked A", "jrpg", ["story_rich"])],
      ["liked-b", createGame("liked-b", "Liked B", "jrpg", ["turn_based"])],
      ["liked-c", createGame("liked-c", "Liked C", "jrpg", ["fantasy"])],
      ["cleared", createGame("cleared", "Cleared Rating", "action", ["shooter"])],
    ]);
    const gameStates = {
      cleared: createGameState("cleared", 0),
    };

    const profile = buildAdaptiveProfile(draft, gamesById, gameStates);
    const analysis = buildTagPreferenceAnalysis(draft, gamesById, gameStates);

    expect(profile.ratedCount).toBe(0);
    expect(profile.dislikedTags.shooter).toBeUndefined();
    expect(analysis.badGameCount).toBe(0);
    expect(analysis.lowerRatedTags.map((entry) => entry.tag)).not.toContain("shooter");
  });

  it("isolates tags unique to lower-rated games as dislike reasons", () => {
    const draft = createDraft();
    draft.likedGameIds = ["good-a", "good-b"];
    const gamesById = new Map<string, SeedGame>([
      ["good-a", createGame("good-a", "Good A", "jrpg", ["story_rich"])],
      ["good-b", createGame("good-b", "Good B", "jrpg", ["turn_based"])],
      ["bad-a", createGame("bad-a", "Bad A", "horror", ["horror", "dark"])],
      ["bad-b", createGame("bad-b", "Bad B", "horror", ["horror", "survival"])],
    ]);
    const gameStates = {
      "bad-a": createGameState("bad-a", 1),
      "bad-b": createGameState("bad-b", 2),
    };

    const analysis = buildTagPreferenceAnalysis(draft, gamesById, gameStates);

    expect(analysis.uniqueLowerRatedTags.map((entry) => entry.tag)).toContain("horror");
  });

  it("does not treat common tags as dislike reasons when lower-rated lift is too low", () => {
    const draft = createDraft();
    draft.likedGameIds = ["good-a", "good-b"];
    const gamesById = new Map<string, SeedGame>([
      ["good-a", createGame("good-a", "Good A", "action", ["cinematic"])],
      ["good-b", createGame("good-b", "Good B", "action", ["cinematic"])],
      ["bad-a", createGame("bad-a", "Bad A", "action", ["cinematic"])],
      ["bad-b", createGame("bad-b", "Bad B", "action", ["cinematic"])],
    ]);
    const gameStates = {
      "bad-a": createGameState("bad-a", 1),
      "bad-b": createGameState("bad-b", 2),
    };

    const analysis = buildTagPreferenceAnalysis(draft, gamesById, gameStates);

    expect(analysis.uniqueLowerRatedTags.map((entry) => entry.tag)).not.toContain("cinematic");
    expect(analysis.overrepresentedLowerRatedTags.map((entry) => entry.tag)).not.toContain(
      "cinematic",
    );
  });

  it("marks shared tags as overrepresented when lower-rated lift is high enough", () => {
    const draft = createDraft();
    draft.likedGameIds = ["good-a", "good-b", "good-c", "good-d"];
    const gamesById = new Map<string, SeedGame>([
      ["good-a", createGame("good-a", "Good A", "action", ["survival"])],
      ["good-b", createGame("good-b", "Good B", "action", ["story_rich"])],
      ["good-c", createGame("good-c", "Good C", "action", ["story_rich"])],
      ["good-d", createGame("good-d", "Good D", "action", ["story_rich"])],
      ["bad-a", createGame("bad-a", "Bad A", "action", ["survival"])],
      ["bad-b", createGame("bad-b", "Bad B", "action", ["survival"])],
    ]);
    const gameStates = {
      "bad-a": createGameState("bad-a", 1),
      "bad-b": createGameState("bad-b", 2),
    };

    const analysis = buildTagPreferenceAnalysis(draft, gamesById, gameStates);

    expect(analysis.overrepresentedLowerRatedTags.map((entry) => entry.tag)).toContain("survival");
  });

  it("keeps neutral ratings out of tag preference analysis", () => {
    const draft = createDraft();
    draft.likedGameIds = ["good-a", "good-b"];
    const gamesById = new Map<string, SeedGame>([
      ["good-a", createGame("good-a", "Good A", "jrpg", ["story_rich"])],
      ["good-b", createGame("good-b", "Good B", "jrpg", ["turn_based"])],
      ["neutral-a", createGame("neutral-a", "Neutral A", "puzzle", ["neutral_tag"])],
      ["neutral-b", createGame("neutral-b", "Neutral B", "puzzle", ["neutral_tag"])],
    ]);
    const gameStates = {
      "neutral-a": createGameState("neutral-a", 3),
      "neutral-b": createGameState("neutral-b", 2.5),
    };

    const analysis = buildTagPreferenceAnalysis(draft, gamesById, gameStates);

    expect(analysis.higherRatedTags.map((entry) => entry.tag)).not.toContain("neutral_tag");
    expect(analysis.lowerRatedTags.map((entry) => entry.tag)).not.toContain("neutral_tag");
  });

  it("lets a low rating override favorite evidence for the same game", () => {
    const draft = createDraft();
    draft.likedGameIds = ["favorite-bad", "good-a", "good-b"];
    const gamesById = new Map<string, SeedGame>([
      ["favorite-bad", createGame("favorite-bad", "Favorite Bad", "action", ["demanding"])],
      ["good-a", createGame("good-a", "Good A", "jrpg", ["story_rich"])],
      ["good-b", createGame("good-b", "Good B", "jrpg", ["turn_based"])],
      ["bad-b", createGame("bad-b", "Bad B", "action", ["demanding"])],
    ]);
    const gameStates = {
      "favorite-bad": createGameState("favorite-bad", 1),
      "bad-b": createGameState("bad-b", 2),
    };

    const analysis = buildTagPreferenceAnalysis(draft, gamesById, gameStates);
    const demanding = analysis.lowerRatedTags.find((entry) => entry.tag === "demanding");

    expect(demanding?.positiveCount).toBe(0);
    expect(analysis.uniqueLowerRatedTags.map((entry) => entry.tag)).toContain("demanding");
  });

  it("requires at least two lower-rated games before emitting dislike reasons", () => {
    const draft = createDraft();
    draft.likedGameIds = ["good-a", "good-b"];
    const gamesById = new Map<string, SeedGame>([
      ["good-a", createGame("good-a", "Good A", "jrpg", ["story_rich"])],
      ["good-b", createGame("good-b", "Good B", "jrpg", ["turn_based"])],
      ["bad-a", createGame("bad-a", "Bad A", "horror", ["horror"])],
    ]);
    const gameStates = {
      "bad-a": createGameState("bad-a", 1),
    };

    const analysis = buildTagPreferenceAnalysis(draft, gamesById, gameStates);

    expect(analysis.badGameCount).toBe(1);
    expect(analysis.lowerRatedTags.map((entry) => entry.tag)).toContain("horror");
    expect(analysis.uniqueLowerRatedTags).toHaveLength(0);
    expect(analysis.overrepresentedLowerRatedTags).toHaveLength(0);
  });
});
