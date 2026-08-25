import type { SeedGame } from "@playfit/core/types";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePlayfitSearch } from "./use-playfit-search";

const mocks = vi.hoisted(() => ({
  addGamesToCache: vi.fn(),
}));

vi.mock("@/lib/game-cache", () => ({
  addGamesToCache: mocks.addGamesToCache,
}));

function game(gameId: string, title = gameId): SeedGame {
  return {
    gameId,
    title,
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre: "action",
    tags: [],
    notes: "",
    coverPath: "",
    availablePlatformIds: [],
    availablePlatformNames: [],
    releaseState: "released",
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function jsonResponse(games: SeedGame[]) {
  return { ok: true, json: async () => ({ games }) } as Response;
}

describe("usePlayfitSearch: onboarding search-invariant coverage", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("marks a newly-typed query pending immediately, before the debounce or fetch resolve", () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));

    const { result } = renderHook(() => usePlayfitSearch({ onboardingQuery: "Hades" }));

    // Pending flips synchronously in the effect, well before the 250ms debounce fires --
    // this is what a consumer must gate row-selectability on (see search-result-row.tsx).
    expect(result.current.onboardingSearchPending).toBe(true);
    expect(result.current.onboardingSearchResults).toEqual([]);
  });

  it("stays pending for the entire debounce + network window, only clearing once the matching fetch resolves", async () => {
    vi.useFakeTimers();
    const request = deferred<Response>();
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(request.promise));

    const { result } = renderHook(() => usePlayfitSearch({ onboardingQuery: "Hades" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    // Debounce elapsed, request is in flight -- still pending.
    expect(result.current.onboardingSearchPending).toBe(true);

    await act(async () => {
      request.resolve(jsonResponse([game("hades")]));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.onboardingSearchPending).toBe(false);
    expect(result.current.onboardingSearchResults.map((g) => g.gameId)).toEqual(["hades"]);
  });

  it("switching the query quickly cancels the stale debounce timer -- only the latest query ever fetches", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([game("hades")]));
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderHook(({ query }) => usePlayfitSearch({ onboardingQuery: query }), {
      initialProps: { query: "H" },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    rerender({ query: "Ha" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    rerender({ query: "Hades" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    // "H" and "Ha" never got 250ms of uninterrupted debounce time, so their timers were
    // cleared before firing -- only the settled "Hades" query actually hit the network.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`/api/games?q=${encodeURIComponent("Hades")}`);
  });

  it("a late response for an older query cannot replace the results of a newer, already-settled one", async () => {
    vi.useFakeTimers();
    const older = deferred<Response>();
    const newer = deferred<Response>();
    const fetchMock = vi.fn().mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ query }) => usePlayfitSearch({ onboardingQuery: query }),
      { initialProps: { query: "Had" } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    rerender({ query: "Hades" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    // The newer request ("Hades") resolves first.
    await act(async () => {
      newer.resolve(jsonResponse([game("hades", "Hades")]));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(result.current.onboardingSearchResults.map((g) => g.gameId)).toEqual(["hades"]);
    expect(result.current.onboardingSearchPending).toBe(false);

    // The stale "Had" request resolves late, after the newer one already landed.
    await act(async () => {
      older.resolve(jsonResponse([game("hades_2_2001", "Hades 2 (2001)")]));
      await Promise.resolve();
      await Promise.resolve();
    });

    // Must still reflect the newer query's result, not the stale one, and must not flip
    // pending back on.
    expect(result.current.onboardingSearchResults.map((g) => g.gameId)).toEqual(["hades"]);
    expect(result.current.onboardingSearchPending).toBe(false);
  });
});

describe("usePlayfitSearch: query-identity invalidation (debounce-window stale response)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("an older query's response landing during the newer query's debounce window cannot commit", async () => {
    vi.useFakeTimers();
    const requestA = deferred<Response>();
    const requestB = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(requestA.promise)
      .mockReturnValueOnce(requestB.promise);
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ query }) => usePlayfitSearch({ onboardingQuery: query }),
      { initialProps: { query: "Had" } },
    );

    // 1. Start request for query A.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(1, `/api/games?q=${encodeURIComponent("Had")}`);

    // 2. Change query to B.
    rerender({ query: "Hades" });

    // 3. Do NOT advance the 250ms debounce yet -- B's own request has not started.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 4. Resolve A.
    await act(async () => {
      requestA.resolve(jsonResponse([game("stale_a_result", "Stale A result")]));
      await Promise.resolve();
      await Promise.resolve();
    });

    // 5. A cannot update B's visible results/error/loading state -- B is still
    // mid-debounce, and must still read as pending with no committed results/error.
    expect(result.current.onboardingSearchResults).toEqual([]);
    expect(result.current.onboardingSearchError).toBeNull();
    expect(result.current.onboardingSearchPending).toBe(true);

    // 6. Advance debounce -- B's request now actually fires.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/games?q=${encodeURIComponent("Hades")}`);

    // 7. Resolve B.
    await act(async () => {
      requestB.resolve(jsonResponse([game("hades", "Hades")]));
      await Promise.resolve();
      await Promise.resolve();
    });

    // 8. B commits normally.
    expect(result.current.onboardingSearchResults.map((g) => g.gameId)).toEqual(["hades"]);
    expect(result.current.onboardingSearchPending).toBe(false);
    expect(result.current.onboardingSearchError).toBeNull();
  });

  it("an older query's FAILURE landing during the newer query's debounce window cannot set B's error", async () => {
    vi.useFakeTimers();
    const failedA = { ok: false, json: async () => ({}) } as Response;
    const requestA = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(requestA.promise)
      .mockResolvedValueOnce(jsonResponse([game("hades")]));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ query }) => usePlayfitSearch({ onboardingQuery: query }),
      { initialProps: { query: "Had" } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    rerender({ query: "Hades" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      requestA.resolve(failedA);
      await Promise.resolve();
      await Promise.resolve();
    });

    // A's failure must not surface as B's error while B is still debouncing.
    expect(result.current.onboardingSearchError).toBeNull();
    expect(result.current.onboardingSearchPending).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.onboardingSearchResults.map((g) => g.gameId)).toEqual(["hades"]);
    expect(result.current.onboardingSearchError).toBeNull();
  });

  it("changing filters/page style query updates keeps starting legitimate future requests after an invalidation", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([game("a_result", "A result")]))
      .mockResolvedValueOnce(jsonResponse([game("b_result", "B result")]))
      .mockResolvedValueOnce(jsonResponse([game("c_result", "C result")]));
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ query }) => usePlayfitSearch({ onboardingQuery: query }),
      { initialProps: { query: "A" } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.onboardingSearchResults.map((g) => g.gameId)).toEqual(["a_result"]);

    rerender({ query: "B" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.onboardingSearchResults.map((g) => g.gameId)).toEqual(["b_result"]);

    rerender({ query: "C" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.onboardingSearchResults.map((g) => g.gameId)).toEqual(["c_result"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("usePlayfitSearch: retryOnboardingSearch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("re-fires the same query immediately, without waiting out the debounce", async () => {
    vi.useFakeTimers();
    const failed = { ok: false, json: async () => ({}) } as Response;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(jsonResponse([game("hades")]));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePlayfitSearch({ onboardingQuery: "Hades" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.onboardingSearchError).toBe("Search could not load. Try again.");

    act(() => {
      result.current.retryOnboardingSearch();
    });

    // No further timer advance -- retry must not wait out a fresh 250ms debounce.
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.onboardingSearchError).toBeNull();
    expect(result.current.onboardingSearchResults.map((g) => g.gameId)).toEqual(["hades"]);
  });

  it("is a no-op when there is no current query", () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePlayfitSearch({ onboardingQuery: "" }));

    act(() => {
      result.current.retryOnboardingSearch();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("failure -> rapid retry x2 -> exactly one new request", async () => {
    vi.useFakeTimers();
    const failed = { ok: false, json: async () => ({}) } as Response;
    const retry = deferred<Response>();
    const fetchMock = vi.fn().mockResolvedValueOnce(failed).mockReturnValueOnce(retry.promise);
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePlayfitSearch({ onboardingQuery: "Hades" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.onboardingSearchError).toBe("Search could not load. Try again.");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Both taps land before the retry's fetch has resolved (and, since this uses
    // fake timers, before any state update from the first could even flush) --
    // this is the exact same-tick race the regression covers: a ref-based guard is
    // required because a `pending` *state* read here would still see the stale
    // pre-retry value.
    act(() => {
      result.current.retryOnboardingSearch();
      result.current.retryOnboardingSearch();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      retry.resolve(jsonResponse([game("hades")]));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.onboardingSearchError).toBeNull();
    expect(result.current.onboardingSearchResults.map((g) => g.gameId)).toEqual(["hades"]);
  });

  it("failure -> retry -> failure -> retry again stays retryable each time", async () => {
    vi.useFakeTimers();
    const failed = { ok: false, json: async () => ({}) } as Response;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(jsonResponse([game("hades")]));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePlayfitSearch({ onboardingQuery: "Hades" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.onboardingSearchError).toBe("Search could not load. Try again.");

    await act(async () => {
      result.current.retryOnboardingSearch();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.onboardingSearchError).toBe("Search could not load. Try again.");

    await act(async () => {
      result.current.retryOnboardingSearch();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.onboardingSearchError).toBeNull();
    expect(result.current.onboardingSearchResults.map((g) => g.gameId)).toEqual(["hades"]);
  });

  it("changing the query is never blocked by an older, still-pending retry", async () => {
    vi.useFakeTimers();
    const failed = { ok: false, json: async () => ({}) } as Response;
    const staleRetry = deferred<Response>();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(failed) // initial "Had" fetch fails
      .mockReturnValueOnce(staleRetry.promise) // retry for "Had", left in flight
      .mockResolvedValueOnce(jsonResponse([game("hades")])); // debounced fetch for "Hades"
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ query }) => usePlayfitSearch({ onboardingQuery: query }),
      { initialProps: { query: "Had" } },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(result.current.onboardingSearchError).toBe("Search could not load. Try again.");

    act(() => {
      result.current.retryOnboardingSearch();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // The query changes while that retry is still unresolved -- the normal debounced
    // path must still fire its own request for "Hades", not be blocked by the stale
    // in-flight retry for "Had".
    rerender({ query: "Hades" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result.current.onboardingSearchResults.map((g) => g.gameId)).toEqual(["hades"]);
    expect(result.current.onboardingSearchError).toBeNull();

    // And retrying again now (for "Hades") must not be blocked by the still-pending
    // "Had" retry either.
    fetchMock.mockResolvedValueOnce(jsonResponse([game("hades")]));
    act(() => {
      result.current.retryOnboardingSearch();
    });
    expect(fetchMock).toHaveBeenCalledTimes(4);

    // Clean up the still-unresolved stale retry so it doesn't leak into other tests.
    await act(async () => {
      staleRetry.resolve(jsonResponse([game("hades_2_2001", "Hades 2 (2001)")]));
      await Promise.resolve();
      await Promise.resolve();
    });
  });
});
