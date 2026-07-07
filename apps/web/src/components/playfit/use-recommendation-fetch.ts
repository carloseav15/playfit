"use client";

import { useCallback, useRef, useState } from "react";
import { getErrorMessage } from "@/lib/api-errors";

export function useRecommendationFetch<T>(errorMessage: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const dataRef = useRef<T | null>(null);
  const requestIdRef = useRef(0);

  const execute = useCallback(
    async (
      fetcher: () => Promise<T | null>,
      options: {
        background?: boolean;
        keepStaleOnError?: boolean;
        onSuccess?: (data: T) => void;
      } = {},
    ) => {
      const requestId = ++requestIdRef.current;
      const hasExisting = dataRef.current !== null;
      if (options.background && hasExisting) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setLoadError(null);

      try {
        const result = await fetcher();
        if (requestId !== requestIdRef.current) return;
        if (result === null) return;
        dataRef.current = result;
        setData(result);
        options.onSuccess?.(result);
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        if (options.keepStaleOnError && dataRef.current) {
          setLoadError(null);
        } else {
          dataRef.current = null;
          setData(null);
          setLoadError(getErrorMessage(error, errorMessage));
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [errorMessage],
  );

  const reset = useCallback(() => {
    requestIdRef.current += 1;
    dataRef.current = null;
    setData(null);
    setLoadError(null);
    setLoading(false);
    setRefreshing(false);
  }, []);

  const abandonInFlight = useCallback(() => {
    requestIdRef.current += 1;
  }, []);

  return { data, loading, refreshing, loadError, execute, reset, abandonInFlight };
}
