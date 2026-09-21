import type { SeedGame } from "@playfit/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function game(gameId: string): SeedGame {
  return {
    gameId,
    title: gameId,
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

function idsOf(init: RequestInit | undefined): string[] {
  return JSON.parse(String(init?.body)).gameIds;
}

function batchResponse(ids: string[]) {
  return new Response(JSON.stringify({ games: ids.map(game) }), { status: 200 });
}

async function loadCache() {
  vi.resetModules();
  return import("./game-cache");
}

describe("game cache", () => {
  const fetcher = vi.fn<(url: unknown, init?: RequestInit) => Promise<Response>>();
  const requestedIds = () => fetcher.mock.calls.map(([, init]) => idsOf(init));

  beforeEach(() => {
    fetcher.mockReset();
    fetcher.mockImplementation(async (_url, init) => batchResponse(idsOf(init)));
    vi.stubGlobal("fetch", fetcher);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches each missing game once and serves it from memory afterwards", async () => {
    const { ensureGamesCached, getCachedGame } = await loadCache();

    await ensureGamesCached(["a", "b", "a"]);
    await ensureGamesCached(["a", "b"]);

    expect(requestedIds()).toEqual([["a", "b"]]);
    expect(getCachedGame("a")?.title).toBe("a");
  });

  it("merges concurrent requests into one batch", async () => {
    const { ensureGamesCached } = await loadCache();

    await Promise.all([ensureGamesCached(["a"]), ensureGamesCached(["b"])]);

    expect(requestedIds()).toEqual([["a", "b"]]);
  });

  it("waits for a batch that is already running instead of requesting the same games again", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetcher.mockImplementation(async (_url, init) => {
      await gate;
      return batchResponse(idsOf(init));
    });
    const { ensureGamesCached, getCachedGame } = await loadCache();

    const first = ensureGamesCached(["a", "b"]);
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    let secondDone = false;
    const second = ensureGamesCached(["b", "c"]).then(() => {
      secondDone = true;
    });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    expect(requestedIds()).toEqual([["a", "b"], ["c"]]);
    expect(secondDone).toBe(false);

    release();
    await Promise.all([first, second]);

    expect(secondDone).toBe(true);
    expect(getCachedGame("b")).toBeDefined();
    expect(getCachedGame("c")).toBeDefined();
  });

  it("lets a failed batch be retried", async () => {
    fetcher.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    const { ensureGamesCached, getCachedGame } = await loadCache();

    await ensureGamesCached(["a"]);
    expect(getCachedGame("a")).toBeUndefined();

    await ensureGamesCached(["a"]);
    expect(getCachedGame("a")).toBeDefined();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("forgets games when the cache is cleared", async () => {
    const { ensureGamesCached, getCachedGame, clearGameCache } = await loadCache();
    await ensureGamesCached(["a"]);

    clearGameCache();

    expect(getCachedGame("a")).toBeUndefined();
  });
});
