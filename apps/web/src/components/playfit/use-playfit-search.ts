import type { SeedGame } from "@playfit/core/types";
import { useCallback, useEffect, useRef, useState } from "react";
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
  // Guards retryOnboardingSearch() re-entrancy only. Set synchronously (before the
  // fetch's first await) so two rapid retry activations in the same tick can't both
  // pass the check -- a plain state read (onboardingSearchPending) can't do this
  // reliably, since state updates aren't visible until the next render. The normal
  // debounced query-change path below never reads this ref, so an in-flight retry can
  // never block the user from typing a new query and getting a fresh request for it.
  const retryRequestIdRef = useRef<number | null>(null);

  const runOnboardingSearch = useCallback((trimmed: string) => {
    const requestId = ++onboardingSearchRequestCounterRef.current;
    setOnboardingSearchPending(true);
    const task = (async () => {
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
    })();
    return { requestId, task };
  }, []);

  useEffect(() => {
    const trimmed = onboardingQuery?.trim();
    // Invalidate the previous query's generation the instant the query identity
    // changes -- synchronously, on every change, not only when the new query is
    // empty. This must happen before the 250ms debounce below even starts: if it
    // only happened once the new query's own request actually fired (as it
    // previously did), a response for the OLD query landing during that debounce
    // window would still carry a requestId equal to the still-unbumped counter and
    // would incorrectly commit into what is now query B's state. Bumping here closes
    // that window regardless of whether anything else ever starts for the new query.
    onboardingSearchRequestCounterRef.current += 1;
    // A query change (including clearing it) always supersedes any retry that was
    // in flight for the previous query -- that retry's own response, if it lands
    // later, is still discarded by the requestId check above, but it must no longer
    // be able to block a fresh retry click for the new query.
    retryRequestIdRef.current = null;
    if (!trimmed) {
      setOnboardingSearchResults([]);
      setOnboardingSearchError(null);
      setOnboardingSearchPending(false);
      return;
    }
    if (onboardingSearchTimerRef.current) clearTimeout(onboardingSearchTimerRef.current);
    setOnboardingSearchPending(true);
    onboardingSearchTimerRef.current = setTimeout(() => {
      runOnboardingSearch(trimmed);
    }, 250);
    return () => {
      if (onboardingSearchTimerRef.current) clearTimeout(onboardingSearchTimerRef.current);
    };
  }, [onboardingQuery, runOnboardingSearch]);

  const retryOnboardingSearch = useCallback(() => {
    if (retryRequestIdRef.current !== null) return;
    const trimmed = onboardingQuery?.trim();
    if (!trimmed) return;
    if (onboardingSearchTimerRef.current) clearTimeout(onboardingSearchTimerRef.current);
    const { requestId, task } = runOnboardingSearch(trimmed);
    retryRequestIdRef.current = requestId;
    void task.finally(() => {
      if (retryRequestIdRef.current === requestId) {
        retryRequestIdRef.current = null;
      }
    });
  }, [onboardingQuery, runOnboardingSearch]);

  return {
    onboardingSearchResults,
    onboardingSearchError,
    onboardingSearchPending,
    retryOnboardingSearch,
  };
}
