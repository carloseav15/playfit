import { createInitialState } from "@playfit/core/store";
import type { ProductGameState, ProductProfile, SeedGame } from "@playfit/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePlayfitState: vi.fn(),
  ensureGamesCached: vi.fn(),
}));

vi.mock("@/lib/game-cache", () => ({
  ensureGamesCached: mocks.ensureGamesCached,
}));

vi.mock("../playfit/cover-art", () => ({
  CoverArt: ({ game }: { game: SeedGame }) => <span>{game.title} cover art</span>,
}));

vi.mock("../playfit/status-toast", () => ({
  StatusToast: () => null,
}));

vi.mock("../playfit/playfit-context", () => ({
  usePlayfitState: mocks.usePlayfitState,
}));

vi.mock("../playfit/header-context", () => ({
  useHeader: vi.fn(),
}));

vi.mock("./use-today-recommendations", () => ({
  useTodayRecommendations: () => ({ model: null }),
}));

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

function createProfile(): ProductProfile {
  return {
    summary: "Taste profile",
    likedGenres: ["jrpg"],
    avoidedGenres: ["horror"],
    likedTags: { story_rich: 2 },
    dislikedTags: { horror: 1 },
    ratedCount: 3,
    signals: [],
  };
}

async function loadTasteShell() {
  vi.resetModules();
  return import("./taste-shell");
}

describe("TasteShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders no fallback screen before redirecting users without a profile", async () => {
    mocks.usePlayfitState.mockReturnValue({
      state: createInitialState(),
      seedData: { platforms: [{ platformId: "ps5", displayName: "PS5" }] },
      getSeedGame: vi.fn(),
      applyDecisionFeedback: vi.fn(),
      removeTasteSignal: vi.fn(),
    });
    const { TasteShell } = await loadTasteShell();

    const html = renderToStaticMarkup(<TasteShell />);

    expect(html).toBe("");
  });

  it("renders the taste map and activity tab for a ready profile", async () => {
    const liked = createGame("chrono_trigger", "Chrono Trigger");
    const disliked = createGame("resident_evil_4", "Resident Evil 4", {
      primaryGenre: "horror",
      genreId: "horror",
      tags: ["horror", "tense"],
    });
    const loved = createGame("final_fantasy_vi", "Final Fantasy VI", {
      tags: ["story_rich", "fantasy"],
    });
    const games = new Map([
      [liked.gameId, liked],
      [disliked.gameId, disliked],
      [loved.gameId, loved],
    ]);
    const state = createInitialState();
    state.user.onboardingCompletedAt = "2026-01-01T00:00:00.000Z";
    state.user.profile = createProfile();
    state.user.onboarding.likedGameIds = [liked.gameId];
    state.user.onboarding.dislikedGameIds = [disliked.gameId];
    state.user.gameStates[loved.gameId] = {
      gameId: loved.gameId,
      title: loved.title,
      rating: 5,
      status: "completed",
      inBacklog: false,
      inWishlist: false,
      inPlayfitPicks: false,
      excluded: false,
      source: "manual",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    mocks.usePlayfitState.mockReturnValue({
      state,
      seedData: { platforms: [{ platformId: "ps5", displayName: "PS5" }] },
      getSeedGame: (gameId: string) => games.get(gameId) ?? null,
      applyDecisionFeedback: vi.fn(),
      removeTasteSignal: vi.fn(),
    });
    const { TasteShell } = await loadTasteShell();

    const html = renderToStaticMarkup(<TasteShell />);

    expect(html).toContain("Your Taste");
    expect(html).toContain("Interactive Affinity Map");
    expect(html).toContain("Activity");
    expect(html).toContain("Liked");
    expect(html).toContain("Avoided");
    expect(html).toContain("Preferences");
    expect(html).toContain("Based on 3 preferences");
  });

  describe("affinity map re-render regression (P1 #3)", () => {
    afterEach(() => {
      cleanup();
    });

    it("does not re-derive gamesById on unrelated re-renders and stays interactive with a large tracked-game profile", async () => {
      const GAME_COUNT = 60;
      const games = new Map<string, SeedGame>();
      const likedGameIds: string[] = [];
      const gameStates: Record<string, ProductGameState> = {};
      for (let i = 0; i < GAME_COUNT; i++) {
        const id = `game_${i}`;
        games.set(id, createGame(id, `Game ${i}`, { tags: ["story_rich", "open_world"] }));
        likedGameIds.push(id);
        gameStates[id] = {
          gameId: id,
          title: `Game ${i}`,
          status: "playing",
          inBacklog: false,
          inWishlist: false,
          inPlayfitPicks: false,
          source: "manual",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        };
      }

      const state = createInitialState();
      state.user.onboardingCompletedAt = "2026-01-01T00:00:00.000Z";
      state.user.profile = createProfile();
      state.user.onboarding.likedGameIds = likedGameIds;
      state.user.gameStates = gameStates;

      mocks.usePlayfitState.mockReturnValue({
        state,
        seedData: { platforms: [{ platformId: "ps5", displayName: "PS5" }] },
        getSeedGame: (gameId: string) => games.get(gameId) ?? null,
        applyDecisionFeedback: vi.fn(),
        removeTasteSignal: vi.fn(),
      });

      const { TasteShell } = await loadTasteShell();
      // loadTasteShell() calls vi.resetModules(), so the statically-imported
      // tasteModel above is a stale copy; re-import it from the same fresh
      // registry taste-shell.tsx now resolves against before spying.
      const freshTasteModel = await import("./taste-model");
      const spy = vi.spyOn(freshTasteModel, "getSeedGamesById");

      const { rerender } = render(<TasteShell />);

      // Both the desktop and mobile trees mount at once in jsdom (only CSS
      // media queries hide one of them), so every query below matches twice.
      expect(screen.getAllByText(`Liked / Playing (${GAME_COUNT})`).length).toBeGreaterThan(0);
      expect(spy).toHaveBeenCalledTimes(1);

      // Repeated re-renders with no change to global state mirror unrelated
      // interactions elsewhere in TasteShell (a background save toggling
      // isSaving, a local UI tab flipping, etc). Before the fix, gamesById
      // was rebuilt unconditionally on every render, forcing the entire
      // affinity map (SVG nodes + carousel cards) to be reconciled from
      // scratch every time -- that unbounded, repeated synchronous work is
      // what produced the freeze/blank symptom at scale.
      for (let i = 0; i < 5; i++) {
        rerender(<TasteShell />);
      }

      expect(spy).toHaveBeenCalledTimes(1);
      expect(screen.getAllByText(`Liked / Playing (${GAME_COUNT})`).length).toBeGreaterThan(0);

      // The map and the rest of the page must still be interactive, and
      // repeated interaction must not create a runaway render loop.
      const [nextButton] = screen.getAllByRole("button", { name: "Next preference card" });
      const [prevButton] = screen.getAllByRole("button", { name: "Previous preference card" });
      for (let i = 0; i < 12; i++) {
        fireEvent.click(i % 2 === 0 ? nextButton : prevButton);
      }

      expect(screen.getAllByText("Interactive Affinity Map").length).toBeGreaterThan(0);
      expect(screen.getAllByText(`Liked / Playing (${GAME_COUNT})`).length).toBeGreaterThan(0);

      spy.mockRestore();
    }, 15000);

    it("still renders a small valid profile normally (no regression on the common case)", async () => {
      const liked = createGame("chrono_trigger", "Chrono Trigger");
      const games = new Map([[liked.gameId, liked]]);
      const state = createInitialState();
      state.user.onboardingCompletedAt = "2026-01-01T00:00:00.000Z";
      state.user.profile = createProfile();
      state.user.onboarding.likedGameIds = [liked.gameId];

      mocks.usePlayfitState.mockReturnValue({
        state,
        seedData: { platforms: [{ platformId: "ps5", displayName: "PS5" }] },
        getSeedGame: (gameId: string) => games.get(gameId) ?? null,
        applyDecisionFeedback: vi.fn(),
        removeTasteSignal: vi.fn(),
      });

      const { TasteShell } = await loadTasteShell();
      render(<TasteShell />);

      expect(screen.getAllByText("Interactive Affinity Map").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Liked / Playing (1)").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Chrono Trigger").length).toBeGreaterThan(0);
    });
  });
});
