"use client";

import { authenticatedFetch, getCachedAuthUserId } from "@playfit/core/store";
import type { ProductGameState, ProductProfile, RankedSeedGame } from "@playfit/core/types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addGamesToCache } from "@/lib/game-cache";
import { cachePicks, getCachedPicks } from "./recommendation-cache";
import { useRecommendationFetch } from "./use-recommendation-fetch";

export function usePicksRecommendations({
  enabled,
  stateVersion,
  profile,
  gameStates,
  errorMessage,
}: {
  enabled: boolean;
  stateVersion: string;
  profile: ProductProfile | null | undefined;
  gameStates: Record<string, ProductGameState>;
  errorMessage: string;
}) {
  const userId = getCachedAuthUserId();
  const identity = JSON.stringify([userId, stateVersion]);
  const [dataIdentity, setDataIdentity] = useState(identity);
  const { data, loading, refreshing, loadError, execute, reset, abandonInFlight } =
    useRecommendationFetch<RankedSeedGame[]>(errorMessage, getCachedPicks(userId, stateVersion));
  const currentData = dataIdentity === identity ? data : null;
  const picks = currentData ?? [];
  const serializedRef = useRef("");

  const serializedKey = useMemo(() => {
    const keys = Object.keys(gameStates).sort();
    const parts = keys.map((id) => {
      const gs = gameStates[id];
      return `${id}:${gs.status ?? ""}:${gs.excluded ? "x" : ""}:${gs.inPlayfitPicks ? "p" : ""}:${gs.inWishlist ? "w" : ""}`;
    });
    return parts.join(",");
  }, [gameStates]);

  const runFetch = useCallback(() => {
    return execute(
      async () => {
        const res = await authenticatedFetch("/api/recommendations/picks");
        if (!res.ok) throw new Error(errorMessage);
        return (await res.json()) as RankedSeedGame[];
      },
      {
        background: dataIdentity === identity,
        keepStaleOnError: dataIdentity === identity,
        reportStaleError: true,
        onSuccess: (data) => {
          setDataIdentity(identity);
          cachePicks(userId, stateVersion, data);
          addGamesToCache(data.map((p) => p.game));
        },
      },
    );
  }, [errorMessage, execute, identity, dataIdentity, userId, stateVersion]);

  useEffect(() => {
    if (!enabled || !profile) {
      reset();
      return;
    }

    const changed = serializedKey !== serializedRef.current;
    serializedRef.current = serializedKey;

    if (!changed && picks.length > 0 && dataIdentity === identity) return;

    void runFetch();

    return () => {
      abandonInFlight();
    };
  }, [
    enabled,
    profile,
    serializedKey,
    picks.length,
    runFetch,
    reset,
    abandonInFlight,
    dataIdentity,
    identity,
  ]);

  const retry = useCallback(() => {
    if (!enabled || !profile) return Promise.resolve();
    return runFetch();
  }, [enabled, profile, runFetch]);

  return {
    picks,
    loading: loading || (enabled && !currentData && !loadError),
    refreshing,
    loadError,
    retry,
  };
}
