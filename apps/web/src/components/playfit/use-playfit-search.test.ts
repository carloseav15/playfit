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
