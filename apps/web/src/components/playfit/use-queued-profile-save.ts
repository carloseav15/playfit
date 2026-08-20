import { type SaveStateResult, saveProductState } from "@playfit/core/store";
import type { ProductState } from "@playfit/core/types";
import { nowIso } from "@playfit/core/utils";
import { useCallback, useRef } from "react";
import { getOnboardingFlowHeaders, markOnboardingPhase } from "./onboarding-flow-tracing";
import type { ProductUiState } from "./playfit-context-types";
import { cloneState } from "./playfit-provider-helpers";
import { applyProfileMutationPatch, type ProfileMutationPatch } from "./profile-mutation-patch";
import type { AuthUser } from "./use-playfit-auth";

export type { ProfileMutationPatch } from "./profile-mutation-patch";

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
  getCurrentState,
  setAuthUser,
  setUseLocalProfile,
  setUi,
  setIsSaving,
  onSavedStateVersion,
}: {
  // The single authoritative source of truth (PlayfitProvider's stateRef), read fresh at the
  // moment a save actually goes out -- not whatever was current when the user acted. This is
  // what lets a queued Pick edit see a canonical decision that landed during the debounce.
  // Critically, this state already reflects every prior optimistic local edit too -- nothing
  // is rolled back on a failed save (see doSave) -- so a failed patch's data is never lost, it
  // just rides along in whatever state the *next* successful save happens to submit.
  getCurrentState: () => ProductState | null;
  setAuthUser: React.Dispatch<React.SetStateAction<AuthUser | null>>;
  setUseLocalProfile: React.Dispatch<React.SetStateAction<boolean>>;
  setUi: React.Dispatch<React.SetStateAction<ProductUiState | null>>;
  setIsSaving: React.Dispatch<React.SetStateAction<boolean>>;
  onSavedStateVersion?: (stateVersion: string) => void;
}) {
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const saveSequenceRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchesRef = useRef<ProfileMutationPatch[]>([]);
  const pendingOptionsRef = useRef<{ successMessage?: string }>({});

  const doSave = useCallback(
    (
      patches: ProfileMutationPatch[],
      options: { successMessage?: string } = {},
    ): Promise<SaveStateResult> => {
      const sequence = ++saveSequenceRef.current;
      setIsSaving(true);
      setUi((currentUi) => (currentUi ? { ...currentUi, saveStatus: "saving" } : currentUi));

      // Calls are chained through saveQueueRef, so this work only starts once any prior
      // in-flight save has fully resolved -- a save enqueued while another is in flight is
      // never dropped or reordered ahead of it, and it naturally rebuilds from whatever
      // authoritative state the prior save's own result (success or failure) left behind.
      const task = saveQueueRef.current
        .catch(() => undefined)
        .then(async (): Promise<SaveStateResult> => {
          try {
            markOnboardingPhase("profile_save_start");

            // Reconstructed here, not earlier: this is the one moment that matters. Every
            // patch is a plain value assignment applied onto whatever is authoritative
            // *right now* -- including any canonical decision that landed during the
            // debounce -- so the outgoing stateVersion and payload are never older than what
            // this client already knows, and nothing canonical gets clobbered by a stale
            // replay. Because patches carry only already-decided values (never re-executed
            // logic), applying them here can never double-apply a relative mutation, however
            // many times a patch is (re)applied.
            const current = getCurrentState();
            if (!current) {
              const fallback = {
                ok: false as const,
                reason: "invalid_state" as const,
                error: "Profile unavailable",
              };
              if (sequence === saveSequenceRef.current) {
                setUi((currentUi) =>
                  currentUi
                    ? {
                        ...currentUi,
                        saveStatus: "error",
                        statusMessage: describeSaveFailure(fallback),
                      }
                    : currentUi,
                );
              }
              return fallback;
            }

            const next = cloneState(current);
            for (const patch of patches) applyProfileMutationPatch(next, patch);
            next.user.lastUpdatedAt = nowIso();

            const result = await saveProductState(next, {
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
              onSavedStateVersion?.(result.stateVersion);
            }

            if (sequence !== saveSequenceRef.current) return result;

            if (!result.ok) {
              // A conflict here means canonical state advanced beyond what getCurrentState()
              // returned *at send time* -- i.e. a genuine concurrent write this client hasn't
              // observed yet (another session/device). It is intentionally not retried: the
              // payload above was already built from the freshest state this client had, so
              // retrying blind risks the same overwrite risk this design exists to prevent.
              // Note the drained patches are not lost even so: stateRef/PlayfitProvider was
              // never rolled back, so this save's intended changes are still present locally
              // and will ride along in whatever save succeeds next.
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
    [getCurrentState, setAuthUser, setUseLocalProfile, setUi, setIsSaving, onSavedStateVersion],
  );

  const enqueueSave = useCallback(
    (patch: ProfileMutationPatch, options: { successMessage?: string } = {}) => {
      // Patches accumulate rather than replace each other, so several edits made within one
      // debounce window (e.g. add pick, remove pick, add a different pick) all apply in order
      // onto the fresh state at send time -- last-write-wins per field, the same end result as
      // if each had been applied immediately, just deferred.
      pendingPatchesRef.current.push(patch);
      pendingOptionsRef.current = options;

      setIsSaving(true);
      setUi((currentUi) => (currentUi ? { ...currentUi, saveStatus: "saving" } : currentUi));

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        const queued = pendingPatchesRef.current;
        const queuedOptions = pendingOptionsRef.current;
        pendingPatchesRef.current = [];
        pendingOptionsRef.current = {};
        if (queued.length > 0) {
          doSave(queued, queuedOptions);
        }
      }, 1000);
    },
    [doSave, setIsSaving, setUi],
  );

  const saveNow = useCallback(
    (patch: ProfileMutationPatch, options: { successMessage?: string } = {}) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      const queued = pendingPatchesRef.current;
      pendingPatchesRef.current = [];
      pendingOptionsRef.current = {};
      return doSave([...queued, patch], options);
    },
    [doSave],
  );

  const flushSave = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const queued = pendingPatchesRef.current;
    if (queued.length > 0) {
      const queuedOptions = pendingOptionsRef.current;
      pendingPatchesRef.current = [];
      pendingOptionsRef.current = {};
      return doSave(queued, queuedOptions);
    }
    return saveQueueRef.current.then(() => undefined);
  }, [doSave]);

  return { enqueueSave, flushSave, saveNow };
}
