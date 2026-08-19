import {
  applyProductDecisionFeedback,
  productDecisionFeedbackMessages,
} from "@playfit/core/domain";
import { authenticatedFetch, loadProductStateOrNull } from "@playfit/core/store";
import type {
  ProductCanonicalDecisionResponse,
  ProductDecisionFeedback,
  ProductGameState,
  ProductRating,
  ProductStartedActionType,
  ProductState,
  ProductTasteActionClientResult,
  ProductTasteActionResponse,
  ProductTasteActionType,
  ProductTasteSignalSource,
  ProductUndoDecisionResponse,
} from "@playfit/core/types";
import { nowIso } from "@playfit/core/utils";
import { useCallback, useRef } from "react";
import { addGamesToCache, getCachedGame } from "@/lib/game-cache";
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
import { addRecommendationsToSessionCache } from "./recommendation-cache";

interface UsePlayfitGameActionsProps {
  state: ProductState | null;
  updateState: (updater: (draft: ProductState) => void) => void;
  updateUi: React.Dispatch<React.SetStateAction<ProductUiState>>;
  flushSave: () => Promise<unknown>;
  getCurrentState: () => ProductState | null;
  replaceAuthoritativeState: (state: ProductState) => void;
}

function canonicalActionForFeedback(feedback: ProductDecisionFeedback): {
  actionType: ProductTasteActionType | ProductStartedActionType;
  played?: boolean;
} | null {
  if (feedback === "play") return { actionType: "started" };
  if (feedback === "not_for_me" || feedback === "loved" || feedback === "liked") {
    return { actionType: feedback };
  }
  if (feedback === "played_loved") return { actionType: "loved", played: true };
  if (feedback === "played_liked") return { actionType: "liked", played: true };
  if (feedback === "played_mixed") return { actionType: "mixed", played: true };
  if (feedback === "played_dropped") return { actionType: "dropped", played: true };
  return null;
}

function operationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = (Math.random() * 16) | 0;
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function cacheRecommendationModel(response: ProductCanonicalDecisionResponse) {
  const entries = [
    response.recommendationModel.primary,
    ...response.recommendationModel.alternatives,
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  addRecommendationsToSessionCache(entries);
  addGamesToCache(entries.map((entry) => entry.game));
}

export function usePlayfitGameActions({
  state,
  updateState,
  updateUi,
  flushSave,
  getCurrentState,
  replaceAuthoritativeState,
}: UsePlayfitGameActionsProps) {
  const canonicalQueueRef = useRef<Promise<void>>(Promise.resolve());
  const canonicalInFlightRef = useRef(new Map<string, Promise<ProductTasteActionClientResult>>());

  const applyCanonicalUndo = useCallback(
    (
      targetOperationId: string,
      onUndo?: (result: ProductTasteActionClientResult) => void,
    ): Promise<ProductTasteActionClientResult> => {
      const inFlightKey = `undo:${targetOperationId}`;
      const duplicate = canonicalInFlightRef.current.get(inFlightKey);
      if (duplicate) return duplicate;

      const undoOperationId = operationId();
      const run = async (): Promise<ProductTasteActionClientResult> => {
        await flushSave();
        const currentState = getCurrentState();
        if (!currentState) {
          const result: ProductTasteActionClientResult = {
            ok: false,
            canonical: true,
            decisionSaved: false,
            error: "Profile unavailable",
          };
          onUndo?.(result);
          return result;
        }

        updateUi((current) => ({
          ...current,
          saveStatus: "saving",
          statusMessage: "Undoing…",
          undoAction: null,
        }));

        let response: Response;
        try {
          response = await authenticatedFetch("/api/decisions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              operationId: undoOperationId,
              expectedStateVersion: currentState.stateVersion,
              actionType: "undo_decision",
              targetOperationId,
            }),
          });
        } catch {
          const resynced = await loadProductStateOrNull().catch(() => null);
          if (resynced) replaceAuthoritativeState(resynced);
          const result: ProductTasteActionClientResult = {
            ok: false,
            canonical: true,
            decisionSaved: false,
            stateVersion: resynced?.stateVersion,
            state: resynced ?? undefined,
            error: "Failed to undo decision",
          };
          updateUi((current) => ({
            ...current,
            saveStatus: "error",
            statusMessage: "Couldn't undo that decision. Your latest saved state was restored.",
            undoAction: null,
          }));
          onUndo?.(result);
          return result;
        }

        const body = (await response.json().catch(() => ({}))) as Partial<
          ProductUndoDecisionResponse & {
            error: string;
            decisionSaved: boolean;
            conflict: boolean;
          }
        >;

        if (response.ok) {
          const authoritative = body as ProductUndoDecisionResponse;
          replaceAuthoritativeState(authoritative.state);
          cacheRecommendationModel(authoritative);
          const result: ProductTasteActionClientResult = {
            ok: true,
            canonical: true,
            response: authoritative,
          };
          updateUi((current) => ({
            ...current,
            saveStatus: "saved",
            statusMessage: "Undone.",
            undoAction: null,
          }));
          onUndo?.(result);
          return result;
        }

        const resynced = body.state ?? (await loadProductStateOrNull().catch(() => null));
        if (resynced) replaceAuthoritativeState(resynced);
        const result: ProductTasteActionClientResult = {
          ok: false,
          canonical: true,
          decisionSaved: body.decisionSaved === true,
          stateVersion: resynced?.stateVersion ?? body.stateVersion,
          state: resynced ?? undefined,
          error: body.error ?? "Failed to undo decision",
          conflict: body.conflict,
        };
        updateUi((current) => ({
          ...current,
          saveStatus: "error",
          statusMessage: body.conflict
            ? "Your profile changed after that decision, so it could not be undone."
            : "Couldn't undo that decision. Your latest saved state was restored.",
          undoAction: null,
        }));
        onUndo?.(result);
        return result;
      };

      const task = canonicalQueueRef.current.catch(() => undefined).then(run);
      canonicalQueueRef.current = task.then(
        () => undefined,
        () => undefined,
      );
      canonicalInFlightRef.current.set(inFlightKey, task);
      void task.finally(() => {
        if (canonicalInFlightRef.current.get(inFlightKey) === task) {
          canonicalInFlightRef.current.delete(inFlightKey);
        }
      });
      return task;
    },
    [flushSave, getCurrentState, replaceAuthoritativeState, updateUi],
  );
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
      const canonicalAction = canonicalActionForFeedback(feedback);
      if (canonicalAction) {
        const inFlightKey = `${gameId}:${canonicalAction.actionType}:${canonicalAction.played ?? false}`;
        const duplicate = canonicalInFlightRef.current.get(inFlightKey);
        if (duplicate) return duplicate;

        const requestOperationId = operationId();
        const run = async (): Promise<ProductTasteActionClientResult> => {
          await flushSave();
          const currentState = getCurrentState();
          if (!currentState) {
            return {
              ok: false,
              canonical: true,
              decisionSaved: false,
              error: "Profile unavailable",
            };
          }

          updateUi((current) => ({
            ...current,
            saveStatus: "saving",
            statusMessage: "Saving your taste signal…",
            undoAction: null,
          }));

          let response: Response;
          try {
            response = await authenticatedFetch("/api/decisions", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                operationId: requestOperationId,
                expectedStateVersion: currentState.stateVersion,
                actionType: canonicalAction.actionType,
                gameId,
                played: canonicalAction.played,
              }),
            });
          } catch {
            updateUi((current) => ({
              ...current,
              saveStatus: "error",
              statusMessage:
                "Couldn't save that decision. Your previous recommendation is unchanged.",
            }));
            return {
              ok: false,
              canonical: true,
              decisionSaved: false,
              error: "Failed to save decision",
            };
          }

          const body = (await response.json().catch(() => ({}))) as Partial<
            ProductTasteActionResponse & {
              error: string;
              decisionSaved: boolean;
              conflict: boolean;
            }
          >;

          if (response.ok) {
            const authoritative = body as ProductTasteActionResponse;
            replaceAuthoritativeState(authoritative.state);
            cacheRecommendationModel(authoritative);
            updateUi((current) => ({
              ...current,
              saveStatus: "saved",
              statusMessage: productDecisionFeedbackMessages[feedback],
              undoAction: () => {
                void applyCanonicalUndo(requestOperationId, onUndo);
              },
            }));
            return { ok: true, canonical: true, response: authoritative };
          }

          if (body.decisionSaved && body.state && body.stateVersion) {
            replaceAuthoritativeState(body.state);
            updateUi((current) => ({
              ...current,
              saveStatus: "error",
              statusMessage:
                "Your decision was saved, but Play Next could not refresh. Try again shortly.",
              undoAction: null,
            }));
            return {
              ok: false,
              canonical: true,
              decisionSaved: true,
              stateVersion: body.stateVersion,
              state: body.state,
              gameState: body.gameState,
              profile: body.profile,
              error: body.error ?? "Recommendation refresh failed",
            };
          }

          updateUi((current) => ({
            ...current,
            saveStatus: "error",
            statusMessage: body.conflict
              ? "Your profile changed in another session. Reload before trying again."
              : "Couldn't save that decision. Your previous recommendation is unchanged.",
            undoAction: null,
          }));
          return {
            ok: false,
            canonical: true,
            decisionSaved: false,
            error: body.error ?? "Failed to save decision",
            conflict: body.conflict,
          };
        };

        const task = canonicalQueueRef.current.catch(() => undefined).then(run);
        canonicalQueueRef.current = task.then(
          () => undefined,
          () => undefined,
        );
        canonicalInFlightRef.current.set(inFlightKey, task);
        void task.finally(() => {
          if (canonicalInFlightRef.current.get(inFlightKey) === task) {
            canonicalInFlightRef.current.delete(inFlightKey);
          }
        });
        return task;
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
    [
      state,
      updateState,
      updateUi,
      flushSave,
      getCurrentState,
      replaceAuthoritativeState,
      applyCanonicalUndo,
    ],
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
