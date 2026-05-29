import type {
  ProductGameState,
  ProductProfile,
  ProductProfileOverrides,
  ProductRating,
  ProductSeedData,
  ProductState,
  SeedGame,
} from "../types";

export type ProductTab = "onboarding" | "today" | "finder" | "library" | "profile" | "upcoming";
export type ProductModal = "recalibrate";
export type ProductProfileMode = "overview" | "edit";

export interface ProductOutcomeNotice {
  gameId: string;
  title: string;
  status: "beaten" | "completed" | "abandoned";
  rating: ProductRating;
}

export interface ProductUiState {
  activeTab: ProductTab;
  onboardingQuery: string;
  finderQuery: string;
  finderSelectedGameId: string | null;
  libraryQuery: string;
  activeModal: ProductModal | null;
  modalGameId: string | null;
  profileMode: ProductProfileMode;
  dossierGameId: string | null;
  statusMessage: string | null;
  outcomeNotice: ProductOutcomeNotice | null;
  startBannerDismissed: boolean;
  upcomingPlatformFilters: Set<string>;
  unratedBannerDismissed: boolean;
  isTabSwitch: boolean;
}

export interface AppContext {
  root: HTMLElement;
  state: ProductState;
  ui: ProductUiState;
  seedData: ProductSeedData;
  persistState: () => Promise<void>;
  setStatusMessage: (msg: string | null) => void;
  getSeedGame: (gameId: string) => SeedGame | null;
  buildProfileFromCurrentData: () => ProductProfile;
  refreshAdaptiveProfile: () => void;
  ensureProfileOverrides: () => ProductProfileOverrides;
  toggleFlag: (gameId: string, flag: "inBacklog" | "inWishlist" | "storyCompleted") => void;
  getOrCreateGameState: (gameId: string) => ProductGameState | null;
  openModal: (modal: ProductModal, gameId?: string | null) => void;
  closeModal: () => void;
  getAnchorResults: () => SeedGame[];
  searchGames: (query: string) => SeedGame[];
  render: () => void;
}
