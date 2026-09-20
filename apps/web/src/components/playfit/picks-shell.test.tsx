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

    expect(html).toContain("aspect-[3/4]");
    expect(html).not.toContain("Nothing saved yet");
  });

  it("renders the empty state when loading completes without picks", async () => {
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

    expect(html).toContain("Nothing saved yet");
    expect(html).toContain("Find Recommendations");
  });

  it("renders the saved picks as a poster grid that links to each game's dossier", async () => {
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

    expect(html).toContain("My Picks");
    expect(html).toContain("1 saved pick · best match first");
    expect(html).toContain("Hades");
    expect(html).toContain("90 out of 100 match");
    expect(html).toContain("returnTo=%2Fpicks");
    expect(html).toContain('href="/game/hades?');
    expect(html).not.toContain("Already Played It");
    expect(html).not.toContain("Nothing saved yet");
  });

  it("pluralizes the saved picks count", async () => {
    mocks.usePlayfitState.mockReturnValue({
      state: readyState(),
      applyDecisionFeedback: vi.fn(),
      setPlayfitPick: vi.fn(),
    });
    mocks.usePicksRecommendations.mockReturnValue({
      picks: [pick, { ...pick, game: { ...pick.game, gameId: "celeste", title: "Celeste" } }],
      loading: false,
      loadError: null,
    });
    const { PicksShell } = await loadPicksShell();

    const html = renderToStaticMarkup(
      <TooltipProvider>
        <PicksShell />
      </TooltipProvider>,
    );

    expect(html).toContain("2 saved picks · best match first");
    expect(html).toContain("Celeste");
  });
});
