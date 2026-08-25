"use client";

import { authenticatedFetch } from "@playfit/core/store";
import type { ProductGameState, ProductProfile, RankedSeedGame } from "@playfit/core/types";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { addGamesToCache } from "@/lib/game-cache";
import { useRecommendationFetch } from "./use-recommendation-fetch";

export function usePicksRecommendations({
  enabled,
  profile,
  gameStates,
  errorMessage,
}: {
  enabled: boolean;
  profile: ProductProfile | null | undefined;
  gameStates: Record<string, ProductGameState>;
  errorMessage: string;
}) {
  const { data, loading, loadError, execute, reset, abandonInFlight } =
    useRecommendationFetch<RankedSeedGame[]>(errorMessage);
  const picks = data ?? [];
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
      { onSuccess: (data) => addGamesToCache(data.map((p) => p.game)) },
    );
  }, [errorMessage, execute]);

  useEffect(() => {
    if (!enabled || !profile) {
      reset();
      return;
    }

    const changed = serializedKey !== serializedRef.current;
    serializedRef.current = serializedKey;

    if (!changed && picks.length > 0) return;

    void runFetch();

    return () => {
      abandonInFlight();
    };
  }, [enabled, profile, serializedKey, picks.length, runFetch, reset, abandonInFlight]);

  const retry = useCallback(() => {
    if (!enabled || !profile) return Promise.resolve();
    return runFetch();
  }, [enabled, profile, runFetch]);

  return { picks, loading, loadError, retry };
}
