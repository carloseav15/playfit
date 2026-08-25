import { createInitialState } from "@playfit/core/store";
import type { ProductProfile } from "@playfit/core/types";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("PicksShell: recoverable load error", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePlayfitState.mockReturnValue({
      state: readyState(),
      applyDecisionFeedback: vi.fn(),
      setPlayfitPick: vi.fn(),
    });
  });

  it("shows an explicit retry action alongside the load-error warning", async () => {
    mocks.usePicksRecommendations.mockReturnValue({
      picks: [],
      loading: false,
      loadError: "Playfit Picks could not be refreshed.",
      retry: vi.fn(),
    });
    const { PicksShell } = await loadPicksShell();

    render(<PicksShell />);

    expect(screen.getByText("Playfit Picks could not be refreshed.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("retry triggers exactly one new picks request", async () => {
    const retry = vi.fn(() => Promise.resolve());
    mocks.usePicksRecommendations.mockReturnValue({
      picks: [],
      loading: false,
      loadError: "Playfit Picks could not be refreshed.",
      retry,
    });
    const { PicksShell } = await loadPicksShell();

    render(<PicksShell />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    });

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("disables the retry button while pending and re-enables once it settles", async () => {
    let resolveRetry: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      resolveRetry = resolve;
    });
    const retry = vi.fn(() => pending);
    mocks.usePicksRecommendations.mockReturnValue({
      picks: [],
      loading: false,
      loadError: "Playfit Picks could not be refreshed.",
      retry,
    });
    const { PicksShell } = await loadPicksShell();

    render(<PicksShell />);
    const button = screen.getByRole("button", { name: "Try again" });

    fireEvent.click(button);
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
