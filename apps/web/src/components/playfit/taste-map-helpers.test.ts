import type { ProductGameState, ProductOnboardingDraft, SeedGame } from "@playfit/core/types";
import { describe, expect, it } from "vitest";
import { buildTasteMapNodes } from "./taste-map-helpers";

function createGame(gameId: string): SeedGame {
  return {
    gameId,
    title: gameId,
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre: "action",
    genreId: "action",
    tags: ["story_rich"],
    notes: "",
    coverPath: "",
    availablePlatformIds: ["ps5"],
    availablePlatformNames: ["PS5"],
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

function createOnboarding(overrides: Partial<ProductOnboardingDraft> = {}): ProductOnboardingDraft {
  return {
    step: "dislikes",
    platforms: [],
    likedGameIds: [],
    dislikedGameIds: [],
    ...overrides,
  };
}

describe("buildTasteMapNodes", () => {
  it("classifies onboarding, rated, playing and pending games", () => {
    const games = new Map([
      ["liked", createGame("liked")],
      ["disliked", createGame("disliked")],
      ["playing", createGame("playing")],
      ["pending", createGame("pending")],
      ["ignored", createGame("ignored")],
    ]);
    const gameStates = {
      disliked: createState("disliked", { rating: 2 }),
      playing: createState("playing", { status: "playing" }),
      pending: createState("pending", { inPlayfitPicks: true }),
    };

    const nodes = buildTasteMapNodes(
      games,
      gameStates,
      createOnboarding({ likedGameIds: ["liked"] }),
    );

    expect(nodes.map((node) => [node.game.gameId, node.type])).toEqual([
      ["liked", "liked"],
      ["disliked", "disliked"],
      ["playing", "liked"],
      ["pending", "pending"],
    ]);
    expect(nodes.some((node) => node.game.gameId === "ignored")).toBe(false);
  });

  it("treats a completed game with a solid rating as liked", () => {
    const game = createGame("completed");
    const nodes = buildTasteMapNodes(
      new Map([[game.gameId, game]]),
      {
        [game.gameId]: createState(game.gameId, { status: "completed", rating: 3 }),
      },
      createOnboarding(),
    );

    expect(nodes[0]?.type).toBe("liked");
  });
});
