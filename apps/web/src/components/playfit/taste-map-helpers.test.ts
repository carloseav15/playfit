import type { ProductGameState, ProductOnboardingDraft, SeedGame } from "@playfit/core/types";
import { describe, expect, it } from "vitest";
import {
  buildTasteMapNodes,
  findNearestNodeInDirection,
  type TasteMapNode,
} from "./taste-map-helpers";

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

function createNode(id: string, x: number, y: number): TasteMapNode {
  return { game: createGame(id), x, y, type: "liked" };
}

describe("findNearestNodeInDirection", () => {
  // A plus-sign layout around the origin -- one node in each cardinal direction,
  // plus a diagonal one that should never win a cardinal arrow-key press.
  const center = createNode("center", 0, 0);
  const north = createNode("north", 0, 20);
  const south = createNode("south", 0, -20);
  const east = createNode("east", 20, 0);
  const west = createNode("west", -20, 0);
  const diagonal = createNode("diagonal", 15, 15);
  const nodes = [center, north, south, east, west, diagonal];

  it("picks the node straight ahead for each arrow key", () => {
    expect(findNearestNodeInDirection(center, "ArrowUp", nodes)?.game.gameId).toBe("north");
    expect(findNearestNodeInDirection(center, "ArrowDown", nodes)?.game.gameId).toBe("south");
    expect(findNearestNodeInDirection(center, "ArrowRight", nodes)?.game.gameId).toBe("east");
    expect(findNearestNodeInDirection(center, "ArrowLeft", nodes)?.game.gameId).toBe("west");
  });

  it("prefers a closer node over a farther one in the same direction", () => {
    const near = createNode("near", 0, 10);
    const far = createNode("far", 0, 30);
    expect(findNearestNodeInDirection(center, "ArrowUp", [center, near, far])?.game.gameId).toBe(
      "near",
    );
  });

  it("penalizes perpendicular drift more than distance along the pressed axis", () => {
    // Directly ahead but far vs. slightly ahead but far off-axis -- the on-axis one wins.
    const farButAligned = createNode("far-aligned", 0, 30);
    const closeButOffAxis = createNode("close-off-axis", 25, 5);
    expect(
      findNearestNodeInDirection(center, "ArrowUp", [center, farButAligned, closeButOffAxis])?.game
        .gameId,
    ).toBe("far-aligned");
  });

  it("returns null when there is no candidate in that direction", () => {
    const onlyNorth = createNode("only-north", 0, 20);
    expect(findNearestNodeInDirection(center, "ArrowDown", [center, onlyNorth])).toBeNull();
  });
});
