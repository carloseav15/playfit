"use client";

import { authenticatedFetch } from "@playfit/core/store";
import type { ProductGameState, ProductProfile, RankedSeedGame } from "@playfit/core/types";
import { useEffect, useMemo, useRef } from "react";
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

  useEffect(() => {
    if (!enabled || !profile) {
      reset();
      return;
    }

    const changed = serializedKey !== serializedRef.current;
    serializedRef.current = serializedKey;

    if (!changed && picks.length > 0) return;

    void execute(
      async () => {
        const res = await authenticatedFetch("/api/recommendations/picks");
        if (!res.ok) throw new Error(errorMessage);
        return (await res.json()) as RankedSeedGame[];
      },
      { onSuccess: (data) => addGamesToCache(data.map((p) => p.game)) },
    );

    return () => {
      abandonInFlight();
    };
  }, [
    enabled,
    profile,
    serializedKey,
    errorMessage,
    picks.length,
    execute,
    reset,
    abandonInFlight,
  ]);

  return { picks, loading, loadError };
}
