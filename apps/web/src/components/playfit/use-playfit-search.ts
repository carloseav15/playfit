import type { SeedGame } from "@playfit/core/types";
import { useEffect, useRef, useState } from "react";
import { addGamesToCache } from "@/lib/game-cache";

interface UsePlayfitSearchProps {
  onboardingQuery?: string;
}

export function usePlayfitSearch({ onboardingQuery }: UsePlayfitSearchProps) {
  const [onboardingSearchResults, setOnboardingSearchResults] = useState<SeedGame[]>([]);
  const [onboardingSearchError, setOnboardingSearchError] = useState<string | null>(null);
  const [onboardingSearchPending, setOnboardingSearchPending] = useState(false);

  const onboardingSearchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onboardingSearchRequestCounterRef = useRef(0);

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
    onboardingSearchResults,
    onboardingSearchError,
    onboardingSearchPending,
  };
}
