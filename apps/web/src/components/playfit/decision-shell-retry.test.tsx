import { createInitialState } from "@playfit/core/store";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePlayfitState: vi.fn(),
  usePlayfitUi: vi.fn(),
  useDecisionRecommendations: vi.fn(),
}));

vi.mock("../playfit/playfit-context", () => ({
  usePlayfitState: mocks.usePlayfitState,
  usePlayfitUi: mocks.usePlayfitUi,
}));

vi.mock("./use-decision-recommendations", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./use-decision-recommendations")>();
  return {
    ...actual,
    useDecisionRecommendations: mocks.useDecisionRecommendations,
  };
});

vi.mock("./play-next-card", () => ({
  PlayNextCard: () => null,
}));

vi.mock("../playfit/onboarding-section", () => ({
  OnboardingSection: () => null,
}));

vi.mock("../playfit/status-toast", () => ({
  StatusToast: () => null,
}));

function readyState() {
  const state = createInitialState();
  state.user.onboardingCompletedAt = "2026-01-01T00:00:00.000Z";
  state.user.profile = {
    summary: "Ready profile",
    likedGenres: [],
    avoidedGenres: [],
    likedTags: {},
    dislikedTags: {},
    ratedCount: 0,
    signals: [],
  };
  return state;
}

function baseRecommendationsReturn(overrides: Record<string, unknown> = {}) {
  return {
    alternatives: [],
    handleAddPick: vi.fn(),
    handleFeedback: vi.fn(),
    handleShowAnother: vi.fn(),
    isTransient: false,
    isInitialLoading: false,
    isWaitingForCandidates: false,
    loadError: null,
    loading: false,
    pool: [],
    primary: null,
    recommendationRefreshPending: false,
    refreshing: false,
    refreshRecommendations: vi.fn(() => Promise.resolve()),
    setExcludedIds: vi.fn(),
    slowLoading: false,
    visiblePool: [],
    ...overrides,
  };
}

async function loadDecisionShell() {
  vi.resetModules();
  return import("./decision-shell");
}

describe("DecisionShell: Play Next load-error recovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePlayfitState.mockReturnValue({
      state: readyState(),
      applyDecisionFeedback: vi.fn(),
      getSeedGame: vi.fn(() => null),
      setPlayfitPick: vi.fn(),
      resetLocalState: vi.fn(),
    });
    mocks.usePlayfitUi.mockReturnValue({
      ui: { activeTab: "today", saveStatus: "idle", onboardingCompletionPhase: "idle" },
      setUi: vi.fn(),
    });
  });

  it("shows an explicit retry action in the terminal error state", async () => {
    mocks.useDecisionRecommendations.mockReturnValue(
      baseRecommendationsReturn({ loadError: "Play Next could not be refreshed." }),
    );
    const { DecisionShell } = await loadDecisionShell();

    render(<DecisionShell />);

    expect(screen.getByText("Play Next could not load")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("retry triggers exactly one new recommendations request", async () => {
    const refreshRecommendations = vi.fn(() => Promise.resolve());
    mocks.useDecisionRecommendations.mockReturnValue(
      baseRecommendationsReturn({
        loadError: "Play Next could not be refreshed.",
        refreshRecommendations,
      }),
    );
    const { DecisionShell } = await loadDecisionShell();

    render(<DecisionShell />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(refreshRecommendations).toHaveBeenCalledTimes(1);
  });

  it("disables the retry button while a retry is pending, and re-enables once it settles", async () => {
    let resolveRetry: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      resolveRetry = resolve;
    });
    const refreshRecommendations = vi.fn(() => pending);
    mocks.useDecisionRecommendations.mockReturnValue(
      baseRecommendationsReturn({
        loadError: "Play Next could not be refreshed.",
        refreshRecommendations,
      }),
    );
    const { DecisionShell } = await loadDecisionShell();

    render(<DecisionShell />);
    const button = screen.getByRole("button", { name: "Try again" });

    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();

    // A second click while pending must not queue a second request.
    fireEvent.click(screen.getByRole("button", { name: "Retrying..." }));
    expect(refreshRecommendations).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRetry();
      await pending;
    });

    expect(screen.getByRole("button", { name: "Try again" })).not.toBeDisabled();
  });

  it("stays recoverable across repeated failures instead of dead-ending", async () => {
    // usePlayNextRecommendations' execute() always resolves -- a failed fetch is caught
    // internally and surfaced as `loadError` state, never as a rejected promise (see
    // use-recommendation-fetch.ts). A "failed" retry is modeled the same way here: the
    // promise resolves, but the mocked hook keeps returning the same loadError, exactly as
    // the real hook would if the retry's underlying fetch failed again.
    const refreshRecommendations = vi.fn(() => Promise.resolve());
    mocks.useDecisionRecommendations.mockReturnValue(
      baseRecommendationsReturn({
        loadError: "Play Next could not be refreshed.",
        refreshRecommendations,
      }),
    );
    const { DecisionShell } = await loadDecisionShell();

    render(<DecisionShell />);

    for (let attempt = 0; attempt < 3; attempt++) {
      const button = screen.getByRole("button", { name: "Try again" });
      await act(async () => {
        fireEvent.click(button);
      });
      expect(screen.getByText("Play Next could not load")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Try again" })).not.toBeDisabled();
    }

    expect(refreshRecommendations).toHaveBeenCalledTimes(3);
  });

  it("does not write the profile when retrying recommendations", async () => {
    const refreshRecommendations = vi.fn(() => Promise.resolve());
    mocks.useDecisionRecommendations.mockReturnValue(
      baseRecommendationsReturn({
        loadError: "Play Next could not be refreshed.",
        refreshRecommendations,
      }),
    );
    const updateStateAndSave = vi.fn();
    mocks.usePlayfitState.mockReturnValue({
      state: readyState(),
      applyDecisionFeedback: vi.fn(),
      getSeedGame: vi.fn(() => null),
      setPlayfitPick: vi.fn(),
      resetLocalState: vi.fn(),
      updateStateAndSave,
    });
    const { DecisionShell } = await loadDecisionShell();

    render(<DecisionShell />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(updateStateAndSave).not.toHaveBeenCalled();
  });
});
