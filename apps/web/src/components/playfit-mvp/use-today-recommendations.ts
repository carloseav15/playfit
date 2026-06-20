"use client";

import type {
  ProductGameState,
  ProductOnboardingDraft,
  ProductProfile,
  ProductTodayModel,
} from "@playfit/core/types";
import { useEffect, useRef, useState } from "react";
import { addGamesToCache } from "@/lib/game-cache";

type TodayRecommendationCacheScope = "decision" | "picks";

function selectCacheGames(model: ProductTodayModel, cacheScope: TodayRecommendationCacheScope) {
  if (cacheScope === "picks") {
    return model.picks.map((entry) => entry.game);
  }

  return [...model.nextUp, ...model.resume, ...model.currentRun].map((entry) => entry.game);
}

export function useTodayRecommendations({
  enabled,
  profile,
  gameStates,
  onboarding,
  errorMessage,
  cacheScope,
}: {
  enabled: boolean;
  profile: ProductProfile | null | undefined;
  gameStates: Record<string, ProductGameState>;
  onboarding: ProductOnboardingDraft;
  errorMessage: string;
  cacheScope: TodayRecommendationCacheScope;
}) {
  const [model, setModel] = useState<ProductTodayModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const gameStatesRef = useRef(gameStates);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serializedRef = useRef("");

  const serializedGameStates = (() => {
    const keys = Object.keys(gameStates).sort();
    const parts = keys.map((id) => {
      const gs = gameStates[id];
      return `${id}:${gs.status ?? ""}:${gs.excluded ? "x" : ""}:${gs.inWishlist ? "w" : ""}:${gs.inPlayfitPicks ? "p" : ""}`;
    });
    return parts.join(",");
  })();

  useEffect(() => {
    gameStatesRef.current = gameStates;
  }, [gameStates]);

  useEffect(() => {
    if (!enabled || !profile) {
      setModel(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    const gameStateChanged = serializedGameStates !== serializedRef.current;
    serializedRef.current = serializedGameStates;

    let cancelled = false;

    async function fetchRecommendations() {
      setLoading(true);
      setLoadError(null);

      try {
        const res = await fetch("/api/recommendations/today", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile,
            gameStates: gameStatesRef.current,
            onboarding,
          }),
        });

        if (!res.ok) {
          throw new Error(errorMessage);
        }

        const data = (await res.json()) as ProductTodayModel;

        if (!cancelled) {
          addGamesToCache(selectCacheGames(data, cacheScope));
          setModel(data);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : errorMessage);
          setModel(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (gameStateChanged) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fetchRecommendations, 300);
    } else {
      void fetchRecommendations();
    }

    return () => {
      cancelled = true;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [enabled, profile, serializedGameStates, onboarding, errorMessage, cacheScope]);

  return { model, loading, loadError };
}
