"use client";

import { authenticatedFetch } from "@playfit/core/store";
import type { ProductGameState, ProductProfile, RankedSeedGame } from "@playfit/core/types";
import { useEffect, useMemo, useRef, useState } from "react";
import { addGamesToCache } from "@/lib/game-cache";

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
  const [picks, setPicks] = useState<RankedSeedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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
      setPicks([]);
      setLoadError(null);
      setLoading(false);
      return;
    }

    const changed = serializedKey !== serializedRef.current;
    serializedRef.current = serializedKey;

    if (!changed && picks.length > 0) return;

    let cancelled = false;

    async function fetchPicks() {
      if (picks.length === 0) setLoading(true);
      setLoadError(null);

      try {
        const res = await authenticatedFetch("/api/recommendations/picks");
        if (!res.ok) throw new Error(errorMessage);
        const data = (await res.json()) as RankedSeedGame[];
        if (!cancelled) {
          addGamesToCache(data.map((p) => p.game));
          setPicks(data);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : errorMessage);
          setPicks([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchPicks();

    return () => {
      cancelled = true;
    };
  }, [enabled, profile, serializedKey, errorMessage, picks.length]);

  return { picks, loading, loadError };
}
