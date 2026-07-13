"use client";

import type { SeedGame } from "@playfit/core/types";
import { useEffect, useRef, useState } from "react";

export interface GameSearchFilters {
  platform?: string[];
  genre?: string;
}

interface UseGameSearchParams {
  query: string;
  filters?: GameSearchFilters;
  page?: number;
  pageSize?: number;
}

interface UseGameSearchResult {
  results: SeedGame[];
  total: number;
  pending: boolean;
  error: string | null;
  // The page these results actually answer -- lets a consumer accumulating pages
  // (e.g. "Load more") tell a real page-N delivery apart from a stale prior-page
  // results array that hasn't been refetched yet after `page` just changed.
  resolvedPage: number;
}

function buildSearchUrl(
  query: string,
  platformKey: string,
  genreKey: string,
  page?: number,
  pageSize?: number,
): string {
  const params = new URLSearchParams();
  if (query.trim()) params.set("q", query.trim());
  if (platformKey) params.set("platform", platformKey);
  if (genreKey) params.set("genre", genreKey);
  if (page) params.set("page", String(page));
  if (pageSize) params.set("pageSize", String(pageSize));
  return `/api/games?${params.toString()}`;
}

// Standalone from use-playfit-search.ts (reuses its debounce + request-id-race-guard
// pattern) because that hook is tightly coupled to PlayfitContext state that only
// exists inside PlayfitProvider -- /search deliberately lives outside it.
export function useGameSearch({
  query,
  filters,
  page = 1,
  pageSize,
}: UseGameSearchParams): UseGameSearchResult {
  const [results, setResults] = useState<SeedGame[]>([]);
  const [total, setTotal] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolvedPage, setResolvedPage] = useState(page);

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const requestCounterRef = useRef(0);

  const platformKey = filters?.platform?.join(",") ?? "";
  const genreKey = filters?.genre ?? "";

  useEffect(() => {
    const requestId = ++requestCounterRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    setPending(true);

    timerRef.current = setTimeout(async () => {
      try {
        const url = buildSearchUrl(query, platformKey, genreKey, page, pageSize);
        const res = await fetch(url);
        if (!res.ok) {
          if (requestId !== requestCounterRef.current) return;
          setError("Search could not load. Try again.");
          setResults([]);
          setTotal(0);
          setResolvedPage(page);
          setPending(false);
          return;
        }
        const data = (await res.json()) as { games: SeedGame[]; total: number };
        if (requestId !== requestCounterRef.current) return;
        setError(null);
        setResults(data.games);
        setTotal(data.total);
        setResolvedPage(page);
        setPending(false);
      } catch {
        if (requestId !== requestCounterRef.current) return;
        setError("Search could not load. Try again.");
        setResults([]);
        setTotal(0);
        setResolvedPage(page);
        setPending(false);
      }
    }, 250);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, platformKey, genreKey, page, pageSize]);

  return { results, total, pending, error, resolvedPage };
}
