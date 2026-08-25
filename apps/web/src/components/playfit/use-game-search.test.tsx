import type { SeedGame } from "@playfit/core/types";
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGameSearch } from "./use-game-search";

const game: SeedGame = {
  gameId: "hades",
  title: "Hades",
  aliases: [],
  series: "",
  source: "catalog",
  primaryGenre: "roguelike",
  tags: [],
  notes: "",
  coverPath: "",
  availablePlatformIds: [],
  availablePlatformNames: [],
  releaseState: "released",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("useGameSearch", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("starts pending and renders an empty successful result", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ games: [], total: 0 }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGameSearch({ query: "missing" }));
    expect(result.current.pending).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(result.current).toMatchObject({ pending: false, error: null, results: [], total: 0 });
  });

  it("does not fetch the full catalog when there is no query and no filters", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useGameSearch({ query: "" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ pending: false, error: null, results: [], total: 0 });
  });

  it("fetches when a filter is set even with an empty query", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ games: [], total: 0 }) });
    vi.stubGlobal("fetch", fetchMock);

    renderHook(() => useGameSearch({ query: "", filters: { platform: ["pc"] } }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a network failure as the existing recoverable error", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const { result } = renderHook(() => useGameSearch({ query: "Hades" }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(result.current).toMatchObject({
      pending: false,
      error: "Search could not load. Try again.",
      results: [],
      total: 0,
    });
  });

  it("does not let a stale response replace the latest query", async () => {
    vi.useFakeTimers();
    const first = deferred<{
      ok: boolean;
      json: () => Promise<{ games: SeedGame[]; total: number }>;
    }>();
    const second = deferred<{
      ok: boolean;
      json: () => Promise<{ games: SeedGame[]; total: number }>;
    }>();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise),
    );

    const { result, rerender } = renderHook(({ query }) => useGameSearch({ query }), {
      initialProps: { query: "old" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    rerender({ query: "new" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
      second.resolve({
        ok: true,
        json: async () => ({ games: [{ ...game, gameId: "new" }], total: 1 }),
      });
      await Promise.resolve();
    });
    expect(result.current.results[0]?.gameId).toBe("new");

    await act(async () => {
      first.resolve({
        ok: true,
        json: async () => ({ games: [{ ...game, gameId: "old" }], total: 1 }),
      });
      await Promise.resolve();
    });

    expect(result.current.results[0]?.gameId).toBe("new");
    expect(result.current.resolvedPage).toBe(1);
  });

  it("changes resolvedKey when the query changes even though the page stays the same", async () => {
    // Regression test for a consumer-side bug (search-page-client.tsx): a page-only
    // staleness guard can't tell two different queries apart when both happen to
    // resolve on page 1, so a consumer effect could briefly re-adopt results that
    // actually answer the *previous* query. resolvedKey carries the full
    // query+filters+page identity so a consumer can guard on that instead.
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ games: [], total: 0 }) });
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(({ query }) => useGameSearch({ query }), {
      initialProps: { query: "mario" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    const marioKey = result.current.resolvedKey;
    expect(result.current.resolvedPage).toBe(1);

    rerender({ query: "zelda" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });

    expect(result.current.resolvedPage).toBe(1);
    expect(result.current.resolvedKey).not.toBe(marioKey);
    expect(result.current.resolvedKey).toBe("zelda|||1");
  });
});
