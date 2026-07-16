import type { ProductGameState, ProductOnboardingDraft, SeedGame } from "../types";

const TAG_ANALYSIS_LIMIT = 10;
const MIN_BAD_GAMES_FOR_DISLIKE_REASONS = 2;
const MIN_NEGATIVE_TAG_COUNT = 2;
const OVERREPRESENTED_NEGATIVE_RATE_LIFT = 0.25;

export interface ProductTagPreferenceEntry {
  tag: string;
  positiveCount: number;
  negativeCount: number;
  positiveRate: number;
  negativeRate: number;
}

export interface ProductTagPreferenceAnalysis {
  goodGameCount: number;
  badGameCount: number;
  higherRatedTags: ProductTagPreferenceEntry[];
  lowerRatedTags: ProductTagPreferenceEntry[];
  uniqueLowerRatedTags: ProductTagPreferenceEntry[];
  overrepresentedLowerRatedTags: ProductTagPreferenceEntry[];
}

function countTagsForGames(gameIds: Set<string>, gamesById: Map<string, SeedGame>) {
  const counts = new Map<string, number>();
  let gameCount = 0;

  for (const gameId of gameIds) {
    const game = gamesById.get(gameId);
    if (!game) continue;

    gameCount++;
    for (const tag of new Set(game.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return { counts, gameCount };
}

function sortByPositiveEvidence(left: ProductTagPreferenceEntry, right: ProductTagPreferenceEntry) {
  return (
    right.positiveCount - left.positiveCount ||
    right.positiveRate - left.positiveRate ||
    left.tag.localeCompare(right.tag)
  );
}

function sortByNegativeEvidence(left: ProductTagPreferenceEntry, right: ProductTagPreferenceEntry) {
  return (
    right.negativeCount - left.negativeCount ||
    right.negativeRate - left.negativeRate ||
    left.tag.localeCompare(right.tag)
  );
}

function sortByNegativeLift(left: ProductTagPreferenceEntry, right: ProductTagPreferenceEntry) {
  const leftLift = left.negativeRate - left.positiveRate;
  const rightLift = right.negativeRate - right.positiveRate;
  return rightLift - leftLift || sortByNegativeEvidence(left, right);
}

export function buildTagPreferenceAnalysis(
  draft: ProductOnboardingDraft,
  gamesById: Map<string, SeedGame>,
  gameStates: Record<string, ProductGameState>,
): ProductTagPreferenceAnalysis {
  const goodGameIds = new Set<string>();
  const badGameIds = new Set<string>(draft.dislikedGameIds ?? []);

  for (const record of Object.values(gameStates)) {
    if (record.rating == null || record.rating <= 0) continue;

    if (record.rating <= 2) {
      badGameIds.add(record.gameId);
      goodGameIds.delete(record.gameId);
    } else if (record.rating >= 4 && !badGameIds.has(record.gameId)) {
      goodGameIds.add(record.gameId);
    }
  }

  for (const gameId of draft.likedGameIds) {
    if (!badGameIds.has(gameId)) goodGameIds.add(gameId);
  }

  const positive = countTagsForGames(goodGameIds, gamesById);
  const negative = countTagsForGames(badGameIds, gamesById);
  const tagIds = new Set([...positive.counts.keys(), ...negative.counts.keys()]);
  const entries = [...tagIds].map((tag) => {
    const positiveCount = positive.counts.get(tag) ?? 0;
    const negativeCount = negative.counts.get(tag) ?? 0;

    return {
      tag,
      positiveCount,
      negativeCount,
      positiveRate: positive.gameCount > 0 ? positiveCount / positive.gameCount : 0,
      negativeRate: negative.gameCount > 0 ? negativeCount / negative.gameCount : 0,
    };
  });
  const canIsolateDislikeReasons = negative.gameCount >= MIN_BAD_GAMES_FOR_DISLIKE_REASONS;

  return {
    goodGameCount: positive.gameCount,
    badGameCount: negative.gameCount,
    higherRatedTags: entries
      .filter((entry) => entry.positiveCount > 0)
      .sort(sortByPositiveEvidence)
      .slice(0, TAG_ANALYSIS_LIMIT),
    lowerRatedTags: entries
      .filter((entry) => entry.negativeCount > 0)
      .sort(sortByNegativeEvidence)
      .slice(0, TAG_ANALYSIS_LIMIT),
    uniqueLowerRatedTags: canIsolateDislikeReasons
      ? entries
          .filter(
            (entry) => entry.negativeCount >= MIN_NEGATIVE_TAG_COUNT && entry.positiveCount === 0,
          )
          .sort(sortByNegativeLift)
          .slice(0, TAG_ANALYSIS_LIMIT)
      : [],
    overrepresentedLowerRatedTags: canIsolateDislikeReasons
      ? entries
          .filter(
            (entry) =>
              entry.negativeCount >= MIN_NEGATIVE_TAG_COUNT &&
              entry.positiveCount > 0 &&
              entry.negativeRate >= entry.positiveRate + OVERREPRESENTED_NEGATIVE_RATE_LIFT,
          )
          .sort(sortByNegativeLift)
          .slice(0, TAG_ANALYSIS_LIMIT)
      : [],
  };
}
