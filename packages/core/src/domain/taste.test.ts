import { describe, expect, it } from "vitest";
import type {
  ProductGameState,
  ProductOnboardingDraft,
  ProductProfile,
  ProductRating,
  SeedGame,
} from "../types";
import { buildTasteModel } from "./taste";

function createGame(gameId: string, title: string, overrides: Partial<SeedGame> = {}): SeedGame {
  return {
    gameId,
    title,
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre: "jrpg",
    genreId: "jrpg",
    tags: ["story_rich", "turn_based"],
    notes: "",
    coverPath: "",
    availablePlatformIds: ["ps5"],
    availablePlatformNames: ["PS5"],
    releaseState: "released",
    ...overrides,
  };
}

function createDraft(overrides: Partial<ProductOnboardingDraft> = {}): ProductOnboardingDraft {
  return {
    step: "dislikes",
    platforms: [{ platformId: "ps5", status: "available" }],
    likedGameIds: [],
    dislikedGameIds: [],
    ...overrides,
  };
}

function createGameState(
  game: SeedGame,
  overrides: Partial<ProductGameState> = {},
): ProductGameState {
  return {
    gameId: game.gameId,
    title: game.title,
    inBacklog: false,
    inWishlist: false,
    excluded: false,
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const profile: ProductProfile = {
  summary: "test",
  likedGenres: ["jrpg"],
  avoidedGenres: ["horror"],
  likedTags: {},
  dislikedTags: {},
  ratedCount: 0,
  signals: [],
};

describe("buildTasteModel", () => {
  it("includes onboarding liked games as positive setup signals", () => {
    const liked = createGame("liked", "Liked");
    const model = buildTasteModel(
      createDraft({ likedGameIds: [liked.gameId] }),
      {},
      new Map([[liked.gameId, liked]]),
      profile,
    );

    expect(model.positiveCount).toBe(1);
    expect(model.historyEntries[0]).toMatchObject({
      gameId: liked.gameId,
      decision: "setup_favorite",
      source: "onboarding_liked",
      tone: "positive",
    });
  });

  it("includes onboarding disliked games as negative setup signals", () => {
    const disliked = createGame("disliked", "Disliked", {
      primaryGenre: "horror",
      genreId: "horror",
      tags: ["horror", "dark"],
    });
    const model = buildTasteModel(
      createDraft({ dislikedGameIds: [disliked.gameId] }),
      {},
      new Map([[disliked.gameId, disliked]]),
      profile,
    );

    expect(model.negativeCount).toBe(1);
    expect(model.historyEntries[0]).toMatchObject({
      gameId: disliked.gameId,
      decision: "setup_miss",
      source: "onboarding_disliked",
      tone: "negative",
    });
  });

  it.each([
    [5, "loved"],
    [4, "liked"],
    [3, "mixed"],
    [2, "not_for_me"],
  ] as const)("maps rating %s to %s", (rating, decision) => {
    const game = createGame(`rated-${rating}`, `Rated ${rating}`);
    const model = buildTasteModel(
      createDraft(),
      { [game.gameId]: createGameState(game, { rating: rating as ProductRating }) },
      new Map([[game.gameId, game]]),
      profile,
    );

    expect(model.historyEntries[0]?.decision).toBe(decision);
  });

  it("maps abandoned feedback to dropped", () => {
    const game = createGame("dropped", "Dropped");
    const model = buildTasteModel(
      createDraft(),
      { [game.gameId]: createGameState(game, { rating: 2, status: "abandoned", excluded: true }) },
      new Map([[game.gameId, game]]),
      profile,
    );

    expect(model.historyEntries[0]).toMatchObject({
      decision: "dropped",
      tone: "negative",
    });
  });

  it("does not count maybe later as a taste signal", () => {
    const game = createGame("later", "Later");
    const model = buildTasteModel(
      createDraft(),
      { [game.gameId]: createGameState(game, { status: "shelved", inBacklog: true }) },
      new Map([[game.gameId, game]]),
      profile,
    );

    expect(model.evidenceCount).toBe(0);
    expect(model.historyEntries).toHaveLength(0);
  });

  it("calculates net trait direction from positive and negative evidence", () => {
    const loved = createGame("loved", "Loved", { tags: ["systems", "exploration"] });
    const dropped = createGame("dropped", "Dropped", { tags: ["systems", "grind"] });
    const horror = createGame("horror", "Horror", {
      primaryGenre: "horror",
      genreId: "horror",
      tags: ["horror", "dark"],
    });
    const model = buildTasteModel(
      createDraft({ dislikedGameIds: [horror.gameId] }),
      {
        [loved.gameId]: createGameState(loved, { rating: 5 }),
        [dropped.gameId]: createGameState(dropped, {
          rating: 2,
          status: "abandoned",
          excluded: true,
        }),
      },
      new Map([
        [loved.gameId, loved],
        [dropped.gameId, dropped],
        [horror.gameId, horror],
      ]),
      profile,
    );

    expect(model.mapTraits.find((trait) => trait.id === "exploration")?.direction).toBe("positive");
    expect(model.mapTraits.find((trait) => trait.id === "horror")?.direction).toBe("negative");
  });

  it("returns still learning for an empty model", () => {
    const model = buildTasteModel(createDraft(), {}, new Map(), null);

    expect(model).toMatchObject({
      evidenceCount: 0,
      positiveCount: 0,
      negativeCount: 0,
      confidenceLabel: "Still learning",
    });
  });
});
