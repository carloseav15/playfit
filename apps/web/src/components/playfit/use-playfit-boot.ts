import { loadProductState } from "@playfit/core/store";
import type { ProductPlatformOption, ProductProfile, ProductState } from "@playfit/core/types";
import { useEffect, useState } from "react";
import { getErrorMessage } from "@/lib/api-errors";
import { clearGameCache, ensureGamesCached } from "@/lib/game-cache";
import type { ProductUiState } from "./playfit-context-types";
import { initialUi, withDefaultPlatforms } from "./playfit-provider-helpers";
import { buildAdaptiveProfileFromCache } from "./profile-cache-helpers";
import type { AuthUser } from "./use-playfit-auth";

type EnqueueSave = (snapshot: ProductState, options?: { successMessage?: string }) => void;

export function usePlayfitBoot({
  authUser,
  useLocalProfile,
  platforms,
  enqueueSave,
  setState,
  setUi,
}: {
  authUser: AuthUser | null;
  useLocalProfile: boolean;
  platforms: ProductPlatformOption[];
  enqueueSave: EnqueueSave;
  setState: React.Dispatch<React.SetStateAction<ProductState | null>>;
  setUi: React.Dispatch<React.SetStateAction<ProductUiState | null>>;
}) {
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    if (!authUser && !useLocalProfile) return;
    let cancelled = false;

    async function boot() {
      try {
        const loadedState = withDefaultPlatforms(await loadProductState(), platforms);
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
              enqueueSave(restored);
              return;
            }
          } catch {
            // Fall through to local build.
          }

          const profile = buildAdaptiveProfileFromCache(
            loadedState.user.onboarding,
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
          enqueueSave(restored);
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
  }, [authUser, useLocalProfile, enqueueSave, platforms, setState, setUi]);

  return bootError;
}
