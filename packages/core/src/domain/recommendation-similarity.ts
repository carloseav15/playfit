import { cosineSimilarity } from "../data/tags";
import type { SeedGame } from "../types";

function isScoredGame(game: SeedGame) {
  return game.tags.length > 0;
}

export function findSeriesGames(game: SeedGame, allGames: SeedGame[], limit = 20): SeedGame[] {
  const seriesKey = game.seriesId ?? game.series;
  if (!seriesKey) return [];
  return allGames
    .filter(
      (candidate) =>
        (candidate.seriesId ?? candidate.series) === seriesKey && candidate.gameId !== game.gameId,
    )
    .slice(0, limit);
}

export function findSimilarGames(game: SeedGame, allGames: SeedGame[], limit = 20): SeedGame[] {
  return allGames
    .filter((candidate) => candidate.gameId !== game.gameId && isScoredGame(candidate))
    .map((candidate) => ({
      game: candidate,
      similarity: cosineSimilarity(game.tags, candidate.tags),
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit)
    .map((entry) => entry.game);
}
