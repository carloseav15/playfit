import type { ProductOnboardingDraft, ProductSeedData, SeedGame } from "@playfit/core/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingSearchDialog } from "./onboarding-search-dialog";

function game(gameId: string, title: string): SeedGame {
  return {
    gameId,
    title,
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre: "action",
    tags: [],
    notes: "",
    coverPath: "",
    availablePlatformIds: [],
    availablePlatformNames: [],
    releaseState: "released",
  };
}

const seedData: ProductSeedData = {
  allGames: [],
  catalogGames: [],
  gamesById: new Map(),
  platforms: [],
};

const draft: ProductOnboardingDraft = {
  step: "anchors",
  platforms: [],
  likedGameIds: [],
  dislikedGameIds: [],
};

function baseProps(overrides: Partial<Parameters<typeof OnboardingSearchDialog>[0]> = {}) {
  return {
    anchorResults: [],
    draft,
    hasOnboardingSearch: true,
    onboardingQuery: "Hades",
    onboardingSearchError: null,
    onboardingSearchPending: false,
    onRetryOnboardingSearch: vi.fn(),
    replaceGameId: null,
    searchSlot: "anchor" as const,
    seedData,
    onAddAnchor: vi.fn(),
    onAddDislikedAnchor: vi.fn(),
    onClose: vi.fn(),
    onReplaceAnchor: vi.fn(),
    onQueryChange: vi.fn(),
    ...overrides,
  };
}

describe("OnboardingSearchDialog: stale-click safety", () => {
  it("selecting a result while not pending saves exactly the clicked game", () => {
    // "Stray" is deliberately not one of the onboarding quick-suggestion chip labels
    // (Elden Ring / Hades / Hollow Knight / Portal 2 / The Witcher 3) -- reusing one of
    // those titles here would make the row and the chip ambiguous to an accessible-name query.
    const onAddAnchor = vi.fn();
    const stray = game("stray", "Stray");
    const nightreign = game("elden_ring_nightreign", "Elden Ring Nightreign");
    render(
      <OnboardingSearchDialog
        {...baseProps({
          anchorResults: [stray, nightreign],
          onboardingSearchPending: false,
          onAddAnchor,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Stray/ }));

    expect(onAddAnchor).toHaveBeenCalledTimes(1);
    expect(onAddAnchor).toHaveBeenCalledWith(stray);
  });

  it("a fast click while a fresher search is pending cannot select any visible (stale) result", () => {
    const onAddAnchor = vi.fn();
    const staleWrongGame = game("hades_2_2001", "Hades 2 (2001)");
    render(
      <OnboardingSearchDialog
        {...baseProps({
          anchorResults: [staleWrongGame],
          onboardingSearchPending: true,
          onAddAnchor,
        })}
      />,
    );

    const row = screen.getByRole("button", { name: /Hades 2 \(2001\)/ });
    expect(row).toBeDisabled();

    fireEvent.click(row);

    expect(onAddAnchor).not.toHaveBeenCalled();
  });

  it("once pending clears, the now-current result becomes selectable again", () => {
    const onAddAnchor = vi.fn();
    const stray = game("stray", "Stray");
    const { rerender } = render(
      <OnboardingSearchDialog
        {...baseProps({ anchorResults: [stray], onboardingSearchPending: true, onAddAnchor })}
      />,
    );
    expect(screen.getByRole("button", { name: /^Stray/ })).toBeDisabled();

    rerender(
      <OnboardingSearchDialog
        {...baseProps({ anchorResults: [stray], onboardingSearchPending: false, onAddAnchor })}
      />,
    );

    const row = screen.getByRole("button", { name: /^Stray/ });
    expect(row).not.toBeDisabled();
    fireEvent.click(row);
    expect(onAddAnchor).toHaveBeenCalledWith(stray);
  });

  it("routes a click on the missed-game slot to onAddDislikedAnchor, not onAddAnchor", () => {
    const onAddAnchor = vi.fn();
    const onAddDislikedAnchor = vi.fn();
    const fifa = game("fifa_23", "FIFA 23");
    render(
      <OnboardingSearchDialog
        {...baseProps({
          searchSlot: "dislike",
          anchorResults: [fifa],
          onboardingSearchPending: false,
          onAddAnchor,
          onAddDislikedAnchor,
        })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /FIFA 23/ }));

    expect(onAddDislikedAnchor).toHaveBeenCalledWith(fifa);
    expect(onAddAnchor).not.toHaveBeenCalled();
  });
});

describe("OnboardingSearchDialog: recoverable search failure", () => {
  it("shows a retry action alongside the search error, and wires it to onRetryOnboardingSearch", () => {
    const onRetryOnboardingSearch = vi.fn();
    render(
      <OnboardingSearchDialog
        {...baseProps({
          anchorResults: [],
          onboardingSearchError: "Search could not load. Try again.",
          onRetryOnboardingSearch,
        })}
      />,
    );

    expect(screen.getByText("Search could not load. Try again.")).toBeTruthy();
    const retryButton = screen.getByRole("button", { name: "Try again" });
    fireEvent.click(retryButton);

    expect(onRetryOnboardingSearch).toHaveBeenCalledTimes(1);
  });

  it("does not show a retry action when there is no error", () => {
    render(<OnboardingSearchDialog {...baseProps({ anchorResults: [] })} />);

    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});
