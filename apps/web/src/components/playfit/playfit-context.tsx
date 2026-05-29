"use client";

import {
  buildAdaptiveProfile,
  buildFinderIndex,
  createInitialState,
  loadProductSeedData,
  loadProductState,
  nowIso,
  type ProductGameState,
  type ProductProfile,
  type ProductProfileOverrides,
  type ProductRating,
  type ProductSeedData,
  type ProductState,
  type SeedGame,
  saveProductState,
  searchSeedGames,
} from "@playfit/core";
import type React from "react";
import { createContext, useContext, useEffect, useState } from "react";

export type ProductTab = "today" | "library" | "finder" | "upcoming" | "profile" | "onboarding";

export interface ProductUiState {
  activeTab: ProductTab;
  onboardingQuery: string;
  finderQuery: string;
  libraryQuery: string;
  dossierGameId: string | null;
  profileMode: "overview" | "edit";
  statusMessage: string | null;
  upcomingPlatformFilters: Set<string>;
  startBannerDismissed: boolean;
}

interface PlayfitContextValue {
  seedData: ProductSeedData;
  state: ProductState;
  ui: ProductUiState;
  isPending: boolean;
  setUi: React.Dispatch<React.SetStateAction<ProductUiState>>;
  updateState: (updater: (draft: ProductState) => void) => void;
  getSeedGame: (gameId: string) => SeedGame | null;
  searchGames: (query: string) => SeedGame[];
  buildProfileFromCurrentData: () => ProductProfile;
  refreshAdaptiveProfile: () => void;
  ensureProfileOverrides: () => ProductProfileOverrides;
  getOrCreateGameState: (
    gameId: string,
    source?: ProductGameState["source"],
  ) => ProductGameState | null;
  toggleFlag: (gameId: string, flag: "inBacklog" | "inWishlist" | "storyCompleted") => void;
  setPlayStatus: (gameId: string, status: ProductGameState["status"] | undefined) => void;
  setRating: (gameId: string, rating: ProductRating) => void;
  setStatusMessage: (message: string | null) => void;
  resetLocalState: () => void;
  openDossier: (gameId: string) => void;
  closeDossier: () => void;
}

const PlayfitContext = createContext<PlayfitContextValue | null>(null);

function cloneState(state: ProductState): ProductState {
  return JSON.parse(JSON.stringify(state)) as ProductState;
}

function initialUi(state: ProductState): ProductUiState {
  return {
    activeTab: state.user.onboardingCompletedAt ? "today" : "onboarding",
    onboardingQuery: "",
    finderQuery: "",
    libraryQuery: "",
    dossierGameId: null,
    profileMode: "overview",
    statusMessage: null,
    upcomingPlatformFilters: new Set(
      state.user.onboarding.platforms
        .filter((entry) => ["available", "limited"].includes(entry.status))
        .map((entry) => entry.platformId),
    ),
    startBannerDismissed: false,
  };
}

function buildGameState(game: SeedGame, source: ProductGameState["source"]): ProductGameState {
  const timestamp = nowIso();
  return {
    gameId: game.gameId,
    title: game.title,
    inBacklog: false,
    inWishlist: false,
    source,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function PlayfitProvider({ children }: { children: React.ReactNode }) {
  const [seedData, setSeedData] = useState<ProductSeedData | null>(null);
  const [state, setState] = useState<ProductState | null>(null);
  const [ui, setUi] = useState<ProductUiState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const [loadedSeedData, loadedState] = await Promise.all([
          loadProductSeedData("/data/public/"),
          loadProductState(),
        ]);

        if (cancelled) return;
        setSeedData(loadedSeedData);
        setState(loadedState);
        setUi(initialUi(loadedState));
      } catch (error) {
        if (!cancelled) {
          setBootError(error instanceof Error ? error.message : "Unexpected boot error.");
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  if (bootError) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div className="grid max-w-md gap-3 rounded-lg border border-border bg-card p-6">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
            Playfit
          </p>
          <h1 className="font-display text-3xl font-black">Playfit could not be loaded</h1>
          <p className="text-muted-foreground">{bootError}</p>
        </div>
      </main>
    );
  }

  if (!seedData || !state || !ui) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div className="grid gap-3">
          <div className="mx-auto size-10 animate-spin rounded-full border-2 border-border border-t-accent" />
          <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
            Playfit
          </p>
          <h1 className="font-display text-3xl font-black">Loading Playfit</h1>
          <p className="text-muted-foreground">Reading game catalog and your saved profile.</p>
        </div>
      </main>
    );
  }

  const updateState = (updater: (draft: ProductState) => void) => {
    setState((current) => {
      if (!current) return current;
      const next = cloneState(current);
      updater(next);
      next.user.lastUpdatedAt = nowIso();
      void saveProductState(next).catch(() => {
        setUi((currentUi) => {
          return currentUi
            ? { ...currentUi, statusMessage: "Could not save your data." }
            : currentUi;
        });
      });
      return next;
    });
  };

  const updateUi: React.Dispatch<React.SetStateAction<ProductUiState>> = (action) => {
    setUi((current) => {
      if (!current) return current;
      return typeof action === "function" ? action(current) : action;
    });
  };

  const value = {
    seedData,
    state,
    ui,
    isPending: false,
    setUi: updateUi,
    updateState,
    getSeedGame(gameId: string) {
      return seedData.gamesById.get(gameId) ?? null;
    },
    searchGames(query: string) {
      const finderIndex = buildFinderIndex(seedData.allGames);
      return searchSeedGames(seedData.allGames, query, finderIndex);
    },
    buildProfileFromCurrentData() {
      return buildAdaptiveProfile(
        state.user.onboarding,
        seedData.gamesById,
        state.user.gameStates,
        state.user.profileOverrides,
      );
    },
    refreshAdaptiveProfile() {
      updateState((draft) => {
        if (draft.user.onboardingCompletedAt) {
          draft.user.profile = buildAdaptiveProfile(
            draft.user.onboarding,
            seedData.gamesById,
            draft.user.gameStates,
            draft.user.profileOverrides,
          );
        }
      });
    },
    ensureProfileOverrides() {
      return state.user.profileOverrides ?? {};
    },
    getOrCreateGameState(gameId: string, source: ProductGameState["source"] = "manual") {
      const game = seedData.gamesById.get(gameId);
      if (!game) return null;
      return state.user.gameStates[gameId] ?? buildGameState(game, source);
    },
    toggleFlag(gameId: string, flag: "inBacklog" | "inWishlist" | "storyCompleted") {
      updateState((draft) => {
        const game = seedData.gamesById.get(gameId);
        if (!game) return;
        const existing = draft.user.gameStates[gameId] ?? buildGameState(game, "manual");
        draft.user.gameStates[gameId] = {
          ...existing,
          inBacklog: flag === "inBacklog" ? !existing.inBacklog : existing.inBacklog,
          inWishlist: flag === "inWishlist" ? !existing.inWishlist : existing.inWishlist,
          storyCompleted:
            flag === "storyCompleted" ? !existing.storyCompleted : existing.storyCompleted,
          updatedAt: nowIso(),
        };
        if (draft.user.profile) {
          draft.user.profile = buildAdaptiveProfile(
            draft.user.onboarding,
            seedData.gamesById,
            draft.user.gameStates,
            draft.user.profileOverrides,
          );
        }
      });
    },
    setPlayStatus(gameId: string, status: ProductGameState["status"] | undefined) {
      updateState((draft) => {
        const game = seedData.gamesById.get(gameId);
        if (!game) return;
        const existing = draft.user.gameStates[gameId] ?? buildGameState(game, "manual");
        if (status === "playing") {
          for (const record of Object.values(draft.user.gameStates)) {
            if (record.status === "playing" && record.gameId !== gameId) {
              record.status = "on_hold";
              record.updatedAt = nowIso();
            }
          }
        }
        draft.user.gameStates[gameId] = { ...existing, status, updatedAt: nowIso() };
      });
    },
    setRating(gameId: string, rating: ProductRating) {
      updateState((draft) => {
        const game = seedData.gamesById.get(gameId);
        if (!game) return;
        const existing = draft.user.gameStates[gameId] ?? buildGameState(game, "manual");
        draft.user.gameStates[gameId] = { ...existing, rating, updatedAt: nowIso() };
        if (draft.user.profile) {
          draft.user.profile = buildAdaptiveProfile(
            draft.user.onboarding,
            seedData.gamesById,
            draft.user.gameStates,
            draft.user.profileOverrides,
          );
        }
      });
    },
    setStatusMessage(message: string | null) {
      setUi((current) => (current ? { ...current, statusMessage: message } : current));
    },
    resetLocalState() {
      const clean = createInitialState();
      void saveProductState(clean);
      setState(clean);
      setUi(initialUi(clean));
    },
    openDossier(gameId: string) {
      setUi((current) => (current ? { ...current, dossierGameId: gameId } : current));
    },
    closeDossier() {
      setUi((current) => (current ? { ...current, dossierGameId: null } : current));
    },
  } satisfies PlayfitContextValue;

  return <PlayfitContext.Provider value={value}>{children}</PlayfitContext.Provider>;
}

export function usePlayfit() {
  const context = useContext(PlayfitContext);
  if (!context) {
    throw new Error("usePlayfit must be used inside PlayfitProvider.");
  }
  return context;
}
