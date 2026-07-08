import type { SeedGame } from "@playfit/core/types";
import { useEffect, useRef, useState } from "react";
import { addGamesToCache } from "@/lib/game-cache";

interface UsePlayfitSearchProps {
  finderQuery?: string;
  onboardingQuery?: string;
}

export function usePlayfitSearch({ finderQuery, onboardingQuery }: UsePlayfitSearchProps) {
  const [searchResults, setSearchResults] = useState<SeedGame[]>([]);
  const [onboardingSearchResults, setOnboardingSearchResults] = useState<SeedGame[]>([]);
  const [finderSearchError, setFinderSearchError] = useState<string | null>(null);
  const [onboardingSearchError, setOnboardingSearchError] = useState<string | null>(null);
  const [onboardingSearchPending, setOnboardingSearchPending] = useState(false);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onboardingSearchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const searchRequestCounterRef = useRef(0);
  const onboardingSearchRequestCounterRef = useRef(0);

  // Debounced search for FinderSection
  useEffect(() => {
    const trimmed = finderQuery?.trim();
    if (!trimmed) {
      setSearchResults([]);
      setFinderSearchError(null);
      return;
    }
    const requestId = ++searchRequestCounterRef.current;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/games?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          if (requestId !== searchRequestCounterRef.current) return;
          setFinderSearchError("Search could not load. Try again.");
          setSearchResults([]);
          return;
        }
        const data = (await res.json()) as { games: SeedGame[] };
        if (requestId !== searchRequestCounterRef.current) return;
        setFinderSearchError(null);
        addGamesToCache(data.games);
        setSearchResults(data.games);
      } catch {
        if (requestId !== searchRequestCounterRef.current) return;
        setFinderSearchError("Search could not load. Try again.");
        setSearchResults([]);
      }
    }, 250);
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [finderQuery]);

  // Debounced search for OnboardingSection
  useEffect(() => {
    const trimmed = onboardingQuery?.trim();
    if (!trimmed) {
      setOnboardingSearchResults([]);
      setOnboardingSearchError(null);
      setOnboardingSearchPending(false);
      return;
    }
    const requestId = ++onboardingSearchRequestCounterRef.current;
    if (onboardingSearchTimerRef.current) clearTimeout(onboardingSearchTimerRef.current);
    setOnboardingSearchPending(true);
    onboardingSearchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/games?q=${encodeURIComponent(trimmed)}`);
        if (!res.ok) {
          if (requestId !== onboardingSearchRequestCounterRef.current) return;
          setOnboardingSearchError("Search could not load. Try again.");
          setOnboardingSearchResults([]);
          setOnboardingSearchPending(false);
          return;
        }
        const data = (await res.json()) as { games: SeedGame[] };
        if (requestId !== onboardingSearchRequestCounterRef.current) return;
        setOnboardingSearchError(null);
        addGamesToCache(data.games);
        setOnboardingSearchResults(data.games);
        setOnboardingSearchPending(false);
      } catch {
        if (requestId !== onboardingSearchRequestCounterRef.current) return;
        setOnboardingSearchError("Search could not load. Try again.");
        setOnboardingSearchResults([]);
        setOnboardingSearchPending(false);
      }
    }, 250);
    return () => {
      if (onboardingSearchTimerRef.current) clearTimeout(onboardingSearchTimerRef.current);
    };
  }, [onboardingQuery]);

  return {
    searchResults,
    onboardingSearchResults,
    finderSearchError,
    onboardingSearchError,
    onboardingSearchPending,
  };
}
