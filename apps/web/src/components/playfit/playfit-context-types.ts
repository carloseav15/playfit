import type { SaveStateResult } from "@playfit/core/store";
import type {
  ProductDecisionFeedback,
  ProductGameState,
  ProductProfile,
  ProductRating,
  ProductSeedData,
  ProductState,
  ProductTasteActionClientResult,
  ProductTasteSignalSource,
  SeedGame,
} from "@playfit/core/types";
import type React from "react";
import type { AuthUser } from "./use-playfit-auth";

export type ProductTab = "today" | "onboarding";
export type SaveStatus = "idle" | "saving" | "saved" | "error";
export type OnboardingCompletionPhase = "idle" | "finding";

export interface ProductUiState {
  activeTab: ProductTab;
  onboardingQuery: string;
  statusMessage: string | null;
  saveStatus: SaveStatus;
  /** A short-lived handoff state between saving onboarding and the first Play Next result. */
  onboardingCompletionPhase: OnboardingCompletionPhase;
  /** When set, the status toast shows an "Undo" action that runs this and clears itself. */
  undoAction: (() => void) | null;
}

export interface PlayfitStateContextValue {
  seedData: ProductSeedData;
  state: ProductState;
  isSaving: boolean;
  authUser: AuthUser | null;
  useLocalProfile: boolean;
  setUseLocalProfile: (val: boolean) => void;
  updateState: (updater: (draft: ProductState) => void) => void;
  updateStateAndSave: (updater: (draft: ProductState) => void) => Promise<SaveStateResult>;
  getSeedGame: (gameId: string) => SeedGame | null;
  buildProfileFromCurrentData: () => ProductProfile;
  refreshAdaptiveProfile: () => void;
  getOrCreateGameState: (
    gameId: string,
    source?: ProductGameState["source"],
  ) => ProductGameState | null;
  toggleFlag: (gameId: string, flag: "inBacklog" | "inWishlist") => void;
  setPlayStatus: (gameId: string, status: ProductGameState["status"] | undefined) => void;
  setRating: (gameId: string, rating: ProductRating | undefined) => void;
  applyDecisionFeedback: (
    gameId: string,
    feedback: ProductDecisionFeedback,
    onUndo?: (result: ProductTasteActionClientResult) => void,
  ) => Promise<ProductTasteActionClientResult>;
  setPlayfitPick: (gameId: string, picked: boolean) => void;
  startPlayfitPick: (gameId: string) => void;
  removeTasteSignal: (gameId: string, source: ProductTasteSignalSource) => void;
  excludeGame: (gameId: string) => void;
  resetLocalState: () => void;
  resetTasteProfile: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  linkGoogleAccount: () => Promise<void>;
}

export interface PlayfitUiContextValue {
  ui: ProductUiState;
  setUi: React.Dispatch<React.SetStateAction<ProductUiState>>;
  setStatusMessage: (message: string | null) => void;
  onboardingSearchError: string | null;
  onboardingSearchPending: boolean;
  retryOnboardingSearch: () => void;
  searchGames: (query: string) => SeedGame[];
  flushSave: () => void;
  retrySave: () => Promise<void>;
}

export type PlayfitContextTypes = {
  state: PlayfitStateContextValue;
  ui: PlayfitUiContextValue;
};
