import {
  applyProductDecisionFeedback,
  productDecisionFeedbackMessages,
} from "@playfit/core/domain";
import type {
  ProductDecisionFeedback,
  ProductGameState,
  ProductRating,
  ProductState,
  ProductTasteActionClientResult,
  ProductTasteSignalSource,
} from "@playfit/core/types";
import { nowIso } from "@playfit/core/utils";
import { useCallback } from "react";
import { getCachedGame } from "@/lib/game-cache";
import {
  activePlayfitPickCount,
  buildGameState,
  isTerminalGameState,
  PLAYFIT_PICKS_LIMIT,
  rebuildAdaptiveProfileFromCache,
  shouldDeleteManualState,
} from "./game-action-helpers";
import type { ProductUiState } from "./playfit-context-types";
import { buildAdaptiveProfileFromCache, buildProfileGamesById } from "./profile-cache-helpers";
import { canonicalActionForFeedback, useCanonicalDecisions } from "./use-canonical-decisions";

interface UsePlayfitGameActionsProps {
  state: ProductState | null;
  updateState: (updater: (draft: ProductState) => void) => void;
  updateUi: React.Dispatch<React.SetStateAction<ProductUiState>>;
  flushSave: () => Promise<unknown>;
  getCurrentState: () => ProductState | null;
  replaceAuthoritativeState: (state: ProductState) => void;
}

export function usePlayfitGameActions({
  state,
  updateState,
  updateUi,
  flushSave,
  getCurrentState,
  replaceAuthoritativeState,
}: UsePlayfitGameActionsProps) {
  const { applyCanonicalFeedback } = useCanonicalDecisions({
    updateUi,
    flushSave,
    getCurrentState,
    replaceAuthoritativeState,
  });
  const toggleFlag = useCallback(
    (gameId: string, flag: "inBacklog" | "inWishlist") => {
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
          draft.user.profile = buildAdaptiveProfileFromCache(
            draft.user.onboarding,
            draft.user.gameStates,
          );
        }
      });
    },
    [updateState],
  );

  const setPlayStatus = useCallback(
    (gameId: string, status: ProductGameState["status"] | undefined) => {
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
    [updateState],
  );

  const setRating = useCallback(
    (gameId: string, rating: ProductRating | undefined) => {
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
          draft.user.profile = buildAdaptiveProfileFromCache(
            draft.user.onboarding,
            draft.user.gameStates,
          );
        }
      });
    },
    [updateState],
  );

  const applyDecisionFeedback = useCallback(
    (
      gameId: string,
      feedback: ProductDecisionFeedback,
      onUndo?: (result: ProductTasteActionClientResult) => void,
    ): Promise<ProductTasteActionClientResult> => {
      if (canonicalActionForFeedback(feedback)) {
        return applyCanonicalFeedback(gameId, feedback, onUndo);
      }

      const game = getCachedGame(gameId);
      if (!game) return Promise.resolve({ ok: true, canonical: false });
      const previousGameState = state?.user.gameStates[gameId];
      updateState((draft) => {
        const g = getCachedGame(gameId);
        if (!g) return;
        const map = buildProfileGamesById(draft.user.onboarding, draft.user.gameStates);
        map.set(g.gameId, g);
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
            ? {
                ...current,
                statusMessage: productDecisionFeedbackMessages[feedback],
                undoAction: () => {
                  updateState((draft) => {
                    if (previousGameState) {
                      draft.user.gameStates[gameId] = previousGameState;
                    } else {
                      delete draft.user.gameStates[gameId];
                    }
                  });
                  updateUi((c) => (c ? { ...c, statusMessage: "Undone.", undoAction: null } : c));
                  onUndo?.({ ok: true, canonical: false });
                },
              }
            : current,
        );
      }, 0);
      return Promise.resolve({ ok: true, canonical: false });
    },
    [state, updateState, updateUi, applyCanonicalFeedback],
  );

  const startPlayfitPick = useCallback(
    (gameId: string) => applyDecisionFeedback(gameId, "play"),
    [applyDecisionFeedback],
  );

  const setPlayfitPick = useCallback(
    (gameId: string, picked: boolean) => {
      if (!state) return;
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
                statusMessage: "My Picks is full. Remove one before adding more.",
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
                statusMessage: picked ? "Added to My Picks." : "Removed from My Picks.",
              }
            : current,
        );
      }, 0);
    },
    [state, updateState, updateUi],
  );

  const removeTasteSignal = useCallback(
    (gameId: string, source: ProductTasteSignalSource) => {
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
    [updateState, updateUi],
  );

  const excludeGame = useCallback(
    (gameId: string) => {
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
    [updateState, updateUi],
  );

  return {
    toggleFlag,
    setPlayStatus,
    setRating,
    applyDecisionFeedback,
    setPlayfitPick,
    startPlayfitPick,
    removeTasteSignal,
    excludeGame,
  };
}
