import { describe, expect, it } from "vitest";
import type { ProductGameState, ProductOnboardingDraft, SeedGame } from "../types";
import { buildTasteHistoryEntries } from "./taste-history";

function createGame(gameId: string, title = gameId): SeedGame {
  return {
    gameId,
    title,
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre: "action",
    genreId: "action",
    tags: ["story_rich"],
    notes: "",
    coverPath: "",
    availablePlatformIds: [],
    availablePlatformNames: [],
    releaseState: "released",
  };
}

function createState(gameId: string, overrides: Partial<ProductGameState> = {}): ProductGameState {
  return {
    gameId,
    title: gameId,
    inBacklog: false,
    inWishlist: false,
    inPlayfitPicks: false,
    source: "manual",
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
    ...overrides,
  };
}

function createDraft(overrides: Partial<ProductOnboardingDraft> = {}): ProductOnboardingDraft {
  return {
    step: "dislikes",
    platforms: [],
    likedGameIds: [],
    dislikedGameIds: [],
    ...overrides,
  };
}

describe("buildTasteHistoryEntries", () => {
  it("prefers a rated state over an onboarding signal for the same game", () => {
    const game = createGame("game-1");
    const entries = buildTasteHistoryEntries(
      createDraft({ likedGameIds: [game.gameId] }),
      { [game.gameId]: createState(game.gameId, { rating: 2 }) },
      new Map([[game.gameId, game]]),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ decision: "not_for_me", source: "rating", rating: 2 });
  });

  it("includes onboarding favorites and misses when no rating exists", () => {
    const liked = createGame("liked", "Liked Game");
    const disliked = createGame("disliked", "Disliked Game");

    const entries = buildTasteHistoryEntries(
      createDraft({ likedGameIds: [liked.gameId], dislikedGameIds: [disliked.gameId] }),
      {},
      new Map([
        [liked.gameId, liked],
        [disliked.gameId, disliked],
      ]),
    );

    expect(entries.map((entry) => [entry.gameId, entry.decision])).toEqual([
      ["disliked", "setup_miss"],
      ["liked", "setup_favorite"],
    ]);
  });

  it("sorts dated entries newest first and titles as a stable fallback", () => {
    const older = createGame("older", "Older");
    const newer = createGame("newer", "Newer");
    const entries = buildTasteHistoryEntries(
      createDraft(),
      {
        older: createState("older", { rating: 4, updatedAt: "2026-07-14T00:00:00Z" }),
        newer: createState("newer", { rating: 4, updatedAt: "2026-07-15T00:00:00Z" }),
      },
      new Map([
        [older.gameId, older],
        [newer.gameId, newer],
      ]),
    );

    expect(entries.map((entry) => entry.gameId)).toEqual(["newer", "older"]);
  });
});
