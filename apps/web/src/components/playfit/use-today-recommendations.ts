"use client";

import { authenticatedFetch } from "@playfit/core/store";
import type {
  ProductGameState,
  ProductOnboardingDraft,
  ProductProfile,
  ProductTodayModel,
} from "@playfit/core/types";
import { useEffect, useRef } from "react";
import { addGamesToCache } from "@/lib/game-cache";
import { useRecommendationFetch } from "./use-recommendation-fetch";

type TodayRecommendationCacheScope = "decision" | "picks";

function selectCacheGames(model: ProductTodayModel, cacheScope: TodayRecommendationCacheScope) {
  if (cacheScope === "picks") {
    return model.picks.map((entry) => entry.game);
  }

  return model.nextUp.map((entry) => entry.game);
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
  const {
    data: model,
    loading,
    loadError,
    execute,
    reset,
    abandonInFlight,
  } = useRecommendationFetch<ProductTodayModel>(errorMessage);

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
  const serializedOnboarding = JSON.stringify({
    platforms: onboarding.platforms.map((platform) => `${platform.platformId}:${platform.status}`),
    likedGameIds: onboarding.likedGameIds,
    dislikedGameIds: onboarding.dislikedGameIds ?? [],
  });

  useEffect(() => {
    if (!enabled || !profile) {
      reset();
      return;
    }

    const gameStateChanged = serializedGameStates !== serializedRef.current;
    serializedRef.current = serializedGameStates;

    const fetchRecommendations = () =>
      execute(
        async () => {
          const res = await authenticatedFetch("/api/recommendations/model", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-playfit-refresh-key": `${serializedGameStates.length}:${serializedOnboarding.length}`,
            },
          });

          if (!res.ok) {
            throw new Error(errorMessage);
          }

          return (await res.json()) as ProductTodayModel;
        },
        { onSuccess: (data) => addGamesToCache(selectCacheGames(data, cacheScope)) },
      );

    if (gameStateChanged) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fetchRecommendations, 300);
    } else {
      void fetchRecommendations();
    }

    return () => {
      abandonInFlight();
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [
    enabled,
    profile,
    serializedGameStates,
    serializedOnboarding,
    errorMessage,
    cacheScope,
    execute,
    reset,
    abandonInFlight,
  ]);

  return { model, loading, loadError };
}
