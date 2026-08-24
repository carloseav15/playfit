"use client";

import { authenticatedFetch, getCachedAuthUserId } from "@playfit/core/store";
import type { ProductPlayNextModel, RankedSeedGame } from "@playfit/core/types";
import { useCallback, useEffect, useRef } from "react";
import { addGamesToCache } from "@/lib/game-cache";
import { getOnboardingFlowHeaders, markOnboardingPhase } from "./onboarding-flow-tracing";
import {
  addRecommendationsToSessionCache,
  clearLastPlayNextModel,
  getLastPlayNextModel,
  setLastPlayNextModel,
} from "./recommendation-cache";
import { useRecommendationFetch } from "./use-recommendation-fetch";

function cacheModel(userId: string | null, model: ProductPlayNextModel) {
  const entries = [model.primary, ...model.alternatives].filter(
    (entry): entry is RankedSeedGame => entry !== null,
  );
  addRecommendationsToSessionCache(entries);
  addGamesToCache(entries.map((entry) => entry.game));
  // Never cache under a null/unresolved identity -- that would let a later, unrelated
  // read (also unresolved at that moment) accidentally match it.
  if (userId) setLastPlayNextModel(userId, model);
}

export function usePlayNextRecommendations({
  enabled,
  stateVersion,
  errorMessage,
  onNeedsResync,
}: {
  enabled: boolean;
  // The current authoritative stateVersion from PlayfitProvider, which persists across
  // route navigation and is already up to date by the time DecisionShell remounts -- this
  // is what makes it possible to validate a cached model *before* any network round trip,
  // not just eventually via a background refresh.
  stateVersion: string;
  errorMessage: string;
  onNeedsResync?: () => void;
}) {
  const onNeedsResyncRef = useRef(onNeedsResync);

  useEffect(() => {
    onNeedsResyncRef.current = onNeedsResync;
  }, [onNeedsResync]);

  const userId = getCachedAuthUserId();

  // Seeding from the module-scope cache means a DecisionShell remount after client-side
  // navigation (Play Next -> another section -> back) can start from the last good model
  // instead of nothing, so keepStaleOnError below has real data to protect if the returning
  // fetch fails. getLastPlayNextModel only returns a hit when it's proven to belong to this
  // exact user and this exact canonical stateVersion (see recommendation-cache.ts) -- if
  // canonical state advanced while we were away, or this is a different account, it returns
  // null and this behaves exactly like a genuinely first-ever load, which is exactly the
  // case the retry further down exists for. This is what stops a stateVersion-7 model from
  // ever being rendered once canonical state has moved on to stateVersion 12: the check
  // happens synchronously against state PlayfitProvider already has, before any fetch, not
  // after get_profile eventually comes back.
  const seed = userId ? getLastPlayNextModel(userId, stateVersion) : null;

  const {
    data: model,
    refreshing,
    loadError,
    execute,
    reset,
  } = useRecommendationFetch<ProductPlayNextModel>(errorMessage, seed);

  const fetchRecommendations = useCallback(
    ({ background = false }: { background?: boolean } = {}) => {
      if (!enabled) return Promise.resolve();

      const requestOnce = async () => {
        markOnboardingPhase("recommendation_request_start");
        const res = await authenticatedFetch("/api/recommendations/today", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...getOnboardingFlowHeaders("recommendation_fetch"),
          },
        });
        markOnboardingPhase("recommendation_response", { status: res.status });

        const body = (await res.json()) as ProductPlayNextModel & { needsResync?: boolean };

        if (body.needsResync) {
          markOnboardingPhase("recommendation_needs_resync");
          onNeedsResyncRef.current?.();
          return null;
        }

        if (!res.ok) {
          markOnboardingPhase("recommendation_error", { status: res.status });
          throw new Error(errorMessage);
        }

        markOnboardingPhase("recommendation_success");

        return body;
      };

      return execute(
        async () => {
          try {
            return await requestOnce();
          } catch (error) {
            // Scoring a state_version that's never been cached (onboarding completion, or
            // any decision that bumps stateVersion) can occasionally hit a cold-start timeout
            // server-side. When there's no valid seed for the current user+stateVersion --
            // a genuinely first-ever load, or canonical state advanced while we were away --
            // a single immediate retry avoids stranding the user on a dead-end error where a
            // manual reload was the only way to recover. Background refreshes, and any
            // foreground fetch that *did* find a valid same-version seed above, already have
            // something real to keep showing on failure via keepStaleOnError, so they don't
            // need this.
            if (background) throw error;
            return await requestOnce();
          }
        },
        { background, keepStaleOnError: true, onSuccess: (result) => cacheModel(userId, result) },
      );
    },
    [enabled, errorMessage, execute, userId],
  );

  useEffect(() => {
    if (!enabled) {
      reset();
      // Guards against a different account, signed in within the same tab without a full
      // reload, seeding itself with the previous account's recommendations on next mount.
      clearLastPlayNextModel();
      return;
    }

    void fetchRecommendations();
  }, [enabled, fetchRecommendations, reset]);

  const refreshRecommendations = useCallback(() => {
    return fetchRecommendations({ background: true });
  }, [fetchRecommendations]);

  const loading = enabled ? !model && !loadError : false;

  return { model, loading, refreshing, loadError, refreshRecommendations };
}
