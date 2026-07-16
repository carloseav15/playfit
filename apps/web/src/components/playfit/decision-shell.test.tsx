import { createInitialState } from "@playfit/core/store";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ChildrenProps = { children?: React.ReactNode };

const mocks = vi.hoisted(() => ({
  usePlayfitState: vi.fn(),
  usePlayfitUi: vi.fn(),
}));

vi.mock("@/components/ui/alert", () => ({
  Alert: ({ children }: ChildrenProps) => children,
}));

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: ChildrenProps) => children,
  CardDescription: ({ children }: ChildrenProps) => children,
  CardHeader: ({ children }: ChildrenProps) => children,
  CardTitle: ({ children }: ChildrenProps) => children,
}));

vi.mock("@/components/ui/container", () => ({
  Container: ({ children }: ChildrenProps) => children,
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => null,
}));

vi.mock("@/lib/game-cache", () => ({
  addGamesToCache: vi.fn(),
}));

vi.mock("./play-next-card", () => ({
  PlayNextCard: () => null,
}));

vi.mock("../playfit/playfit-context", () => ({
  usePlayfitState: mocks.usePlayfitState,
  usePlayfitUi: mocks.usePlayfitUi,
}));

vi.mock("../playfit/onboarding-section", () => ({
  OnboardingSection: () => "Set up your taste",
}));

vi.mock("../playfit/status-toast", () => ({
  StatusToast: () => null,
}));

async function loadDecisionShell() {
  vi.resetModules();
  return import("./decision-shell");
}

describe("DecisionShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders no legacy intro for new users before redirecting them to the landing", async () => {
    mocks.usePlayfitState.mockReturnValue({
      state: createInitialState(),
      applyDecisionFeedback: vi.fn(),
      setPlayfitPick: vi.fn(),
    });
    mocks.usePlayfitUi.mockReturnValue({ ui: { saveStatus: "idle" } });
    const { DecisionShell } = await loadDecisionShell();

    const html = renderToStaticMarkup(<DecisionShell />);

    expect(html).toBe("");
  });

  it("does not render the launcher for a ready local profile", async () => {
    const state = createInitialState();
    state.user.onboardingCompletedAt = "2026-01-01T00:00:00.000Z";
    state.user.profile = {
      summary: "Ready profile",
      likedGenres: ["jrpg"],
      avoidedGenres: [],
      likedTags: {},
      dislikedTags: {},
      ratedCount: 3,
      signals: [],
    };
    mocks.usePlayfitState.mockReturnValue({
      state,
      applyDecisionFeedback: vi.fn(),
      setPlayfitPick: vi.fn(),
    });
    mocks.usePlayfitUi.mockReturnValue({ ui: { saveStatus: "idle" } });
    const { DecisionShell } = await loadDecisionShell();

    const html = renderToStaticMarkup(<DecisionShell />);

    expect(html).not.toContain("Your next game");
    expect(html).not.toContain("Set up your taste");
  });

  it("only refreshes recommendations after a pending save completes", async () => {
    const { shouldRefreshRecommendationsAfterSave } = await loadDecisionShell();

    expect(
      shouldRefreshRecommendationsAfterSave({
        pending: true,
        previousSaveStatus: "saving",
        saveStatus: "saved",
      }),
    ).toBe(true);
    expect(
      shouldRefreshRecommendationsAfterSave({
        pending: true,
        previousSaveStatus: "saved",
        saveStatus: "saved",
      }),
    ).toBe(false);
    expect(
      shouldRefreshRecommendationsAfterSave({
        pending: false,
        previousSaveStatus: "saving",
        saveStatus: "saved",
      }),
    ).toBe(false);
    expect(
      shouldRefreshRecommendationsAfterSave({
        pending: true,
        previousSaveStatus: "saving",
        saveStatus: "error",
      }),
    ).toBe(false);
  });

  it("does not show the terminal empty state while recommendations are refreshing", async () => {
    const { shouldShowNoRecommendations } = await loadDecisionShell();

    expect(
      shouldShowNoRecommendations({
        primary: null,
        loading: false,
        refreshing: false,
        refreshPending: false,
      }),
    ).toBe(true);
    expect(
      shouldShowNoRecommendations({
        primary: null,
        loading: false,
        refreshing: true,
        refreshPending: false,
      }),
    ).toBe(false);
    expect(
      shouldShowNoRecommendations({
        primary: null,
        loading: false,
        refreshing: false,
        refreshPending: true,
      }),
    ).toBe(false);
    expect(
      shouldShowNoRecommendations({
        primary: null,
        loading: true,
        refreshing: false,
        refreshPending: false,
      }),
    ).toBe(false);
  });
});
