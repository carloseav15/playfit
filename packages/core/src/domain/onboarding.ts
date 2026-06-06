import type {
  ProductGameState,
  ProductOnboardingDraft,
  ProductProfile,
  ProductProfileSignal,
  SeedGame,
} from "../types";

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

function countGenres(gameIds: string[], gamesById: Map<string, SeedGame>) {
  const counts = new Map<string, number>();

  gameIds.forEach((gameId) => {
    const game = gamesById.get(gameId);
    if (!game) return;
    const genre = game.primaryGenre;
    if (!genre) return;
    counts.set(genre, (counts.get(genre) ?? 0) + 1);
  });

  return [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([genre]) => genre);
}

function countTags(gameIds: string[], gamesById: Map<string, SeedGame>): Record<string, number> {
  const counts: Record<string, number> = {};

  gameIds.forEach((gameId) => {
    const game = gamesById.get(gameId);
    if (!game) return;
    for (const tag of game.tags) {
      counts[tag] = (counts[tag] ?? 0) + 1;
    }
  });

  return counts;
}

function addTagEvidence(target: Record<string, number>, tags: string[]) {
  for (const tag of tags) {
    target[tag] = (target[tag] ?? 0) + 1;
  }
}

function buildNetTagProfiles(
  positiveTags: Record<string, number>,
  negativeTags: Record<string, number>,
  anchorTags: Record<string, number>,
) {
  const likedTags: Record<string, number> = {};
  const dislikedTags: Record<string, number> = {};
  const tagIds = new Set([
    ...Object.keys(positiveTags),
    ...Object.keys(negativeTags),
    ...Object.keys(anchorTags),
  ]);

  for (const tag of tagIds) {
    const positiveEvidence = (positiveTags[tag] ?? 0) + (anchorTags[tag] ?? 0);
    const negativeEvidence = negativeTags[tag] ?? 0;

    if (positiveEvidence > negativeEvidence) {
      likedTags[tag] = positiveEvidence;
    } else if (negativeEvidence > positiveEvidence) {
      dislikedTags[tag] = negativeEvidence;
    }
  }

  return { likedTags, dislikedTags };
}

function uniqueSignals(signals: ProductProfileSignal[]) {
  return [...new Map(signals.map((signal) => [signal.id, signal])).values()];
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
  const badGameIds = new Set<string>();

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
    if (!badGameIds.has(gameId)) {
      goodGameIds.add(gameId);
    }
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

export function canAdvanceOnboarding(draft: ProductOnboardingDraft) {
  return draft.platforms.length > 0 && draft.likedGameIds.length >= 3;
}

export function buildFallbackProfile(
  draft: ProductOnboardingDraft,
  gamesById: Map<string, SeedGame>,
): ProductProfile {
  const likedGenres = countGenres(draft.likedGameIds, gamesById).slice(0, 3);
  const likedTags = countTags(draft.likedGameIds, gamesById);
  const signalDrafts: ProductProfileSignal[] = [];

  if (likedGenres.length > 0) {
    signalDrafts.push({
      id: "genre-fit",
      tone: "positive",
      label: `You tend to like ${likedGenres[0]}`,
      reason: "Your favorite games show the genres you tend to enjoy.",
    });
  }

  const topTags = Object.entries(likedTags)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  for (const [tag] of topTags) {
    signalDrafts.push({
      id: `tag-fit-${tag}`,
      tone: "positive",
      label: `You tend to enjoy ${tag.replace(/_/g, " ")}`,
      reason: "Your favorite games share this trait.",
    });
  }

  return {
    summary: "Your profile is based on your favorite games. It gets better as you rate more.",
    likedGenres,
    avoidedGenres: [],
    likedTags,
    dislikedTags: {},
    ratedCount: 0,
    signals: uniqueSignals(signalDrafts).slice(0, 6),
  };
}

export function buildAdaptiveProfile(
  draft: ProductOnboardingDraft,
  gamesById: Map<string, SeedGame>,
  gameStates: Record<string, ProductGameState>,
): ProductProfile {
  const likedGenres = countGenres(draft.likedGameIds, gamesById).slice(0, 3);
  const positiveTags: Record<string, number> = {};
  const negativeTags: Record<string, number> = {};
  const avoidedGenres = new Map<string, number>();
  const signalDrafts: ProductProfileSignal[] = [];
  let ratedCount = 0;
  let positiveOutcomeCount = 0;
  let negativeOutcomeCount = 0;
  const anchorTags = countTags(draft.likedGameIds, gamesById);

  Object.values(gameStates).forEach((record) => {
    const game = gamesById.get(record.gameId);
    if (!game) return;
    if (record.rating == null || record.rating <= 0) return;

    ratedCount++;

    const positive = record.rating >= 4;
    const negative = record.rating <= 2;

    if (positive) {
      positiveOutcomeCount++;
      addTagEvidence(positiveTags, game.tags);
      if (!likedGenres.includes(game.primaryGenre)) {
        likedGenres.push(game.primaryGenre);
      }
    }

    if (negative) {
      negativeOutcomeCount++;
      addTagEvidence(negativeTags, game.tags);
      avoidedGenres.set(game.primaryGenre, (avoidedGenres.get(game.primaryGenre) ?? 0) + 1);
    }
  });

  const { likedTags, dislikedTags } = buildNetTagProfiles(positiveTags, negativeTags, anchorTags);
  const topLikedTags = Object.entries(likedTags)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  const topDislikedTags = Object.entries(dislikedTags)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  for (const [tag] of topLikedTags) {
    signalDrafts.push({
      id: `tag-fit-${tag}`,
      tone: "positive",
      label: `You tend to enjoy ${tag.replace(/_/g, " ")}`,
      reason: `${likedTags[tag]} positive signal(s) share this trait after comparing lower ratings.`,
    });
  }

  for (const [tag] of topDislikedTags) {
    signalDrafts.push({
      id: `tag-risk-${tag}`,
      tone: "negative",
      label: `Be careful with ${tag.replace(/_/g, " ")}`,
      reason: `${dislikedTags[tag]} lower-rated game(s) lean this way more than your positive signals.`,
    });
  }

  if (positiveOutcomeCount > 0 && negativeOutcomeCount === 0) {
    signalDrafts.push({
      id: "positive-momentum",
      tone: "positive",
      label: "Great track record",
      reason: "Everything you've rated has been a hit so far.",
    });
  }

  const mergedLikedGenres = [
    ...new Set([...countGenres(draft.likedGameIds, gamesById), ...likedGenres]),
  ].slice(0, 5);

  const summary =
    ratedCount > 0
      ? `Based on ${ratedCount} rated game(s) and ${draft.likedGameIds.length} favorite(s). It gets better over time.`
      : "Your profile is based on your favorite games. It gets better as you rate more.";

  return {
    summary,
    likedGenres: mergedLikedGenres,
    avoidedGenres: [...avoidedGenres.keys()].slice(0, 3),
    likedTags,
    dislikedTags,
    ratedCount,
    signals: uniqueSignals(signalDrafts).slice(0, 8),
  };
}

export function applyProfileOverrides(profile: ProductProfile): ProductProfile {
  return profile;
}
