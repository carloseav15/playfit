import { saveProductState } from "@playfit/core/store";
import type { ProductState } from "@playfit/core/types";
import { useCallback, useRef } from "react";
import type { ProductUiState } from "./playfit-context-types";
import type { AuthUser } from "./use-playfit-auth";

export function useQueuedProfileSave({
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
      doSave(latest, latestOptions);
    }
  }, [doSave]);

  return { enqueueSave, flushSave };
}
