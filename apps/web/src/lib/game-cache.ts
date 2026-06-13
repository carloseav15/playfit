import type { SeedGame } from "@playfit/core/types";

const cache = new Map<string, SeedGame>();
let pendingBatch: string[] | null = null;
let batchPromise: Promise<void> | null = null;

async function flushBatch(): Promise<void> {
  const ids = pendingBatch;
  pendingBatch = null;
  batchPromise = null;
  if (!ids || ids.length === 0) return;

  try {
    const res = await fetch("/api/games/batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameIds: ids }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { games: SeedGame[] };
    for (const game of data.games) {
      cache.set(game.gameId, game);
    }
  } catch {
    // Silently fail — caller can retry
  }
}

function enqueueFetch(ids: string[]): Promise<void> {
  pendingBatch = [...(pendingBatch ?? []), ...ids];
  if (!batchPromise) {
    batchPromise = new Promise((resolve) => {
      setTimeout(() => {
        void flushBatch().then(resolve);
      }, 0);
    });
  }
  return batchPromise;
}

export function getCachedGame(gameId: string): SeedGame | undefined {
  return cache.get(gameId);
}

export function setCachedGame(game: SeedGame): void {
  cache.set(game.gameId, game);
}

export function addGamesToCache(games: SeedGame[]): void {
  for (const game of games) {
    cache.set(game.gameId, game);
  }
}

export async function ensureGamesCached(gameIds: string[]): Promise<void> {
  const missing = gameIds.filter((id) => !cache.has(id));
  if (missing.length === 0) return;
  await enqueueFetch(missing);
}

export async function fetchGame(gameId: string): Promise<SeedGame | null> {
  const cached = cache.get(gameId);
  if (cached) return cached;
  const res = await fetch("/api/games/batch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameIds: [gameId] }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { games: SeedGame[] };
  for (const game of data.games) {
    cache.set(game.gameId, game);
  }
  return data.games[0] ?? null;
}

export function clearGameCache(): void {
  cache.clear();
}
