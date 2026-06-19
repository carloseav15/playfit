import { createInitialState } from "@playfit/core/store";
import type { ProductProfile, SeedGame } from "@playfit/core/types";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePlayfit: vi.fn(),
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
  usePlayfit: mocks.usePlayfit,
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

  it("asks users without a profile to tune taste first", async () => {
    mocks.usePlayfit.mockReturnValue({
      state: createInitialState(),
      seedData: { platforms: [{ platformId: "ps5", displayName: "PS5" }] },
      getSeedGame: vi.fn(),
      applyDecisionFeedback: vi.fn(),
      removeTasteSignal: vi.fn(),
    });
    const { TasteShell } = await loadTasteShell();

    const html = renderToStaticMarkup(<TasteShell />);

    expect(html).toContain("Set up your taste first");
    expect(html).toContain("Start Play Next");
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
    mocks.usePlayfit.mockReturnValue({
      state,
      seedData: { platforms: [{ platformId: "ps5", displayName: "PS5" }] },
      getSeedGame: (gameId: string) => games.get(gameId) ?? null,
      applyDecisionFeedback: vi.fn(),
      removeTasteSignal: vi.fn(),
    });
    const { TasteShell } = await loadTasteShell();

    const html = renderToStaticMarkup(<TasteShell />);

    expect(html).toContain("Your Taste");
    expect(html).toContain("Taste Map");
    expect(html).toContain("Activity");
    expect(html).toContain("Liked");
    expect(html).toContain("Avoided");
    expect(html).toContain("Preferences");
    expect(html).toContain("Based on 3 preferences");
  });
});
