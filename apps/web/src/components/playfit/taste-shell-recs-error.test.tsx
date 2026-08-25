import { createInitialState } from "@playfit/core/store";
import type { ProductProfile } from "@playfit/core/types";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  usePlayfitState: vi.fn(),
  useTodayRecommendations: vi.fn(),
  ensureGamesCached: vi.fn(),
}));

vi.mock("@/lib/game-cache", () => ({
  ensureGamesCached: mocks.ensureGamesCached,
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
  useTodayRecommendations: mocks.useTodayRecommendations,
}));

function createProfile(): ProductProfile {
  return {
    summary: "Taste profile",
    likedGenres: [],
    avoidedGenres: [],
    likedTags: {},
    dislikedTags: {},
    ratedCount: 3,
    signals: [],
  };
}

function readyState() {
  const state = createInitialState();
  state.user.onboardingCompletedAt = "2026-01-01T00:00:00.000Z";
  state.user.profile = createProfile();
  // Deliberately no liked/disliked game ids or gameStates: getTasteGameIds() then
  // returns [], so missingIds stays empty and the shell skips its own hydration
  // skeleton -- keeping this test isolated to the recommendation-source load error.
  return state;
}

async function loadTasteShell() {
  vi.resetModules();
  return import("./taste-shell");
}

describe("TasteShell: recommendation-source load error", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureGamesCached.mockResolvedValue(undefined);
    mocks.usePlayfitState.mockReturnValue({
      state: readyState(),
      seedData: { platforms: [] },
      getSeedGame: vi.fn(() => null),
      applyDecisionFeedback: vi.fn(),
      removeTasteSignal: vi.fn(),
      setPlayfitPick: vi.fn(),
    });
  });

  it("does not surface an error banner when the recommendation source loads cleanly", async () => {
    mocks.useTodayRecommendations.mockReturnValue({
      model: { nextUp: [], currentRun: [], resume: [], picks: [] },
      loading: false,
      loadError: null,
      retry: vi.fn(),
    });
    const { TasteShell } = await loadTasteShell();

    render(<TasteShell />);

    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows an honest error banner instead of silently rendering an empty map", async () => {
    mocks.useTodayRecommendations.mockReturnValue({
      model: null,
      loading: false,
      loadError: "Recommendations could not be loaded for the map.",
      retry: vi.fn(),
    });
    const { TasteShell } = await loadTasteShell();

    render(<TasteShell />);

    expect(screen.getByText("Recommendations could not be loaded for the map.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("retry triggers exactly one new fetch and disables the button while pending", async () => {
    let resolveRetry: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      resolveRetry = resolve;
    });
    const retry = vi.fn(() => pending);
    mocks.useTodayRecommendations.mockReturnValue({
      model: null,
      loading: false,
      loadError: "Recommendations could not be loaded for the map.",
      retry,
    });
    const { TasteShell } = await loadTasteShell();

    render(<TasteShell />);
    const button = screen.getByRole("button", { name: "Try again" });

    fireEvent.click(button);
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Retrying..." })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Retrying..." }));
    expect(retry).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRetry();
      await pending;
    });

    expect(screen.getByRole("button", { name: "Try again" })).not.toBeDisabled();
  });
});
