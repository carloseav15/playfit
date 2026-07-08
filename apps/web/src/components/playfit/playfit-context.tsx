"use client";

import { buildAdaptiveProfile } from "@playfit/core/domain";
import {
  createInitialState,
  loadProductState,
  resetProductState,
  setCachedAuth,
} from "@playfit/core/store";
import type {
  ProductDecisionFeedback,
  ProductGameState,
  ProductPlatformOption,
  ProductProfile,
  ProductRating,
  ProductSeedData,
  ProductState,
  ProductTasteSignalSource,
  SeedGame,
} from "@playfit/core/types";
import { nowIso } from "@playfit/core/utils";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { getErrorMessage } from "@/lib/api-errors";
import { clearGameCache, ensureGamesCached, getCachedGame } from "@/lib/game-cache";
import { buildSiteUrl } from "@/lib/site-url";
import { supabase } from "@/lib/supabase/client";
import { AuthPanel } from "./auth-panel";
import type { AuthUser } from "./use-playfit-auth";
import { usePlayfitAuth } from "./use-playfit-auth";
import { usePlayfitGameActions } from "./use-playfit-game-actions";
import { usePlayfitSearch } from "./use-playfit-search";
import { useQueuedProfileSave } from "./use-queued-profile-save";

export type ProductTab = "today" | "library" | "finder" | "upcoming" | "profile" | "onboarding";
export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface ProductUiState {
  activeTab: ProductTab;
  onboardingQuery: string;
  finderQuery: string;
  libraryQuery: string;
  libraryTab: "all" | "backlog" | "wishlist";
  librarySort: "title" | "rating-desc" | "rating-asc" | "status";
  profileMode: "overview" | "edit";
  statusMessage: string | null;
  saveStatus: SaveStatus;
  upcomingPlatformFilters: Set<string>;
  startBannerDismissed: boolean;
}

export interface PlayfitStateContextValue {
  seedData: ProductSeedData;
  state: ProductState;
  isPending: boolean;
  isSaving: boolean;
  authUser: AuthUser | null;
  useLocalProfile: boolean;
  setUseLocalProfile: (val: boolean) => void;
  updateState: (updater: (draft: ProductState) => void) => void;
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
  applyDecisionFeedback: (gameId: string, feedback: ProductDecisionFeedback) => void;
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
  finderSearchError: string | null;
  onboardingSearchError: string | null;
  onboardingSearchPending: boolean;
  searchGames: (query: string) => SeedGame[];
  flushSave: () => void;
  retrySave: () => Promise<void>;
}

export const PlayfitStateContext = createContext<PlayfitStateContextValue | null>(null);
export const PlayfitUiContext = createContext<PlayfitUiContextValue | null>(null);

function cloneState(state: ProductState): ProductState {
  return structuredClone(state);
}

function initialUi(state: ProductState): ProductUiState {
  const validTabs: ProductTab[] = [
    "today",
    "library",
    "finder",
    "upcoming",
    "profile",
    "onboarding",
  ];
  const hashTab =
    typeof window !== "undefined" ? (window.location.hash.replace("#", "") as ProductTab) : null;
  const defaultTab = state.user.onboardingCompletedAt ? "today" : "onboarding";
  const safeHashTab =
    state.user.onboardingCompletedAt || hashTab === "onboarding" ? hashTab : "onboarding";
  return {
    activeTab: safeHashTab && validTabs.includes(safeHashTab) ? safeHashTab : defaultTab,
    onboardingQuery: "",
    finderQuery: "",
    libraryQuery: "",
    libraryTab: "all",
    librarySort: "title",
    profileMode: "overview",
    statusMessage: null,
    saveStatus: "idle",
    upcomingPlatformFilters: new Set(
      state.user.onboarding.platforms
        .filter((entry) => ["available", "limited"].includes(entry.status))
        .map((entry) => entry.platformId),
    ),
    startBannerDismissed: false,
  };
}

// Keep the same signature helper function from the old provider to avoid breaking any references if imported directly
function buildGameState(game: SeedGame, source: ProductGameState["source"]): ProductGameState {
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

export function PlayfitProvider({
  children,
  platforms,
  localFirst = false,
}: {
  children: React.ReactNode;
  platforms: ProductPlatformOption[];
  localFirst?: boolean;
}) {
  const {
    authUser,
    authBusy,
    useLocalProfile,
    setAuthUser,
    setUseLocalProfile,
    handleAuth,
    handleLocalProfile,
  } = usePlayfitAuth(localFirst);
  const [state, setState] = useState<ProductState | null>(null);
  const [ui, setUi] = useState<ProductUiState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { enqueueSave, flushSave } = useQueuedProfileSave({
    setAuthUser,
    setUseLocalProfile,
    setUi,
    setIsSaving,
  });

  const {
    searchResults,
    onboardingSearchResults,
    finderSearchError,
    onboardingSearchError,
    onboardingSearchPending,
  } = usePlayfitSearch({
    finderQuery: ui?.finderQuery,
    onboardingQuery: ui?.onboardingQuery,
  });

  // Boot sequence
  useEffect(() => {
    if (!authUser && !useLocalProfile) return;
    let cancelled = false;

    async function boot() {
      try {
        const loadedState = await loadProductState();
        if (cancelled) return;

        const hadDataFlag = localStorage.getItem("playfit_had_data");
        const hasDataNow =
          !!loadedState.user.onboardingCompletedAt ||
          Object.keys(loadedState.user.gameStates).length > 0 ||
          loadedState.user.profile !== null;

        if (hasDataNow) {
          localStorage.setItem("playfit_had_data", "1");
        } else if (hadDataFlag === "1") {
          localStorage.removeItem("playfit_had_data");
          clearGameCache();
          if (!cancelled) {
            setState(loadedState);
            setUi(initialUi(loadedState));
          }
          return;
        }

        const gameIds = new Set([
          ...loadedState.user.onboarding.likedGameIds,
          ...(loadedState.user.onboarding.dislikedGameIds ?? []),
          ...Object.keys(loadedState.user.gameStates),
        ]);

        if (gameIds.size > 0) {
          await ensureGamesCached([...gameIds]);
        }

        if (loadedState.user.onboardingCompletedAt && !loadedState.user.profile) {
          try {
            const profileRes = await fetch("/api/recommendations/profile", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                onboarding: loadedState.user.onboarding,
                gameStates: loadedState.user.gameStates,
              }),
            });
            if (profileRes.ok) {
              const { profile } = (await profileRes.json()) as { profile: ProductProfile };
              const restored: ProductState = {
                ...loadedState,
                user: { ...loadedState.user, profile },
              };
              if (!cancelled) {
                setState(restored);
                setUi(initialUi(restored));
              }
              void enqueueSave(restored);
              return;
            }
          } catch {
            // Fall through to local build
          }

          const gamesById = new Map<string, SeedGame>();
          for (const id of gameIds) {
            const game = getCachedGame(id);
            if (game) gamesById.set(id, game);
          }
          const profile = buildAdaptiveProfile(
            loadedState.user.onboarding,
            gamesById,
            loadedState.user.gameStates,
          );
          const restored: ProductState = {
            ...loadedState,
            user: { ...loadedState.user, profile },
          };
          if (!cancelled) {
            setState(restored);
            setUi(initialUi(restored));
          }
          void enqueueSave(restored);
        } else {
          if (!cancelled) {
            setState(loadedState);
            setUi(initialUi(loadedState));
          }
        }
      } catch (error) {
        if (!cancelled) {
          setBootError(getErrorMessage(error, "Unexpected boot error."));
        }
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [authUser, useLocalProfile, enqueueSave]);

  const activeTab = ui?.activeTab;
  useEffect(() => {
    if (!activeTab) return;
    const hash = activeTab === "today" ? "" : activeTab;
    if (hash) {
      window.location.hash = hash;
    } else if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
  }, [activeTab]);

  useEffect(() => {
    if (!ui || !state) return;
    const onboardingCompleted = !!state.user.onboardingCompletedAt;

    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "") as ProductTab;
      const validTabs: ProductTab[] = [
        "today",
        "library",
        "finder",
        "upcoming",
        "profile",
        "onboarding",
      ];
      if (!hash || !validTabs.includes(hash)) return;

      const nextTab = onboardingCompleted || hash === "onboarding" ? hash : "onboarding";
      if (nextTab !== hash) {
        history.replaceState(null, "", `${window.location.pathname}#${nextTab}`);
      }

      setUi((current) => {
        if (!current || nextTab === current.activeTab) return current;
        return { ...current, activeTab: nextTab, profileMode: "overview" };
      });
    };
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [ui, state]);

  const updateState = useCallback(
    (updater: (draft: ProductState) => void) => {
      setState((current) => {
        if (!current) return current;
        const next = cloneState(current);
        updater(next);
        next.user.lastUpdatedAt = nowIso();
        void enqueueSave(next);
        return next;
      });
    },
    [enqueueSave],
  );

  const updateUi: React.Dispatch<React.SetStateAction<ProductUiState>> = useCallback((action) => {
    setUi((current) => {
      if (!current) return current;
      return typeof action === "function" ? action(current) : action;
    });
  }, []);

  const gamesByIdForProfile = useMemo(() => {
    if (!state) return new Map<string, SeedGame>();
    const map = new Map<string, SeedGame>();
    const ids = new Set([
      ...state.user.onboarding.likedGameIds,
      ...(state.user.onboarding.dislikedGameIds ?? []),
      ...Object.keys(state.user.gameStates),
    ]);
    for (const id of ids) {
      const game = getCachedGame(id);
      if (game) map.set(id, game);
    }
    return map;
  }, [
    state?.user.onboarding.likedGameIds,
    state?.user.onboarding.dislikedGameIds,
    state?.user.gameStates,
    state,
  ]);

  const gameActions = usePlayfitGameActions({
    state,
    updateState,
    updateUi,
  });

  const stateValue = useMemo(() => {
    if (!state) return null;

    return {
      seedData: {
        allGames: [],
        catalogGames: [],
        gamesById: new Map(),
        platforms,
      } satisfies ProductSeedData,
      state,
      isPending: false,
      isSaving,
      authUser,
      useLocalProfile,
      setUseLocalProfile,
      updateState,
      getSeedGame(gameId: string) {
        return getCachedGame(gameId) ?? null;
      },
      buildProfileFromCurrentData() {
        return buildAdaptiveProfile(
          state.user.onboarding,
          gamesByIdForProfile,
          state.user.gameStates,
        );
      },
      refreshAdaptiveProfile() {
        updateState((draft) => {
          if (draft.user.onboardingCompletedAt) {
            const ids = new Set([
              ...draft.user.onboarding.likedGameIds,
              ...(draft.user.onboarding.dislikedGameIds ?? []),
              ...Object.keys(draft.user.gameStates),
            ]);
            const map = new Map<string, SeedGame>();
            for (const id of ids) {
              const game = getCachedGame(id);
              if (game) map.set(id, game);
            }
            draft.user.profile = buildAdaptiveProfile(
              draft.user.onboarding,
              map,
              draft.user.gameStates,
            );
          }
        });
        setTimeout(() => {
          updateUi((current) =>
            current
              ? {
                  ...current,
                  statusMessage:
                    "Profile refreshed. Your latest ratings are now part of the signal.",
                }
              : current,
          );
        }, 0);
      },
      getOrCreateGameState(gameId: string, source: ProductGameState["source"] = "manual") {
        const game = getCachedGame(gameId);
        if (!game) return null;
        return state.user.gameStates[gameId] ?? buildGameState(game, source);
      },
      resetLocalState() {
        const clean = createInitialState();
        void enqueueSave(clean);
        flushSave();
        setState(clean);
        updateUi(initialUi(clean));
        clearGameCache();
      },
      async resetTasteProfile() {
        try {
          await resetProductState();
        } catch (err) {
          console.error("Failed to reset taste profile:", err);
        }
        const clean = createInitialState();
        setState(clean);
        updateUi(initialUi(clean));
        clearGameCache();
      },
      async deleteAccount() {
        try {
          await resetProductState();
        } catch (err) {
          console.error("Failed to delete account:", err);
        }
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        setCachedAuth(null, null);
        setAuthUser(null);
        setUseLocalProfile(false);
        const clean = createInitialState();
        setState(clean);
        updateUi(initialUi(clean));
        clearGameCache();
      },
      async signOut() {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        setCachedAuth(null, null);
        setAuthUser(null);
        setUseLocalProfile(false);
        const clean = createInitialState();
        setState(clean);
        updateUi(initialUi(clean));
        clearGameCache();
      },
      async linkGoogleAccount() {
        if (!authUser?.isAnonymous) return;
        const { error } = await supabase.auth.linkIdentity({
          provider: "google",
          options: {
            redirectTo: buildSiteUrl("/auth/callback"),
          },
        });
        if (error) {
          updateUi((current) =>
            current
              ? {
                  ...current,
                  statusMessage: error.message,
                }
              : current,
          );
        }
      },
      ...gameActions,
    } satisfies Omit<
      PlayfitStateContextValue,
      | "ui"
      | "setUi"
      | "setStatusMessage"
      | "finderSearchError"
      | "onboardingSearchError"
      | "onboardingSearchPending"
      | "searchGames"
      | "flushSave"
      | "retrySave"
    >;
  }, [
    state,
    isSaving,
    platforms,
    gamesByIdForProfile,
    updateState,
    updateUi,
    enqueueSave,
    flushSave,
    setAuthUser,
    setUseLocalProfile,
    authUser,
    useLocalProfile,
    gameActions,
  ]);

  const uiValue = useMemo(() => {
    if (!ui) return null;

    return {
      ui,
      setUi: updateUi,
      setStatusMessage(message: string | null) {
        updateUi((current) => (current ? { ...current, statusMessage: message } : current));
      },
      finderSearchError,
      onboardingSearchError,
      onboardingSearchPending,
      searchGames(query: string) {
        const trimmed = query.trim();
        if (!trimmed) return [];
        const fq = ui?.finderQuery?.trim();
        const oq = ui?.onboardingQuery?.trim();
        if (trimmed === fq) return searchResults;
        if (trimmed === oq) return onboardingSearchResults;
        if (fq?.startsWith(trimmed)) return searchResults;
        if (oq?.startsWith(trimmed)) return onboardingSearchResults;
        return [];
      },
      flushSave,
      async retrySave() {
        if (state) {
          await enqueueSave(state, { successMessage: "Saved." });
        }
      },
    } satisfies PlayfitUiContextValue;
  }, [
    ui,
    updateUi,
    finderSearchError,
    onboardingSearchError,
    onboardingSearchPending,
    searchResults,
    onboardingSearchResults,
    flushSave,
    enqueueSave,
    state,
  ]);

  if (authBusy) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div className="grid gap-3">
          <Spinner size="lg" className="mx-auto" />
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Playfit
          </p>
        </div>
      </main>
    );
  }

  if (!authUser && !useLocalProfile) {
    return <AuthPanel onAuth={handleAuth} onContinueLocal={handleLocalProfile} />;
  }

  if (bootError) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div className="grid max-w-md gap-3 rounded-lg border border-border bg-card p-6">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Playfit
          </p>
          <h1 className="font-display text-3xl font-extrabold">Playfit could not be loaded</h1>
          <p className="text-muted-foreground">{bootError}</p>
        </div>
      </main>
    );
  }

  if (!stateValue || !uiValue) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div className="grid gap-3">
          <Spinner size="lg" className="mx-auto" />
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Playfit
          </p>
          <h1 className="font-display text-3xl font-extrabold">Loading Playfit</h1>
          <p className="text-muted-foreground">Loading your profile.</p>
        </div>
      </main>
    );
  }

  return (
    <PlayfitStateContext.Provider value={stateValue}>
      <PlayfitUiContext.Provider value={uiValue}>{children}</PlayfitUiContext.Provider>
    </PlayfitStateContext.Provider>
  );
}

export function usePlayfitState() {
  const context = useContext(PlayfitStateContext);
  if (!context) {
    throw new Error("usePlayfitState must be used inside PlayfitProvider.");
  }
  return context;
}

export function usePlayfitUi() {
  const context = useContext(PlayfitUiContext);
  if (!context) {
    throw new Error("usePlayfitUi must be used inside PlayfitProvider.");
  }
  return context;
}

export function usePlayfit() {
  const stateContext = useContext(PlayfitStateContext);
  const uiContext = useContext(PlayfitUiContext);
  if (!stateContext || !uiContext) {
    throw new Error("usePlayfit must be used inside PlayfitProvider.");
  }
  return useMemo(
    () => ({
      ...stateContext,
      ...uiContext,
    }),
    [stateContext, uiContext],
  );
}
