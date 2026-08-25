import { createInitialState } from "@playfit/core/store";
import type { ProductGameState, ProductState, RankedSeedGame, SeedGame } from "@playfit/core/types";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ChildrenProps = { children?: React.ReactNode };

const mocks = vi.hoisted(() => ({
  usePlayfitState: vi.fn(),
  getCachedRecommendation: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.routerPush, back: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: ChildrenProps & { href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: ChildrenProps) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: ChildrenProps) => <button type="button">{children}</button>,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: ChildrenProps) => children,
  CardContent: ({ children }: ChildrenProps) => children,
  CardDescription: ({ children }: ChildrenProps) => children,
  CardHeader: ({ children }: ChildrenProps) => children,
}));

vi.mock("@/components/ui/container", () => ({
  Container: ({ children }: ChildrenProps) => children,
}));

vi.mock("@/lib/game-cache", () => ({
  addGamesToCache: vi.fn(),
  fetchGame: vi.fn(),
}));

vi.mock("@/lib/redirect-to-landing", () => ({
  redirectToMarketingLanding: vi.fn(),
}));

vi.mock("@playfit/core/domain", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@playfit/core/domain")>();
  return { ...actual, scoreSeedGame: vi.fn() };
});

vi.mock("@playfit/core/store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@playfit/core/store")>();
  return { ...actual, authenticatedFetch: vi.fn() };
});

vi.mock("../playfit/cover-art", () => ({
  CoverArt: () => null,
}));

vi.mock("../playfit/playfit-context", () => ({
  usePlayfitState: mocks.usePlayfitState,
}));

vi.mock("../playfit/status-toast", () => ({
  StatusToast: () => null,
}));

vi.mock("./already-played-panel", () => ({
  AlreadyPlayedPanel: () => null,
}));

vi.mock("./recommendation-cache", () => ({
  addRecommendationsToSessionCache: vi.fn(),
  getCachedRecommendation: mocks.getCachedRecommendation,
}));

vi.mock("./recommendation-metric", () => ({
  RecommendationMetric: ({ label, value }: { label: string; value: string }) =>
    `${label}: ${value}`,
}));

vi.mock("./recommendation-reasons", () => ({
  filterUsefulCautions: (reasons: string[]) => reasons,
  RecommendationReasons: ({ title, reasons }: { title: string; reasons: string[] }) => (
    <div>
      {title}: {reasons.join(", ")}
    </div>
  ),
}));

async function loadDecisionDossier() {
  vi.resetModules();
  return import("./decision-dossier");
}

const game: SeedGame = {
  gameId: "ori_and_the_blind_forest",
  title: "Ori and the Blind Forest",
  aliases: [],
  series: null,
  source: "catalog",
  primaryGenre: "metroidvania",
  tags: ["action_combat"],
  notes: "",
  coverPath: "",
  availablePlatformIds: ["pc"],
  availablePlatformNames: ["PC"],
  releaseState: "released",
} as unknown as SeedGame;

const entry: RankedSeedGame = {
  game,
  affinityScore: 24,
  riskScore: 23,
  confidence: "low",
  fitReasons: ["Early signal around action combat"],
  cautionReasons: [],
  platformAvailability: "available",
  accessStatus: "playable",
  inBacklog: false,
  inWishlist: false,
  inPlayfitPicks: false,
  similarGames: [],
};

function buildState(gameState?: Partial<ProductGameState>): ProductState {
  const state = createInitialState();
  state.user.onboardingCompletedAt = "2026-01-01T00:00:00.000Z";
  state.user.profile = {
    summary: "Ready profile",
    likedGenres: [],
    avoidedGenres: [],
    likedTags: {},
    dislikedTags: {},
    ratedCount: 3,
    signals: [],
  };
  if (gameState) {
    state.user.gameStates[game.gameId] = {
      gameId: game.gameId,
      title: game.title,
      inBacklog: false,
      inWishlist: false,
      inPlayfitPicks: false,
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...gameState,
    };
  }
  return state;
}

function renderDossier(state: ProductState, entryOverride: RankedSeedGame = entry) {
  mocks.usePlayfitState.mockReturnValue({
    state,
    getSeedGame: () => game,
  });
  mocks.getCachedRecommendation.mockReturnValue(entryOverride);
}

describe("DecisionDossier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the Recommended badge when there is no prior decision", async () => {
    renderDossier(buildState());
    const { DecisionDossier } = await loadDecisionDossier();

    const html = renderToStaticMarkup(<DecisionDossier gameId={game.gameId} />);

    expect(html).toContain("Recommended");
    expect(html).toContain("No decision yet");
    expect(html).toContain("Too early to tell");
    expect(html).toContain("Why it fits: Early signal around action combat");
    // No verdict yet: the full pending CTA set is shown, not the collapsed "Change verdict" state.
    expect(html).toContain("Already Played");
    expect(html).not.toContain("Change verdict");
  });

  it("does not show Recommended for a game marked Not for me, and keeps the existing verdict visible", async () => {
    renderDossier(buildState({ excluded: true, rating: 2 }));
    const { DecisionDossier } = await loadDecisionDossier();

    const html = renderToStaticMarkup(<DecisionDossier gameId={game.gameId} />);

    expect(html).not.toContain("Recommended");
    expect(html).toContain("Not for me");
    expect(html).toContain("Rating: 2");
    // The model's own confidence read is not a claim about the user's decision --
    // it stays visible, only the "Recommended" framing is suppressed.
    expect(html).toContain("Too early to tell");
    expect(html).toContain("Why it fits: Early signal around action combat");
    // A verdict already exists: don't re-offer "Already Played" / "Not for me" as if the
    // decision were still pending -- collapse to a single "Change verdict" action instead.
    expect(html).toContain("Change verdict");
    expect(html).not.toContain("Already Played");
  });

  it("does not show Recommended for a game dropped after being played (the other 'excluded' outcome)", async () => {
    renderDossier(buildState({ excluded: true, status: "abandoned", rating: 2 }));
    const { DecisionDossier } = await loadDecisionDossier();

    const html = renderToStaticMarkup(<DecisionDossier gameId={game.gameId} />);

    expect(html).not.toContain("Recommended");
    expect(html).toContain("Status: abandoned");
  });

  it("still shows Recommended for a game already played and liked (a positive outcome, not a rejection)", async () => {
    renderDossier(buildState({ status: "completed", rating: 5 }));
    const { DecisionDossier } = await loadDecisionDossier();

    const html = renderToStaticMarkup(<DecisionDossier gameId={game.gameId} />);

    expect(html).toContain("Recommended");
    expect(html).toContain("Status: completed");
    expect(html).toContain("Rating: 5");
  });

  it("still shows Recommended for a game saved to Picks, and leaves the Save/Remove action untouched", async () => {
    renderDossier(buildState({ inPlayfitPicks: true }), { ...entry, inPlayfitPicks: true });
    const { DecisionDossier } = await loadDecisionDossier();

    const html = renderToStaticMarkup(<DecisionDossier gameId={game.gameId} />);

    expect(html).toContain("Recommended");
    expect(html).toContain("In Playfit Picks");
    expect(html).toContain("Remove from Picks");
    // Being saved to Picks isn't a played/rejected verdict -- the decision is still pending,
    // so the full CTA set (not the collapsed "Change verdict" state) should still show.
    expect(html).toContain("Already Played");
    expect(html).not.toContain("Change verdict");
  });
});
