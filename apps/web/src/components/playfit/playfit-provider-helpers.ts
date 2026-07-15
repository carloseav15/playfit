import type {
  ProductGameState,
  ProductPlatformOption,
  ProductState,
  SeedGame,
} from "@playfit/core/types";
import { nowIso } from "@playfit/core/utils";
import type { ProductTab, ProductUiState } from "./playfit-context-types";

export function cloneState(state: ProductState): ProductState {
  return structuredClone(state);
}

export function initialUi(state: ProductState): ProductUiState {
  const validTabs: ProductTab[] = ["today", "onboarding"];
  const hashTab =
    typeof window !== "undefined" ? (window.location.hash.replace("#", "") as ProductTab) : null;
  const defaultTab = state.user.onboardingCompletedAt ? "today" : "onboarding";
  const safeHashTab =
    state.user.onboardingCompletedAt || hashTab === "onboarding" ? hashTab : "onboarding";
  return {
    activeTab: safeHashTab && validTabs.includes(safeHashTab) ? safeHashTab : defaultTab,
    onboardingQuery: "",
    statusMessage: null,
    saveStatus: "idle",
    undoAction: null,
  };
}

function allPlatformsSelection(platforms: ProductPlatformOption[]) {
  return platforms.map((p) => ({ platformId: p.platformId, status: "available" as const }));
}

// Fresh profiles start with every known platform selected so skipped onboarding can still score
// the catalog. Existing selections and completed profiles are left untouched.
export function withDefaultPlatforms(
  state: ProductState,
  platforms: ProductPlatformOption[],
): ProductState {
  if (state.user.onboardingCompletedAt || state.user.onboarding.platforms.length > 0) {
    return state;
  }
  return {
    ...state,
    user: {
      ...state.user,
      onboarding: {
        ...state.user.onboarding,
        platforms: allPlatformsSelection(platforms),
      },
    },
  };
}

export function buildGameState(
  game: SeedGame,
  source: ProductGameState["source"],
): ProductGameState {
  const timestamp = nowIso();
  return {
    gameId: game.gameId,
    title: game.title,
    inBacklog: false,
    inWishlist: false,
    inPlayfitPicks: false,
    excluded: false,
    source,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
