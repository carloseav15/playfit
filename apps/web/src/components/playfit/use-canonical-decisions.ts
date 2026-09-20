import { productDecisionFeedbackMessages } from "@playfit/core/domain";
import { authenticatedFetch, loadProductStateOrNull } from "@playfit/core/store";
import type {
  ProductCanonicalDecisionResponse,
  ProductDecisionFeedback,
  ProductStartedActionType,
  ProductState,
  ProductTasteActionClientResult,
  ProductTasteActionResponse,
  ProductTasteActionType,
  ProductUndoDecisionResponse,
} from "@playfit/core/types";
import { useCallback, useRef } from "react";
import { addGamesToCache } from "@/lib/game-cache";
import type { ProductUiState } from "./playfit-context-types";
import { addRecommendationsToSessionCache } from "./recommendation-cache";

interface CanonicalDecisionDependencies {
  updateUi: React.Dispatch<React.SetStateAction<ProductUiState>>;
  flushSave: () => Promise<unknown>;
  getCurrentState: () => ProductState | null;
  replaceAuthoritativeState: (state: ProductState) => void;
}

export function canonicalActionForFeedback(feedback: ProductDecisionFeedback): {
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

export function useCanonicalDecisions({
  updateUi,
  flushSave,
  getCurrentState,
  replaceAuthoritativeState,
}: CanonicalDecisionDependencies) {
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
  const applyCanonicalFeedback = useCallback(
    (
      gameId: string,
      feedback: ProductDecisionFeedback,
      onUndo?: (result: ProductTasteActionClientResult) => void,
    ): Promise<ProductTasteActionClientResult> => {
      const canonicalAction = canonicalActionForFeedback(feedback);
      if (!canonicalAction) throw new Error("Unsupported canonical feedback");
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
    },
    [flushSave, getCurrentState, replaceAuthoritativeState, updateUi, applyCanonicalUndo],
  );
  return { applyCanonicalFeedback };
}
