import type { RankedSeedGame } from "@playfit/core/types";

const recommendationsByGameId = new Map<string, RankedSeedGame>();

export function addRecommendationsToSessionCache(entries: RankedSeedGame[]) {
  for (const entry of entries) {
    recommendationsByGameId.set(entry.game.gameId, entry);
  }
}

export function getCachedRecommendation(gameId: string) {
  return recommendationsByGameId.get(gameId) ?? null;
}
