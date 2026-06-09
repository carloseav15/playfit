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
  type ProductRating,
  type ProductSeedData,
  type ProductState,
  type SeedGame,
  saveProductState,
  searchSeedGames,
  supabase,
} from "@playfit/core";
import { useRouter } from "next/navigation";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Spinner } from "@/components/ui/spinner";
import { AuthPanel } from "./auth-panel";

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

interface PlayfitContextValue {
  seedData: ProductSeedData;
  state: ProductState;
  ui: ProductUiState;
  isPending: boolean;
  isSaving: boolean;
  setUi: React.Dispatch<React.SetStateAction<ProductUiState>>;
  updateState: (updater: (draft: ProductState) => void) => void;
  getSeedGame: (gameId: string) => SeedGame | null;
  searchGames: (query: string) => SeedGame[];
  buildProfileFromCurrentData: () => ProductProfile;
  refreshAdaptiveProfile: () => void;
  getOrCreateGameState: (
    gameId: string,
    source?: ProductGameState["source"],
  ) => ProductGameState | null;
  toggleFlag: (gameId: string, flag: "inBacklog" | "inWishlist") => void;
  setPlayStatus: (gameId: string, status: ProductGameState["status"] | undefined) => void;
  setRating: (gameId: string, rating: ProductRating | undefined) => void;
  excludeGame: (gameId: string) => void;
  setStatusMessage: (message: string | null) => void;
  retrySave: () => Promise<void>;
  resetLocalState: () => void;
  signOut: () => Promise<void>;
  openDossier: (gameId: string) => void;
  closeDossier: () => void;
}

const PlayfitContext = createContext<PlayfitContextValue | null>(null);

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

function buildGameState(game: SeedGame, source: ProductGameState["source"]): ProductGameState {
  const timestamp = nowIso();
  return {
    gameId: game.gameId,
    title: game.title,
    inBacklog: false,
    inWishlist: false,
    excluded: false,
    source,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function PlayfitProvider({ children }: { children: React.ReactNode }) {
  const [authUser, setAuthUser] = useState<{ id: string; email: string } | null>(null);
  const [authBusy, setAuthBusy] = useState(true);
  const [seedData, setSeedData] = useState<ProductSeedData | null>(null);
  const [state, setState] = useState<ProductState | null>(null);
  const [ui, setUi] = useState<ProductUiState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const finderIndexRef = useRef<{
    games: SeedGame[];
    index: ReturnType<typeof buildFinderIndex>;
  } | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveSequenceRef = useRef(0);
  const routerRef = useRef(useRouter());

  const handleAuth = useCallback((userId: string, email: string) => {
    setAuthUser({ id: userId, email });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then((res) => {
      const user = res.data.session?.user;
      if (user) {
        setAuthUser({ id: user.id, email: user.email ?? "" });
      }
      setAuthBusy(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuthUser({ id: session.user.id, email: session.user.email ?? "" });
      } else {
        setAuthUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;

    async function boot() {
      try {
        const [loadedSeedData, loadedState] = await Promise.all([
          loadProductSeedData(),
          loadProductState(),
        ]);

        if (cancelled) return;
        setSeedData(loadedSeedData);

        if (loadedState.user.onboardingCompletedAt && !loadedState.user.profile) {
          const profile = buildAdaptiveProfile(
            loadedState.user.onboarding,
            loadedSeedData.gamesById,
            loadedState.user.gameStates,
          );
          const restored: ProductState = {
            ...loadedState,
            user: { ...loadedState.user, profile },
          };
          setState(restored);
          setUi(initialUi(restored));
          void enqueueSave(restored);
        } else {
          setState(loadedState);
          setUi(initialUi(loadedState));
        }
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
  }, [authUser]);

  useEffect(() => {
    if (!ui) return;
    const hash = ui.activeTab === "today" ? "" : ui.activeTab;
    if (hash) {
      window.location.hash = hash;
    } else if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
  }, [ui?.activeTab]);

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

  const updateState = (updater: (draft: ProductState) => void) => {
    setState((current) => {
      if (!current) return current;
      const next = cloneState(current);
      updater(next);
      next.user.lastUpdatedAt = nowIso();
      void enqueueSave(next);
      return next;
    });
  };

  function enqueueSave(snapshot: ProductState, options: { successMessage?: string } = {}) {
    const sequence = ++saveSequenceRef.current;
    setIsSaving(true);
    setUi((currentUi) => (currentUi ? { ...currentUi, saveStatus: "saving" } : currentUi));

    const task = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        try {
          const result = await saveProductState(snapshot);
          if (!result.ok && result.reason === "auth_expired") {
            setAuthUser(null);
            return;
          }

          if (sequence !== saveSequenceRef.current) return;

          if (!result.ok) {
            setUi((currentUi) =>
              currentUi
                ? {
                    ...currentUi,
                    saveStatus: "error",
                    statusMessage: "Couldn't save. We'll retry when you're back online.",
                  }
                : currentUi,
            );
          } else {
            setUi((currentUi) =>
              currentUi
                ? {
                    ...currentUi,
                    saveStatus: "saved",
                    statusMessage: options.successMessage ?? currentUi.statusMessage,
                  }
                : currentUi,
            );
          }
        } catch {
          if (sequence !== saveSequenceRef.current) return;
          setUi((currentUi) =>
            currentUi
              ? {
                  ...currentUi,
                  saveStatus: "error",
                  statusMessage: "Couldn't save. We'll retry when you're back online.",
                }
              : currentUi,
          );
        } finally {
          if (sequence === saveSequenceRef.current) {
            setIsSaving(false);
          }
        }
      });

    saveQueueRef.current = task;
    return task;
  }

  const updateUi: React.Dispatch<React.SetStateAction<ProductUiState>> = useCallback((action) => {
    setUi((current) => {
      if (!current) return current;
      return typeof action === "function" ? action(current) : action;
    });
  }, []);

  const value = useMemo(() => {
    if (!seedData || !state || !ui) return null;
    return {
      seedData,
      state,
      ui,
      isPending: false,
      isSaving,
      setUi: updateUi,
      updateState,
      getSeedGame(gameId: string) {
        return seedData.gamesById.get(gameId) ?? null;
      },
      searchGames(query: string) {
        if (!finderIndexRef.current || finderIndexRef.current.games !== seedData.allGames) {
          finderIndexRef.current = {
            games: seedData.allGames,
            index: buildFinderIndex(seedData.allGames),
          };
        }
        return searchSeedGames(seedData.allGames, query, finderIndexRef.current.index);
      },
      buildProfileFromCurrentData() {
        return buildAdaptiveProfile(
          state.user.onboarding,
          seedData.gamesById,
          state.user.gameStates,
        );
      },
      refreshAdaptiveProfile() {
        updateState((draft) => {
          if (draft.user.onboardingCompletedAt) {
            draft.user.profile = buildAdaptiveProfile(
              draft.user.onboarding,
              seedData.gamesById,
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
        const game = seedData.gamesById.get(gameId);
        if (!game) return null;
        return state.user.gameStates[gameId] ?? buildGameState(game, source);
      },
      toggleFlag(gameId: string, flag: "inBacklog" | "inWishlist") {
        updateState((draft) => {
          const game = seedData.gamesById.get(gameId);
          if (!game) return;
          const existing = draft.user.gameStates[gameId] ?? buildGameState(game, "manual");
          draft.user.gameStates[gameId] = {
            ...existing,
            inBacklog: flag === "inBacklog" ? !existing.inBacklog : existing.inBacklog,
            inWishlist: flag === "inWishlist" ? !existing.inWishlist : existing.inWishlist,
            updatedAt: nowIso(),
          };
          if (draft.user.profile) {
            draft.user.profile = buildAdaptiveProfile(
              draft.user.onboarding,
              seedData.gamesById,
              draft.user.gameStates,
            );
          }
        });
      },
      setPlayStatus(gameId: string, status: ProductGameState["status"] | undefined) {
        updateState((draft) => {
          const game = seedData.gamesById.get(gameId);
          if (!game) return;
          const existing = draft.user.gameStates[gameId] ?? buildGameState(game, "manual");
          const next = { ...existing, updatedAt: nowIso() };
          if (status) {
            next.status = status;
          } else {
            delete next.status;
          }
          draft.user.gameStates[gameId] = next;
        });
      },
      setRating(gameId: string, rating: ProductRating | undefined) {
        updateState((draft) => {
          const game = seedData.gamesById.get(gameId);
          if (!game) return;
          const existing = draft.user.gameStates[gameId] ?? buildGameState(game, "manual");
          const next = { ...existing, updatedAt: nowIso() };
          if (rating != null && rating > 0) {
            next.rating = rating;
          } else {
            delete next.rating;
          }
          draft.user.gameStates[gameId] = next;
          if (draft.user.profile) {
            draft.user.profile = buildAdaptiveProfile(
              draft.user.onboarding,
              seedData.gamesById,
              draft.user.gameStates,
            );
          }
        });
      },
      excludeGame(gameId: string) {
        updateState((draft) => {
          const game = seedData.gamesById.get(gameId);
          if (!game) return;
          const existing = draft.user.gameStates[gameId] ?? buildGameState(game, "manual");
          draft.user.gameStates[gameId] = { ...existing, excluded: true, updatedAt: nowIso() };
        });
        setTimeout(() => {
          updateUi((current) =>
            current
              ? { ...current, statusMessage: "Noted. We'll find you something better." }
              : current,
          );
        }, 0);
      },
      setStatusMessage(message: string | null) {
        updateUi((current) => (current ? { ...current, statusMessage: message } : current));
      },
      async retrySave() {
        await enqueueSave(state, { successMessage: "Saved." });
      },
      resetLocalState() {
        const clean = createInitialState();
        void enqueueSave(clean);
        setState(clean);
        updateUi(initialUi(clean));
      },
      async signOut() {
        try {
          await supabase.auth.signOut();
        } catch {
          // Network or session error — still clear local state
        }
        setAuthUser(null);
        const clean = createInitialState();
        setState(clean);
        updateUi(initialUi(clean));
      },
      openDossier(gameId: string) {
        routerRef.current.push(`/app/game/${gameId}`);
      },
      closeDossier() {
        routerRef.current.push("/app");
      },
    } satisfies PlayfitContextValue;
  }, [seedData, state, ui, isSaving, updateState, updateUi]);

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

  if (!authUser) {
    return <AuthPanel onAuth={handleAuth} />;
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

  if (!seedData || !state || !ui) {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <div className="grid gap-3">
          <Spinner size="lg" className="mx-auto" />
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Playfit
          </p>
          <h1 className="font-display text-3xl font-extrabold">Loading Playfit</h1>
          <p className="text-muted-foreground">Reading game catalog and your saved profile.</p>
        </div>
      </main>
    );
  }

  return <PlayfitContext.Provider value={value}>{children}</PlayfitContext.Provider>;
}

export function usePlayfit() {
  const context = useContext(PlayfitContext);
  if (!context) {
    throw new Error("usePlayfit must be used inside PlayfitProvider.");
  }
  return context;
}
