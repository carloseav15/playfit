import { type SaveStateResult, saveProductState } from "@playfit/core/store";
import type { ProductState } from "@playfit/core/types";
import { useCallback, useRef } from "react";
import { getOnboardingFlowHeaders, markOnboardingPhase } from "./onboarding-flow-tracing";
import type { ProductUiState } from "./playfit-context-types";
import type { AuthUser } from "./use-playfit-auth";

// Connectivity language ("check your connection", "back online") is reserved strictly for
// network_error -- the one case where the request never definitively reached the server, so
// whether it persisted is genuinely unknown. Every other reason means the server was reached
// and responded, so the outcome is known and the copy says so honestly instead of blaming the
// network. There is no reconnect-triggered retry queue, so no message may claim one exists.
export function describeSaveFailure(result: Extract<SaveStateResult, { ok: false }>): string {
  switch (result.reason) {
    case "network_error":
      return "Couldn't save. Check your connection and try again.";
    case "auth_expired":
      return "Your session expired. Sign in again to save changes.";
    case "conflict":
      // Matches the existing canonical-decision conflict copy (use-playfit-game-actions.ts)
      // for a consistent voice -- no new reconciliation behavior is introduced here.
      return "Your profile changed in another session. Reload before trying again.";
    case "rate_limited":
      return "Too many changes at once. Try again in a moment.";
    case "invalid_state":
      return "PlayFit couldn't save this change.";
    case "server_error":
    default:
      return "PlayFit couldn't save this right now. Please try again.";
  }
}

export function useQueuedProfileSave({
  setAuthUser,
  setUseLocalProfile,
  setUi,
  setIsSaving,
  onSavedStateVersion,
}: {
  setAuthUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  setUseLocalProfile: React.Dispatch<React.SetStateAction<boolean>>;
  setUi: React.Dispatch<React.SetStateAction<ProductUiState | null>>;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  onSavedStateVersion?: (stateVersion: string) => void;
}) {
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveSequenceRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSnapshotRef = useRef<ProductState | null>(null);
  const pendingOptionsRef = useRef<{ successMessage?: string }>({});
  const latestSavedVersionRef = useRef<string | null>(null);

  const doSave = useCallback(
    (
      snapshot: ProductState,
      options: { successMessage?: string } = {},
    ): Promise<SaveStateResult> => {
      const sequence = ++saveSequenceRef.current;
      setIsSaving(true);
      setUi((currentUi) => (currentUi ? { ...currentUi, saveStatus: "saving" } : currentUi));

      const task = saveQueueRef.current
        .catch(() => undefined)
        .then(async (): Promise<SaveStateResult> => {
          try {
            markOnboardingPhase("profile_save_start");
            const snapshotForSave = latestSavedVersionRef.current
              ? { ...snapshot, stateVersion: latestSavedVersionRef.current }
              : snapshot;
            const result = await saveProductState(snapshotForSave, {
              headers: getOnboardingFlowHeaders("profile_save"),
            });
            if (!result.ok && result.reason === "auth_expired") {
              markOnboardingPhase("profile_save_auth_expired");
              setAuthUser(null);
              setUseLocalProfile(false);
              if (sequence === saveSequenceRef.current) {
                setUi((currentUi) =>
                  currentUi
                    ? { ...currentUi, saveStatus: "error", statusMessage: describeSaveFailure(result) }
                    : currentUi,
                );
              }
              return result;
            }

            if (result.ok) {
              latestSavedVersionRef.current = result.stateVersion;
              onSavedStateVersion?.(result.stateVersion);
            }

            if (sequence !== saveSequenceRef.current) return result;

            if (!result.ok) {
              markOnboardingPhase("profile_save_error", {
                reason: result.reason,
                ...(result.status ? { status: result.status } : {}),
              });
              setUi((currentUi) =>
                currentUi
                  ? {
                      ...currentUi,
                      saveStatus: "error",
                      statusMessage: describeSaveFailure(result),
                    }
                  : currentUi,
              );
            } else {
              markOnboardingPhase("profile_save_success");
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
            return result;
          } catch {
            // saveProductState no longer throws for network failures -- it classifies them
            // as network_error internally. Reaching this block means something genuinely
            // unexpected happened before/around that call (e.g. localStorage unavailable in
            // getDeviceId). Not proven to be a connectivity issue, so it gets the same honest,
            // non-committal fallback as an unclassified server error rather than blaming the
            // network for something that isn't demonstrated to be a network problem.
            markOnboardingPhase("profile_save_exception");
            const fallback = {
              ok: false as const,
              reason: "server_error" as const,
              error: "Unexpected error while saving profile",
            };
            if (sequence !== saveSequenceRef.current) return fallback;
            setUi((currentUi) =>
              currentUi
                ? {
                    ...currentUi,
                    saveStatus: "error",
                    statusMessage: describeSaveFailure(fallback),
                  }
                : currentUi,
            );
            return fallback;
          } finally {
            if (sequence === saveSequenceRef.current) {
              setIsSaving(false);
            }
          }
        });

      saveQueueRef.current = task.then(
        () => undefined,
        () => undefined,
      );
      return task;
    },
    [setAuthUser, setUseLocalProfile, setUi, setIsSaving, onSavedStateVersion],
  );

  const enqueueSave = useCallback(
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

  const saveNow = useCallback(
    (snapshot: ProductState, options: { successMessage?: string } = {}) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      pendingSnapshotRef.current = null;
      pendingOptionsRef.current = {};
      return doSave(snapshot, options);
    },
    [doSave],
  );

  const flushSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const latest = pendingSnapshotRef.current;
    if (latest) {
      const latestOptions = pendingOptionsRef.current;
      pendingSnapshotRef.current = null;
      pendingOptionsRef.current = {};
      return doSave(latest, latestOptions);
    }
    return saveQueueRef.current.then(() => undefined);
  }, [doSave]);

  return { enqueueSave, flushSave, saveNow };
}
