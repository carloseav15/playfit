"use client";

import { createInitialState, resetProductState, setCachedAuth } from "@playfit/core/store";
import type {
  ProductGameState,
  ProductPlatformOption,
  ProductSeedData,
  ProductState,
} from "@playfit/core/types";
import { nowIso } from "@playfit/core/utils";
import type React from "react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { clearGameCache, getCachedGame } from "@/lib/game-cache";
import { buildSiteUrl } from "@/lib/site-url";
import { supabase } from "@/lib/supabase/client";
import { AuthPanel } from "./auth-panel";
import { buildGameState } from "./game-action-helpers";
import type {
  PlayfitStateContextValue,
  PlayfitUiContextValue,
  ProductUiState,
} from "./playfit-context-types";
import { cloneState, initialUi, withDefaultPlatforms } from "./playfit-provider-helpers";
import {
  buildAdaptiveProfileFromCache,
  rebuildAdaptiveProfileFromCache,
} from "./profile-cache-helpers";
import { usePlayfitAuth } from "./use-playfit-auth";
import { usePlayfitBoot } from "./use-playfit-boot";
import { usePlayfitGameActions } from "./use-playfit-game-actions";
import { usePlayfitSearch } from "./use-playfit-search";
import { useProductTabNavigation } from "./use-product-tab-navigation";
import { useQueuedProfileSave } from "./use-queued-profile-save";

export type {
  PlayfitStateContextValue,
  PlayfitUiContextValue,
  ProductTab,
  ProductUiState,
  SaveStatus,
} from "./playfit-context-types";

export const PlayfitStateContext = createContext<PlayfitStateContextValue | null>(null);
export const PlayfitUiContext = createContext<PlayfitUiContextValue | null>(null);

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
  const [isSaving, setIsSaving] = useState(false);

  const { enqueueSave, flushSave } = useQueuedProfileSave({
    setAuthUser,
    setUseLocalProfile,
    setUi,
    setIsSaving,
  });

  const { onboardingSearchResults, onboardingSearchError, onboardingSearchPending } =
    usePlayfitSearch({
      onboardingQuery: ui?.onboardingQuery,
    });

  const bootError = usePlayfitBoot({
    authUser,
    useLocalProfile,
    platforms,
    enqueueSave,
    setState,
    setUi,
  });

  useProductTabNavigation({ activeTab: ui?.activeTab, state, setUi });

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
      isSaving,
      authUser,
      useLocalProfile,
      setUseLocalProfile,
      updateState,
      getSeedGame(gameId: string) {
        return getCachedGame(gameId) ?? null;
      },
      buildProfileFromCurrentData() {
        return buildAdaptiveProfileFromCache(state.user.onboarding, state.user.gameStates);
      },
      refreshAdaptiveProfile() {
        updateState((draft) => {
          if (draft.user.onboardingCompletedAt) {
            rebuildAdaptiveProfileFromCache(draft);
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
        const clean = withDefaultPlatforms(createInitialState(), platforms);
        void enqueueSave(clean);
        flushSave();
        setState(clean);
        updateUi(initialUi(clean));
        clearGameCache();
      },
      async resetTasteProfile() {
        // Propagates on failure so callers can keep local data intact and tell the user
        // the cloud profile was NOT deleted, instead of silently clearing local state as
        // if the reset had succeeded.
        await resetProductState();
        const clean = withDefaultPlatforms(createInitialState(), platforms);
        setState(clean);
        updateUi(initialUi(clean));
        clearGameCache();
      },
      async deleteAccount() {
        // Same as resetTasteProfile: a failed cloud delete must not clear local state or
        // sign the user out, or they'd believe their cloud data is gone when it isn't.
        await resetProductState();
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
        try {
          await fetch("/api/auth/mark-returning", { method: "DELETE" });
        } catch {
          // Cookie cleanup is best-effort; the local account state must still be cleared.
        }
        setCachedAuth(null, null);
        setAuthUser(null);
        setUseLocalProfile(false);
        const clean = withDefaultPlatforms(createInitialState(), platforms);
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
        try {
          await fetch("/api/auth/mark-returning", { method: "DELETE" });
        } catch {
          // Cookie cleanup is best-effort; the local auth state must still be cleared.
        }
        setCachedAuth(null, null);
        setAuthUser(null);
        setUseLocalProfile(false);
        const clean = withDefaultPlatforms(createInitialState(), platforms);
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
        updateUi((current) =>
          current ? { ...current, statusMessage: message, undoAction: null } : current,
        );
      },
      onboardingSearchError,
      onboardingSearchPending,
      searchGames(query: string) {
        const trimmed = query.trim();
        if (!trimmed) return [];
        const oq = ui?.onboardingQuery?.trim();
        if (trimmed === oq) return onboardingSearchResults;
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
    onboardingSearchError,
    onboardingSearchPending,
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
    return (
      <AuthPanel
        onAuth={handleAuth}
        onContinueLocal={handleLocalProfile}
        onClose={() => {
          window.location.href = "/";
        }}
      />
    );
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
