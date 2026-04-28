import type { GameRecord, ProfileRow, RecommendationRow } from "../data/schema";

function numericWeight(row: ProfileRow) {
  return Number(row.weight) || 0;
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return total / values.length;
}

export function buildSummaryStats(
  records: GameRecord[],
  profile: ProfileRow[],
  recommendations: RecommendationRow[],
) {
  const actionable = records.filter((record) =>
    ["backlog", "on_hold", "playing", "interested_not_started"].includes(
      record.status,
    ),
  ).length;

  return {
    strongSignals: profile.filter((row) => numericWeight(row) >= 5).length,
    totalGames: records.length,
    completedGames: records.filter((row) => row.status === "completed").length,
    actionableGames: actionable,
    checkinsLogged: records.reduce((sum, record) => sum + record.sessionCount, 0),
    youtubeOutcomes: records.filter((row) =>
      ["dropped_then_watched", "completed_or_watched"].includes(row.status),
    ).length,
    openRecommendations: recommendations.filter((row) => row.status === "open")
      .length,
  };
}

export function topProfileSignals(
  profile: ProfileRow[],
  key: string,
  limit = 6,
) {
  return profile
    .filter((row) => row.key === key)
    .sort((left, right) => numericWeight(right) - numericWeight(left))
    .slice(0, limit);
}

export function favoriteCompletedGames(records: GameRecord[], limit = 8) {
  return [...records]
    .filter(
      (record) => record.status === "completed" && (record.overallScore ?? 0) >= 4,
    )
    .sort((left, right) => (right.overallScore ?? 0) - (left.overallScore ?? 0))
    .slice(0, limit);
}

export function youtubePatternGames(records: GameRecord[], limit = 8) {
  return [...records]
    .filter((record) =>
      ["dropped_then_watched", "completed_or_watched"].includes(record.status),
    )
    .sort((left, right) => right.watchRiskScore - left.watchRiskScore)
    .slice(0, limit);
}

export function genreInsights(records: GameRecord[], statuses: string[]) {
  const grouped = new Map<string, { count: number; scores: number[] }>();

  records
    .filter((record) => statuses.includes(record.status) && record.primaryGenre)
    .forEach((record) => {
      const entry = grouped.get(record.primaryGenre) ?? { count: 0, scores: [] };
      entry.count += 1;
      if (record.overallScore !== undefined) {
        entry.scores.push(record.overallScore);
      }
      grouped.set(record.primaryGenre, entry);
    });

  return [...grouped.entries()]
    .map(([genre, entry]) => ({
      genre,
      count: entry.count,
      averageScore: average(entry.scores),
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
}
