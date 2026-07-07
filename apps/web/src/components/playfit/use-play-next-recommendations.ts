"use client";

import { authenticatedFetch } from "@playfit/core/store";
import type { ProductPlayNextModel, RankedSeedGame } from "@playfit/core/types";
import { useCallback, useEffect } from "react";
import { addGamesToCache } from "@/lib/game-cache";
import { addRecommendationsToSessionCache } from "./recommendation-cache";
import { useRecommendationFetch } from "./use-recommendation-fetch";

function cacheModel(model: ProductPlayNextModel) {
  const entries = [model.primary, ...model.alternatives].filter(
    (entry): entry is RankedSeedGame => entry !== null,
  );
  addRecommendationsToSessionCache(entries);
  addGamesToCache(entries.map((entry) => entry.game));
}

export function usePlayNextRecommendations({
  enabled,
  errorMessage,
  onNeedsResync,
}: {
  enabled: boolean;
  errorMessage: string;
  onNeedsResync?: () => void;
}) {
  const {
    data: model,
    refreshing,
    loadError,
    execute,
    reset,
  } = useRecommendationFetch<ProductPlayNextModel>(errorMessage);

  const fetchRecommendations = useCallback(
    ({ background = false }: { background?: boolean } = {}) => {
      if (!enabled) return Promise.resolve();

      return execute(
        async () => {
          const res = await authenticatedFetch("/api/recommendations/today", {
            method: "POST",
            headers: {
              "content-type": "application/json",
            },
          });

          const body = (await res.json()) as ProductPlayNextModel & { needsResync?: boolean };

          if (body.needsResync) {
            onNeedsResync?.();
            return null;
          }

          if (!res.ok) {
            throw new Error(errorMessage);
          }

          return body;
        },
        { background, keepStaleOnError: true, onSuccess: cacheModel },
      );
    },
    [enabled, errorMessage, onNeedsResync, execute],
  );

  useEffect(() => {
    if (!enabled) {
      reset();
      return;
    }

    void fetchRecommendations();
  }, [enabled, fetchRecommendations, reset]);

  const refreshRecommendations = useCallback(() => {
    void fetchRecommendations({ background: true });
  }, [fetchRecommendations]);

  const loading = enabled ? !model && !loadError : false;

  return { model, loading, refreshing, loadError, refreshRecommendations };
}
