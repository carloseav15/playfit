import type { ProductGameState, SeedGame } from "@playfit/core/types";
import { describe, expect, it } from "vitest";
import {
  activePlayfitPickCount,
  buildGameState,
  isTerminalGameState,
  shouldDeleteManualState,
} from "./game-action-helpers";

const game: SeedGame = {
  gameId: "game-1",
  title: "Game One",
  aliases: [],
  series: "",
  source: "catalog",
  primaryGenre: "action",
  genreId: "action",
  tags: [],
  notes: "",
  coverPath: "",
  availablePlatformIds: [],
  availablePlatformNames: [],
  releaseState: "released",
};

function createState(overrides: Partial<ProductGameState> = {}): ProductGameState {
  return {
    gameId: "game-1",
    title: "Game One",
    inBacklog: false,
    inWishlist: false,
    inPlayfitPicks: false,
    source: "manual",
    createdAt: "2026-07-15T00:00:00Z",
    updatedAt: "2026-07-15T00:00:00Z",
    ...overrides,
  };
}

describe("game-action-helpers", () => {
  it("creates a manual game state with synchronized timestamps", () => {
    const state = buildGameState(game, "manual");

    expect(state).toMatchObject({
      gameId: "game-1",
      title: "Game One",
      source: "manual",
      inBacklog: false,
      inWishlist: false,
      inPlayfitPicks: false,
    });
    expect(state.createdAt).toBe(state.updatedAt);
  });

  it("treats resolved and excluded games as terminal", () => {
    expect(isTerminalGameState(createState({ status: "completed" }))).toBe(true);
    expect(isTerminalGameState(createState({ status: "abandoned" }))).toBe(true);
    expect(isTerminalGameState(createState({ excluded: true }))).toBe(true);
    expect(isTerminalGameState(createState({ status: "playing" }))).toBe(false);
  });

  it("counts only active Playfit Picks", () => {
    expect(
      activePlayfitPickCount({
        active: createState({ inPlayfitPicks: true }),
        completed: createState({ inPlayfitPicks: true, status: "completed" }),
        excluded: createState({ inPlayfitPicks: true, excluded: true }),
        other: createState(),
      }),
    ).toBe(1);
  });

  it("deletes only empty manual states", () => {
    expect(shouldDeleteManualState(createState())).toBe(true);
    expect(shouldDeleteManualState(createState({ inWishlist: true }))).toBe(false);
    expect(shouldDeleteManualState(createState({ source: "onboarding" }))).toBe(false);
    expect(shouldDeleteManualState(createState({ rating: 4 }))).toBe(false);
  });
});
