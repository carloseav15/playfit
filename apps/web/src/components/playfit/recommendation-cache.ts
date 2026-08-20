import type { ProductPlayNextModel, RankedSeedGame } from "@playfit/core/types";
import { playNextRecommendationId } from "@/lib/core-loop-analytics";

const recommendationsByGameId = new Map<string, RankedSeedGame>();

export function addRecommendationsToSessionCache(entries: RankedSeedGame[]) {
  for (const entry of entries) {
    recommendationsByGameId.set(entry.game.gameId, entry);
  }
}

export function getCachedRecommendation(gameId: string) {
  return recommendationsByGameId.get(gameId) ?? null;
}

interface CachedPlayNextEntry {
  userId: string;
  stateVersion: string;
  recommendationId: string;
  model: ProductPlayNextModel;
}

// Module-scope, so it survives a DecisionShell unmount/remount across client-side route
// navigation (e.g. Play Next -> Picks -> Play Next) within the same page load. Lets a
// returning Play Next mount seed itself with the last good model instead of starting from
// nothing, so a transient refresh failure on return can fall back to real data instead of
// a dead-end error.
//
// Identity is proven, not assumed: getLastPlayNextModel only ever returns a model when the
// caller's userId AND stateVersion match exactly what it was cached under. This is the sole
// enforcement point for PlayFit's invariant that a recommendation generated from stateVersion
// N must never be presented as current once canonical state has advanced past N -- callers
// cannot accidentally bypass it, because a mismatch always returns null, which must be
// treated as "no valid cache" (same as a genuinely first-ever load), not "stale but ok".
let lastEntry: CachedPlayNextEntry | null = null;

export function getLastPlayNextModel(userId: string, stateVersion: string): ProductPlayNextModel | null {
  if (!lastEntry) return null;
  if (lastEntry.userId !== userId) return null;
  if (lastEntry.stateVersion !== stateVersion) return null;
  return lastEntry.model;
}

export function setLastPlayNextModel(userId: string, model: ProductPlayNextModel) {
  lastEntry = {
    userId,
    stateVersion: model.stateVersion,
    recommendationId: playNextRecommendationId(model.stateVersion),
    model,
  };
}

export function clearLastPlayNextModel() {
  lastEntry = null;
}
