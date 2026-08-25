import { createInitialState } from "@playfit/core/store";
import type { ProductProfile, RankedSeedGame } from "@playfit/core/types";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

const mocks = vi.hoisted(() => ({
  usePlayfitState: vi.fn(),
  usePicksRecommendations: vi.fn(),
}));

vi.mock("../playfit/playfit-context", () => ({
  usePlayfitState: mocks.usePlayfitState,
}));

vi.mock("../playfit/status-toast", () => ({
  StatusToast: () => null,
}));

vi.mock("./use-picks-recommendations", () => ({
  usePicksRecommendations: mocks.usePicksRecommendations,
}));

const profile: ProductProfile = {
  summary: "Ready",
  likedGenres: [],
  avoidedGenres: [],
  likedTags: {},
  dislikedTags: {},
  ratedCount: 3,
  signals: [],
};

const pick: RankedSeedGame = {
  game: {
    gameId: "hades",
    title: "Hades",
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre: "roguelike",
    tags: [],
    notes: "",
    coverPath: "",
    availablePlatformIds: [],
    availablePlatformNames: [],
    releaseState: "released",
  },
  affinityScore: 90,
  riskScore: 10,
  confidence: "high",
  fitReasons: [],
  cautionReasons: [],
  platformAvailability: "available",
  accessStatus: "playable",
  inBacklog: false,
  inWishlist: false,
  inPlayfitPicks: true,
  similarGames: [],
};

function readyState() {
  const state = createInitialState();
  state.user.onboardingCompletedAt = "2026-01-01T00:00:00.000Z";
  state.user.profile = profile;
  return state;
}

async function loadPicksShell() {
  vi.resetModules();
  return import("./picks-shell");
}

describe("PicksShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePicksRecommendations.mockReturnValue({ picks: [], loading: false, loadError: null });
  });

  it("renders no fallback screen before redirecting users without a profile", async () => {
    mocks.usePlayfitState.mockReturnValue({
      state: createInitialState(),
      applyDecisionFeedback: vi.fn(),
      setPlayfitPick: vi.fn(),
    });
    const { PicksShell } = await loadPicksShell();

    const html = renderToStaticMarkup(
      <TooltipProvider>
        <PicksShell />
      </TooltipProvider>,
    );

    expect(html).toBe("");
  });

  it("renders skeletons while saved picks are loading", async () => {
    mocks.usePlayfitState.mockReturnValue({
      state: readyState(),
      applyDecisionFeedback: vi.fn(),
      setPlayfitPick: vi.fn(),
    });
    mocks.usePicksRecommendations.mockReturnValue({ picks: [], loading: true, loadError: null });
    const { PicksShell } = await loadPicksShell();

    const html = renderToStaticMarkup(
      <TooltipProvider>
        <PicksShell />
      </TooltipProvider>,
    );

    expect(html).toContain("h-44");
    expect(html).not.toContain("No saved picks yet");
  });

  it("renders the existing empty state when loading completes without picks", async () => {
    mocks.usePlayfitState.mockReturnValue({
      state: readyState(),
      applyDecisionFeedback: vi.fn(),
      setPlayfitPick: vi.fn(),
    });
    mocks.usePicksRecommendations.mockReturnValue({ picks: [], loading: false, loadError: null });
    const { PicksShell } = await loadPicksShell();

    const html = renderToStaticMarkup(
      <TooltipProvider>
        <PicksShell />
      </TooltipProvider>,
    );

    expect(html).toContain("No saved picks yet");
    expect(html).toContain("Find Recommendations");
  });

  it("renders saved pick content after loading", async () => {
    mocks.usePlayfitState.mockReturnValue({
      state: readyState(),
      applyDecisionFeedback: vi.fn(),
      setPlayfitPick: vi.fn(),
    });
    mocks.usePicksRecommendations.mockReturnValue({
      picks: [pick],
      loading: false,
      loadError: null,
    });
    const { PicksShell } = await loadPicksShell();

    const html = renderToStaticMarkup(
      <TooltipProvider>
        <PicksShell />
      </TooltipProvider>,
    );

    expect(html).toContain("Hades");
    expect(html).not.toContain("No saved picks yet");
  });
});
