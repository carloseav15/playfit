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
});
