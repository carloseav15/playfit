"use client";

import { authenticatedFetch } from "@playfit/core/store";
import type { ProductPlayNextModel, RankedSeedGame } from "@playfit/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
import { addGamesToCache } from "@/lib/game-cache";
import { addRecommendationsToSessionCache } from "./recommendation-cache";

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
}: {
  enabled: boolean;
  errorMessage: string;
}) {
  const [model, setModel] = useState<ProductPlayNextModel | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const modelRef = useRef<ProductPlayNextModel | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const fetchRecommendations = useCallback(
    async ({ background = false }: { background?: boolean } = {}) => {
      if (!enabled) return;

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      const hasExistingModel = modelRef.current !== null;
      if (background && hasExistingModel) {
        setRefreshing(true);
      }
      setLoadError(null);

      try {
        const res = await authenticatedFetch("/api/recommendations/today", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
        });

        if (!res.ok) {
          throw new Error(errorMessage);
        }

        const data = (await res.json()) as ProductPlayNextModel;
        if (requestId === requestIdRef.current) {
          cacheModel(data);
          setModel(data);
        }
      } catch (error) {
        if (requestId === requestIdRef.current) {
          if (modelRef.current) {
            setLoadError(null);
          } else {
            setLoadError(error instanceof Error ? error.message : errorMessage);
            setModel(null);
          }
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setRefreshing(false);
        }
      }
    },
    [enabled, errorMessage],
  );

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      modelRef.current = null;
      setModel(null);
      setLoadError(null);
      setRefreshing(false);
      return;
    }

    void fetchRecommendations();
  }, [enabled, fetchRecommendations]);

  const refreshRecommendations = useCallback(() => {
    void fetchRecommendations({ background: true });
  }, [fetchRecommendations]);

  const loading = enabled ? !model && !loadError : false;

  return { model, loading, refreshing, loadError, refreshRecommendations };
}
