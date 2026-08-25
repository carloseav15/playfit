import type { ProductOnboardingDraft, ProductSeedData } from "@playfit/core/types";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MissedGameStep } from "./game-selection-step";
import { OnboardingSearchDialog } from "./onboarding-search-dialog";
import { PlatformsStep } from "./platforms-step";

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const draft: ProductOnboardingDraft = {
  step: "platforms",
  platforms: [],
  likedGameIds: [],
  dislikedGameIds: [],
};

const seedData: ProductSeedData = {
  allGames: [],
  catalogGames: [],
  gamesById: new Map(),
  platforms: [],
};

describe("onboarding UI states", () => {
  it("renders the catalog error when platform options are unavailable", () => {
    render(
      <PlatformsStep
        draft={draft}
        seedData={seedData}
        selectedIds={new Set()}
        platformFamilies={[]}
        platformsUnavailable
        allSelected={false}
        showPlatformDetails={false}
        onShowPlatformDetailsChange={vi.fn()}
        onTogglePlatform={vi.fn()}
        onToggleAllPlatforms={vi.fn()}
        onTogglePlatformPreset={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByText(/Platforms could not be loaded/)).toBeInTheDocument();
    expect(screen.getAllByRole("button").some((button) => button.hasAttribute("disabled"))).toBe(
      true,
    );
  });

  it("renders a loading state while onboarding search is pending", () => {
    render(
      <OnboardingSearchDialog
        anchorResults={[]}
        draft={draft}
        hasOnboardingSearch
        onboardingQuery="Hades"
        onboardingSearchError={null}
        onboardingSearchPending
        onRetryOnboardingSearch={vi.fn()}
        replaceGameId={null}
        searchSlot="anchor"
        seedData={seedData}
        onAddAnchor={vi.fn()}
        onAddDislikedAnchor={vi.fn()}
        onClose={vi.fn()}
        onReplaceAnchor={vi.fn()}
        onQueryChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Searching catalog...")).toBeInTheDocument();
  });

  it("renders the search error instead of an empty result message", () => {
    render(
      <OnboardingSearchDialog
        anchorResults={[]}
        draft={draft}
        hasOnboardingSearch
        onboardingQuery="Hades"
        onboardingSearchError="Search could not load. Try again."
        onboardingSearchPending={false}
        onRetryOnboardingSearch={vi.fn()}
        replaceGameId={null}
        searchSlot="anchor"
        seedData={seedData}
        onAddAnchor={vi.fn()}
        onAddDislikedAnchor={vi.fn()}
        onClose={vi.fn()}
        onReplaceAnchor={vi.fn()}
        onQueryChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Search could not load. Try again.")).toBeInTheDocument();
    expect(screen.queryByText("No games found matching your search.")).not.toBeInTheDocument();
  });

  it("disables completion while the onboarding profile is finalizing", () => {
    const html = renderToStaticMarkup(
      <MissedGameStep
        draft={draft}
        getSeedGame={() => null}
        isFinalizing
        onBack={vi.fn()}
        onFinalize={vi.fn()}
        onRemoveDislikedAnchor={vi.fn()}
        onOpenSearch={vi.fn()}
      />,
    );

    expect(html).toContain("Saving your profile…");
    expect(html).toContain("disabled");
  });
});
