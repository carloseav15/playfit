"use client";

import {
  applyProductDecisionFeedback,
  buildAdaptiveProfile,
  productDecisionFeedbackMessages,
} from "@playfit/core/domain";
import {
  createInitialState,
  loadProductState,
  resetProductState,
  saveProductState,
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
import type { User } from "@supabase/supabase-js";
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
import {
  addGamesToCache,
  clearGameCache,
  ensureGamesCached,
  getCachedGame,
} from "@/lib/game-cache";
import { supabase } from "@/lib/supabase/client";
import { AuthPanel } from "./auth-panel";

export type ProductTab = "today" | "library" | "finder" | "upcoming" | "profile" | "onboarding";
export type SaveStatus = "idle" | "saving" | "saved" | "error";
type AuthUser = { id: string; email: string; isAnonymous: boolean };
const PLAYFIT_PICKS_LIMIT = 100;

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
  authUser: AuthUser | null;
  useLocalProfile: boolean;
  setUseLocalProfile: (val: boolean) => void;
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
  applyDecisionFeedback: (gameId: string, feedback: ProductDecisionFeedback) => void;
  setPlayfitPick: (gameId: string, picked: boolean) => void;
  startPlayfitPick: (gameId: string) => void;
  removeTasteSignal: (gameId: string, source: ProductTasteSignalSource) => void;
  excludeGame: (gameId: string) => void;
  setStatusMessage: (message: string | null) => void;
  finderSearchError: string | null;
  onboardingSearchError: string | null;
  onboardingSearchPending: boolean;
  retrySave: () => Promise<void>;
  resetLocalState: () => void;
  resetTasteProfile: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  signOut: () => Promise<void>;
  linkGoogleAccount: () => Promise<void>;
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
    inPlayfitPicks: false,
    excluded: false,
    source,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function isTerminalGameState(record: ProductGameState | undefined) {
  return (
    record?.status === "completed" ||
    record?.status === "beaten" ||
    record?.status === "abandoned" ||
    record?.excluded === true
  );
}

function activePlayfitPickCount(gameStates: Record<string, ProductGameState>) {
  return Object.values(gameStates).filter(
    (record) => record.inPlayfitPicks && !isTerminalGameState(record),
  ).length;
}

function shouldDeleteManualState(record: ProductGameState) {
  return (
    record.source === "manual" &&
    !record.status &&
    record.rating == null &&
    !record.inBacklog &&
    !record.inWishlist &&
    !record.inPlayfitPicks &&
    !record.excluded
  );
}

function rebuildAdaptiveProfileFromCache(draft: ProductState) {
  if (!draft.user.profile && !draft.user.onboardingCompletedAt) return;
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
  draft.user.profile = buildAdaptiveProfile(draft.user.onboarding, map, draft.user.gameStates);
}

function usePlayfitAuth(localFirst = false) {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authBusy, setAuthBusy] = useState(true);
  const [useLocalProfile, setUseLocalProfile] = useState(false);

  const handleAuth = useCallback((userId: string, email: string, isAnonymous = false) => {
    setUseLocalProfile(false);
    setAuthUser({ id: userId, email, isAnonymous });
  }, []);

  const handleLocalProfile = useCallback(() => {
    setUseLocalProfile(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    function mapAuthUser(user: User) {
      const isAnonymous = user.is_anonymous === true;
      return {
        id: user.id,
        email: isAnonymous ? "Guest profile" : (user.email ?? ""),
        isAnonymous,
      };
    }

    async function ensureSession() {
      try {
        const res = await supabase.auth.getSession();
        const session = res.data.session;
        if (cancelled) return;

        if (session?.user) {
          setCachedAuth(session.access_token ?? null, session.user.id);
          setUseLocalProfile(false);
          setAuthUser(mapAuthUser(session.user));
          return;
        }

        if (localFirst) {
          const { data, error } = await supabase.auth.signInAnonymously();
          if (cancelled) return;

          if (!error && data.session?.user) {
            setCachedAuth(data.session.access_token ?? null, data.session.user.id);
            setUseLocalProfile(false);
            setAuthUser(mapAuthUser(data.session.user));
            return;
          }

          setUseLocalProfile(true);
          setAuthUser(null);
        }
      } finally {
        if (!cancelled) setAuthBusy(false);
      }
    }

    void ensureSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setCachedAuth(session.access_token, session.user.id);
        setUseLocalProfile(false);
        setAuthUser(mapAuthUser(session.user));
      } else {
        setCachedAuth(null, null);
        setAuthUser(null);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [localFirst]);

  return {
    authUser,
    authBusy,
    useLocalProfile,
    setAuthUser,
    setUseLocalProfile,
    handleAuth,
    handleLocalProfile,
  };
}

function useQueuedProfileSave({
  setAuthUser,
  setUseLocalProfile,
  setUi,
  setIsSaving,
}: {
  setAuthUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  setUseLocalProfile: React.Dispatch<React.SetStateAction<boolean>>;
  setUi: React.Dispatch<React.SetStateAction<ProductUiState | null>>;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveSequenceRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSnapshotRef = useRef<ProductState | null>(null);
  const pendingOptionsRef = useRef<{ successMessage?: string }>({});

  const doSave = useCallback(
    (snapshot: ProductState, options: { successMessage?: string } = {}) => {
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
              setUseLocalProfile(false);
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
    },
    [setAuthUser, setUseLocalProfile, setUi, setIsSaving],
  );

  return useCallback(
    (snapshot: ProductState, options: { successMessage?: string } = {}) => {
      pendingSnapshotRef.current = snapshot;
      pendingOptionsRef.current = options;

      setIsSaving(true);
      setUi((currentUi) => (currentUi ? { ...currentUi, saveStatus: "saving" } : currentUi));

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        const latest = pendingSnapshotRef.current;
        const latestOptions = pendingOptionsRef.current;
        pendingSnapshotRef.current = null;
        pendingOptionsRef.current = {};
        if (latest) {
          doSave(latest, latestOptions);
        }
      }, 1000);
    },
    [doSave, setIsSaving, setUi],
  );
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
  const [searchResults, setSearchResults] = useState<SeedGame[]>([]);
  const [onboardingSearchResults, setOnboardingSearchResults] = useState<SeedGame[]>([]);
  const [finderSearchError, setFinderSearchError] = useState<string | null>(null);
  const [onboardingSearchError, setOnboardingSearchError] = useState<string | null>(null);
  const [onboardingSearchPending, setOnboardingSearchPending] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onboardingSearchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchRequestCounterRef = useRef(0);
  const onboardingSearchRequestCounterRef = useRef(0);
  const routerRef = useRef(useRouter());
  const enqueueSave = useQueuedProfileSave({
    setAuthUser,
    setUseLocalProfile,
    setUi,
    setIsSaving,
  });

  // Replace the old boot sequence: load state, prefetch game IDs, build profile
  useEffect(() => {
    if (!authUser && !useLocalProfile) return;
    let cancelled = false;

    async function boot() {
      try {
        const loadedState = await loadProductState();
        if (cancelled) return;

        // Detect data loss: user previously had data but it's gone from the DB
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

        // Collect all game IDs referenced by this user
        const gameIds = new Set([
          ...loadedState.user.onboarding.likedGameIds,
          ...(loadedState.user.onboarding.dislikedGameIds ?? []),
          ...Object.keys(loadedState.user.gameStates),
        ]);

        // Prefetch these games into the cache
        if (gameIds.size > 0) {
          await ensureGamesCached([...gameIds]);
        }

        // Build profile if onboarding is complete but profile is missing
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

          // Fallback: build profile from cached games
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
          setBootError(error instanceof Error ? error.message : "Unexpected boot error.");
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

  // Debounced search for FinderSection
  useEffect(() => {
    if (!ui?.finderQuery?.trim()) {
      setSearchResults([]);
      setFinderSearchError(null);
      return;
    }
    const requestId = ++searchRequestCounterRef.current;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/games?q=${encodeURIComponent(ui.finderQuery.trim())}`);
        if (!res.ok) {
          if (requestId !== searchRequestCounterRef.current) return;
          setFinderSearchError("Search could not load. Try again.");
          setSearchResults([]);
          return;
        }
        const data = (await res.json()) as { games: SeedGame[] };
        if (requestId !== searchRequestCounterRef.current) return;
        setFinderSearchError(null);
        addGamesToCache(data.games);
        setSearchResults(data.games);
      } catch {
        if (requestId !== searchRequestCounterRef.current) return;
        setFinderSearchError("Search could not load. Try again.");
        setSearchResults([]);
      }
    }, 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [ui?.finderQuery]);

  // Debounced search for OnboardingSection
  useEffect(() => {
    if (!ui?.onboardingQuery?.trim()) {
      setOnboardingSearchResults([]);
      setOnboardingSearchError(null);
      setOnboardingSearchPending(false);
      return;
    }
    const requestId = ++onboardingSearchRequestCounterRef.current;
    if (onboardingSearchTimerRef.current) clearTimeout(onboardingSearchTimerRef.current);
    setOnboardingSearchPending(true);
    onboardingSearchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/games?q=${encodeURIComponent(ui.onboardingQuery.trim())}`);
        if (!res.ok) {
          if (requestId !== onboardingSearchRequestCounterRef.current) return;
          setOnboardingSearchError("Search could not load. Try again.");
          setOnboardingSearchResults([]);
          setOnboardingSearchPending(false);
          return;
        }
        const data = (await res.json()) as { games: SeedGame[] };
        if (requestId !== onboardingSearchRequestCounterRef.current) return;
        setOnboardingSearchError(null);
        addGamesToCache(data.games);
        setOnboardingSearchResults(data.games);
        setOnboardingSearchPending(false);
      } catch {
        if (requestId !== onboardingSearchRequestCounterRef.current) return;
        setOnboardingSearchError("Search could not load. Try again.");
        setOnboardingSearchResults([]);
        setOnboardingSearchPending(false);
      }
    }, 250);
    return () => {
      if (onboardingSearchTimerRef.current) clearTimeout(onboardingSearchTimerRef.current);
    };
  }, [ui?.onboardingQuery]);

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

  const value = useMemo(() => {
    if (!state || !ui) return null;

    return {
      seedData: {
        allGames: [],
        catalogGames: [],
        gamesById: new Map(),
        platforms,
      } satisfies ProductSeedData,
      state,
      ui,
      isPending: false,
      isSaving,
      authUser,
      useLocalProfile,
      setUseLocalProfile,
      finderSearchError,
      onboardingSearchError,
      onboardingSearchPending,
      setUi: updateUi,
      updateState,
      getSeedGame(gameId: string) {
        return getCachedGame(gameId) ?? null;
      },
      searchGames(query: string) {
        const trimmed = query.trim();
        if (!trimmed) return [];
        const fq = ui?.finderQuery?.trim();
        const oq = ui?.onboardingQuery?.trim();
        if (trimmed === fq) return searchResults;
        if (trimmed === oq) return onboardingSearchResults;
        // Handle deferred queries (stale but valid prefix)
        if (fq?.startsWith(trimmed)) return searchResults;
        if (oq?.startsWith(trimmed)) return onboardingSearchResults;
        return [];
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
      toggleFlag(gameId: string, flag: "inBacklog" | "inWishlist") {
        updateState((draft) => {
          const game = getCachedGame(gameId);
          if (!game) return;
          const existing = draft.user.gameStates[gameId] ?? buildGameState(game, "manual");
          draft.user.gameStates[gameId] = {
            ...existing,
            inBacklog: flag === "inBacklog" ? !existing.inBacklog : existing.inBacklog,
            inWishlist: flag === "inWishlist" ? !existing.inWishlist : existing.inWishlist,
            updatedAt: nowIso(),
          };
          if (draft.user.profile) {
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
      },
      setPlayStatus(gameId: string, status: ProductGameState["status"] | undefined) {
        updateState((draft) => {
          const game = getCachedGame(gameId);
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
          const game = getCachedGame(gameId);
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
      },
      applyDecisionFeedback(gameId: string, feedback: ProductDecisionFeedback) {
        const game = getCachedGame(gameId);
        if (!game) return;
        updateState((draft) => {
          const g = getCachedGame(gameId);
          if (!g) return;
          const ids = new Set([
            ...draft.user.onboarding.likedGameIds,
            ...(draft.user.onboarding.dislikedGameIds ?? []),
            ...Object.keys(draft.user.gameStates),
            gameId,
          ]);
          const map = new Map<string, SeedGame>([[g.gameId, g]]);
          for (const id of ids) {
            const cachedGame = getCachedGame(id);
            if (cachedGame) map.set(id, cachedGame);
          }
          applyProductDecisionFeedback({
            state: draft,
            game: g,
            gamesById: map,
            feedback,
          });
        });
        setTimeout(() => {
          updateUi((current) =>
            current
              ? { ...current, statusMessage: productDecisionFeedbackMessages[feedback] }
              : current,
          );
        }, 0);
      },
      setPlayfitPick(gameId: string, picked: boolean) {
        const existing = state.user.gameStates[gameId];
        if (picked && isTerminalGameState(existing)) {
          updateUi((current) =>
            current
              ? {
                  ...current,
                  statusMessage: "That game is already resolved in your taste history.",
                }
              : current,
          );
          return;
        }
        if (
          picked &&
          !existing?.inPlayfitPicks &&
          activePlayfitPickCount(state.user.gameStates) >= PLAYFIT_PICKS_LIMIT
        ) {
          updateUi((current) =>
            current
              ? {
                  ...current,
                  statusMessage: "Playfit Picks is full. Remove one before adding more.",
                }
              : current,
          );
          return;
        }

        updateState((draft) => {
          const game = getCachedGame(gameId);
          if (!game) return;
          const current = draft.user.gameStates[gameId] ?? buildGameState(game, "manual");
          const next = {
            ...current,
            inPlayfitPicks: picked,
            updatedAt: nowIso(),
          };
          if (shouldDeleteManualState(next)) {
            delete draft.user.gameStates[gameId];
          } else {
            draft.user.gameStates[gameId] = next;
          }
        });

        setTimeout(() => {
          updateUi((current) =>
            current
              ? {
                  ...current,
                  statusMessage: picked ? "Added to Playfit Picks." : "Removed from Playfit Picks.",
                }
              : current,
          );
        }, 0);
      },
      startPlayfitPick(gameId: string) {
        updateState((draft) => {
          const game = getCachedGame(gameId);
          if (!game) return;
          const existing = draft.user.gameStates[gameId] ?? buildGameState(game, "manual");
          draft.user.gameStates[gameId] = {
            ...existing,
            status: "playing",
            inBacklog: false,
            inPlayfitPicks: false,
            excluded: false,
            updatedAt: nowIso(),
          };
        });
        setTimeout(() => {
          updateUi((current) =>
            current
              ? { ...current, statusMessage: "Started. Playfit Picks will move on." }
              : current,
          );
        }, 0);
      },
      removeTasteSignal(gameId: string, source: ProductTasteSignalSource) {
        updateState((draft) => {
          if (source === "onboarding_liked") {
            draft.user.onboarding.likedGameIds = draft.user.onboarding.likedGameIds.filter(
              (id) => id !== gameId,
            );
          }

          if (source === "onboarding_disliked") {
            draft.user.onboarding.dislikedGameIds = (
              draft.user.onboarding.dislikedGameIds ?? []
            ).filter((id) => id !== gameId);
          }

          const existing = draft.user.gameStates[gameId];
          if (source === "rating" && existing) {
            const next = { ...existing, updatedAt: nowIso() };
            delete next.rating;
            if (
              next.status === "completed" ||
              next.status === "beaten" ||
              next.status === "abandoned"
            ) {
              delete next.status;
            }
            next.excluded = false;
            if (shouldDeleteManualState(next)) {
              delete draft.user.gameStates[gameId];
            } else {
              draft.user.gameStates[gameId] = next;
            }
          }

          if (source !== "rating") {
            const next = draft.user.gameStates[gameId];
            if (
              next &&
              next.source === "onboarding" &&
              next.rating == null &&
              !next.status &&
              !next.inBacklog &&
              !next.inWishlist &&
              !next.inPlayfitPicks &&
              !next.excluded
            ) {
              delete draft.user.gameStates[gameId];
            }
          }

          rebuildAdaptiveProfileFromCache(draft);
        });
        setTimeout(() => {
          updateUi((current) =>
            current
              ? {
                  ...current,
                  statusMessage: "Taste signal removed. Playfit recalculated your profile.",
                }
              : current,
          );
        }, 0);
      },
      excludeGame(gameId: string) {
        updateState((draft) => {
          const game = getCachedGame(gameId);
          if (!game) return;
          const existing = draft.user.gameStates[gameId] ?? buildGameState(game, "manual");
          draft.user.gameStates[gameId] = {
            ...existing,
            excluded: true,
            inPlayfitPicks: false,
            updatedAt: nowIso(),
          };
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
          // Network or session error — still clear local state
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
            redirectTo: `${window.location.origin}/auth/callback`,
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
      openDossier(gameId: string) {
        routerRef.current.push(`/app/game/${gameId}`);
      },
      closeDossier() {
        routerRef.current.replace("/app");
      },
    } satisfies PlayfitContextValue;
  }, [
    state,
    ui,
    isSaving,
    platforms,
    searchResults,
    onboardingSearchResults,
    finderSearchError,
    onboardingSearchError,
    onboardingSearchPending,
    gamesByIdForProfile,
    updateState,
    updateUi,
    enqueueSave,
    setAuthUser,
    setUseLocalProfile,
    authUser,
    useLocalProfile,
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

  if (!value) {
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

  return <PlayfitContext.Provider value={value}>{children}</PlayfitContext.Provider>;
}

export function usePlayfit() {
  const context = useContext(PlayfitContext);
  if (!context) {
    throw new Error("usePlayfit must be used inside PlayfitProvider.");
  }
  return context;
}
