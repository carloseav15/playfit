import { buildAdaptiveProfile } from "./domain/onboarding";
import { buildFinderIndex, searchSeedGames } from "./domain/recommendations";
import type { AppContext, ProductModal, ProductUiState } from "./sections/context";
import { setupEventListeners } from "./sections/events";
import { renderShell } from "./sections/shell";
import { saveProductState } from "./store/indexed-db";
import type {
  ProductPlayStatus,
  ProductProfile,
  ProductProfileOverrides,
  ProductRating,
  ProductSeedData,
  ProductState,
} from "./types";
import { cloneState, nowIso } from "./ui/helpers";

export function createProductApp(
  root: HTMLElement,
  seedData: ProductSeedData,
  initialState: ProductState,
) {
  const state = cloneState(initialState);
  const finderIndex = buildFinderIndex(seedData.allGames);
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  const ui: ProductUiState = {
    activeTab: state.user.onboardingCompletedAt ? "today" : "onboarding",
    onboardingQuery: "",
    finderQuery: "",
    finderSelectedGameId: null,
    libraryQuery: "",
    activeModal: null,
    modalGameId: null,
    profileMode: "overview",
    dossierGameId: null,
    statusMessage: null,
    outcomeNotice: null,
    startBannerDismissed: false,
    upcomingPlatformFilters: new Set(
      state.user.onboarding.platforms
        .filter((entry) => ["available", "limited"].includes(entry.status))
        .map((entry) => entry.platformId),
    ),
    unratedBannerDismissed: false,
    isTabSwitch: false,
  };

  async function persistState() {
    state.user.lastUpdatedAt = nowIso();
    try {
      await saveProductState(state);
    } catch {
      setStatusMessage("Could not save your data. Check storage space and try again.");
      console.error("persistState failed");
    }
  }

  function setStatusMessage(message: string | null) {
    ui.statusMessage = message;
    if (statusTimer) clearTimeout(statusTimer);
    if (message) {
      statusTimer = setTimeout(() => {
        ui.statusMessage = null;
        render();
      }, 6000);
    }
  }

  function getSeedGame(gameId: string) {
    return seedData.gamesById.get(gameId) ?? null;
  }

  function buildProfile(): ProductProfile {
    return buildAdaptiveProfile(
      state.user.onboarding,
      seedData.gamesById,
      state.user.gameStates,
      state.user.profileOverrides,
    );
  }

  function refreshAdaptiveProfile() {
    if (!state.user.profile || !state.user.onboardingCompletedAt) {
      return;
    }
    state.user.profile = buildProfile();
  }

  function ensureProfileOverrides(): ProductProfileOverrides {
    state.user.profileOverrides ??= {};
    return state.user.profileOverrides;
  }

  function toggleFlag(gameId: string, flag: "inBacklog" | "inWishlist" | "storyCompleted") {
    const game = getSeedGame(gameId);
    if (!game) return;

    const existing = state.user.gameStates[gameId];
    state.user.gameStates[gameId] = {
      gameId,
      title: game.title,
      status: existing?.status,
      rating: existing?.rating,
      storyCompleted:
        flag === "storyCompleted" ? !existing?.storyCompleted : existing?.storyCompleted,
      inBacklog:
        flag === "inBacklog" ? !(existing?.inBacklog ?? false) : (existing?.inBacklog ?? false),
      inWishlist:
        flag === "inWishlist" ? !(existing?.inWishlist ?? false) : (existing?.inWishlist ?? false),
      source: existing?.source ?? "manual",
      createdAt: existing?.createdAt ?? nowIso(),
      updatedAt: nowIso(),
    };
  }

  function getOrCreateGameState(gameId: string) {
    const game = getSeedGame(gameId);
    if (!game) return null;

    const existing = state.user.gameStates[gameId];
    if (existing) return existing;

    const newState = {
      gameId,
      title: game.title,
      status: undefined as ProductPlayStatus | undefined,
      rating: undefined as ProductRating | undefined,
      storyCompleted: undefined as boolean | undefined,
      inBacklog: false,
      inWishlist: false,
      source: "manual" as const,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    state.user.gameStates[gameId] = newState;
    return newState;
  }

  function openModal(modal: ProductModal, gameId: string | null = null) {
    ui.activeModal = modal;
    ui.modalGameId = gameId;
    setStatusMessage(null);
  }

  function closeModal() {
    ui.activeModal = null;
    ui.modalGameId = null;
  }

  function getAnchorResults() {
    const query = ui.onboardingQuery;
    const current = searchSeedGames(seedData.allGames, query, finderIndex);
    return current.slice(0, 8);
  }

  function searchGames(query: string) {
    return searchSeedGames(seedData.allGames, query, finderIndex);
  }

  const ctx: AppContext = {
    root,
    state,
    ui,
    seedData,
    persistState,
    setStatusMessage,
    getSeedGame,
    buildProfileFromCurrentData: buildProfile,
    refreshAdaptiveProfile,
    ensureProfileOverrides,
    toggleFlag,
    getOrCreateGameState,
    openModal,
    closeModal,
    getAnchorResults,
    searchGames,
    render,
  };

  function render() {
    const isModalOpen = !!ui.dossierGameId || !!ui.activeModal;
    document.body.classList.toggle("has-modal", isModalOpen);
    renderShell(ctx);
  }

  setupEventListeners(ctx);
  refreshAdaptiveProfile();
  ui.isTabSwitch = true;
  render();
}
