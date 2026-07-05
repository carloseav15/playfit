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
    const genre = game.genreId ?? game.primaryGenre;
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

function addTagEvidence(target: Record<string, number>, tags: string[], magnitude: number) {
  for (const tag of tags) {
    target[tag] = (target[tag] ?? 0) + magnitude;
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

function formatTrait(tag: string) {
  return tag.replace(/[_-]/g, " ");
}

function evidenceStage(ratedCount: number) {
  if (ratedCount >= 6) return "strong";
  if (ratedCount >= 3) return "emerging";
  return "early";
}

function positiveSignalCopy(tag: string, count: number, ratedCount: number) {
  const label = formatTrait(tag);
  const stage = evidenceStage(ratedCount);

  if (stage === "strong") {
    return {
      label: `Strong pattern: ${label}`,
      reason: `${count} positive outcomes point in this direction.`,
    };
  }

  if (stage === "emerging") {
    return {
      label: `Emerging pattern: ${label}`,
      reason: "Several favorites or high ratings share this trait.",
    };
  }

  return {
    label: `Early signal: ${label}`,
    reason: "This shows up in your favorites or first ratings. Rate more games to confirm it.",
  };
}

function cautionSignalCopy(tag: string, count: number, ratedCount: number) {
  const label = formatTrait(tag);
  const stage = evidenceStage(ratedCount);

  if (stage === "strong") {
    return {
      label: `Clear watch-out: ${label}`,
      reason: `${count} lower-rated outcomes lean this way more than your positive signals.`,
    };
  }

  if (stage === "emerging") {
    return {
      label: `Emerging watch-out: ${label}`,
      reason: "A few lower ratings point in this direction.",
    };
  }

  return {
    label: `Possible watch-out: ${label}`,
    reason: "There is not enough lower-rated evidence to treat this as a firm pattern yet.",
  };
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
  return (
    draft.platforms.length > 0 &&
    draft.likedGameIds.length >= 3 &&
    (draft.dislikedGameIds?.length ?? 0) >= 1
  );
}

export function buildFallbackProfile(
  draft: ProductOnboardingDraft,
  gamesById: Map<string, SeedGame>,
): ProductProfile {
  const dislikedGameIds = new Set(draft.dislikedGameIds ?? []);
  const positiveAnchorIds = draft.likedGameIds.filter((gameId) => !dislikedGameIds.has(gameId));
  const likedGenres = countGenres(positiveAnchorIds, gamesById).slice(0, 3);
  const likedTags = countTags(positiveAnchorIds, gamesById);
  const signalDrafts: ProductProfileSignal[] = [];

  if (likedGenres.length > 0) {
    signalDrafts.push({
      id: "genre-fit",
      tone: "positive",
      label: `Starting point: ${formatTrait(likedGenres[0])}`,
      reason: "This genre appears in the favorites you chose during setup.",
    });
  }

  const topTags = Object.entries(likedTags)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  for (const [tag] of topTags) {
    signalDrafts.push({
      id: `tag-fit-${tag}`,
      tone: "positive",
      label: `Early signal: ${formatTrait(tag)}`,
      reason: "Your setup favorites share this trait. Ratings will make the signal sharper.",
    });
  }

  return {
    summary: "Early profile built from your favorites. Rate a few games to make it sharper.",
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
  const dislikedGameIds = new Set(draft.dislikedGameIds ?? []);
  const positiveAnchorIds = draft.likedGameIds.filter((gameId) => !dislikedGameIds.has(gameId));
  const likedGenres = countGenres(positiveAnchorIds, gamesById).slice(0, 3);
  const positiveTags: Record<string, number> = {};
  const negativeTags: Record<string, number> = {};
  const avoidedGenres = new Map<string, number>();
  const signalDrafts: ProductProfileSignal[] = [];
  let ratedCount = 0;
  let positiveOutcomeCount = 0;
  let negativeOutcomeCount = 0;
  const anchorTags = countTags(positiveAnchorIds, gamesById);
  const ratedGameIds = new Set<string>();

  Object.values(gameStates).forEach((record) => {
    const game = gamesById.get(record.gameId);
    if (!game) return;
    if (record.rating == null || record.rating <= 0) return;

    // Evidence magnitude = distance from neutral (3): a 5 pushes twice as hard
    // as a 4, a 1 twice as hard as a 2. A 3 ("mixed") has magnitude 0 -- it
    // doesn't move tag/genre evidence, and (unlike before) doesn't count
    // toward ratedCount/confidence either, since it hasn't told us anything.
    const magnitude = record.rating - 3;
    if (magnitude === 0) return;

    ratedGameIds.add(record.gameId);
    ratedCount++;

    const positive = magnitude > 0;
    const negative = magnitude < 0;

    if (positive) {
      positiveOutcomeCount++;
      addTagEvidence(positiveTags, game.tags, magnitude);
      const genreKey = game.genreId ?? game.primaryGenre;
      if (genreKey && !likedGenres.includes(genreKey)) {
        likedGenres.push(genreKey);
      }
    }

    if (negative) {
      negativeOutcomeCount++;
      addTagEvidence(negativeTags, game.tags, Math.abs(magnitude));
      const genreKey = game.genreId ?? game.primaryGenre;
      if (genreKey) {
        avoidedGenres.set(genreKey, (avoidedGenres.get(genreKey) ?? 0) + 1);
      }
    }
  });

  for (const gameId of dislikedGameIds) {
    if (ratedGameIds.has(gameId)) continue;
    const game = gamesById.get(gameId);
    if (!game) continue;

    ratedCount++;
    negativeOutcomeCount++;
    addTagEvidence(negativeTags, game.tags, 1);
    const genreKey = game.genreId ?? game.primaryGenre;
    if (genreKey) {
      avoidedGenres.set(genreKey, (avoidedGenres.get(genreKey) ?? 0) + 1);
    }
  }

  const { likedTags, dislikedTags } = buildNetTagProfiles(positiveTags, negativeTags, anchorTags);
  const topLikedTags = Object.entries(likedTags)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  const topDislikedTags = Object.entries(dislikedTags)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);

  for (const [tag] of topLikedTags) {
    const copy = positiveSignalCopy(tag, likedTags[tag], ratedCount);
    signalDrafts.push({
      id: `tag-fit-${tag}`,
      tone: "positive",
      label: copy.label,
      reason: copy.reason,
    });
  }

  for (const [tag] of topDislikedTags) {
    const copy = cautionSignalCopy(tag, dislikedTags[tag], ratedCount);
    signalDrafts.push({
      id: `tag-risk-${tag}`,
      tone: "negative",
      label: copy.label,
      reason: copy.reason,
    });
  }

  if (positiveOutcomeCount >= 3 && negativeOutcomeCount === 0) {
    signalDrafts.push({
      id: "positive-momentum",
      tone: "positive",
      label: "Clean streak",
      reason: "Your recent ratings are positive, so Playfit can lean into nearby matches.",
    });
  }

  const mergedLikedGenres = [
    ...new Set([...countGenres(positiveAnchorIds, gamesById), ...likedGenres]),
  ].slice(0, 5);

  const summary =
    ratedCount >= 6
      ? `Strong pattern from ${ratedCount} ratings and ${draft.likedGameIds.length} setup favorites.`
      : ratedCount >= 3
        ? `Emerging pattern from ${ratedCount} ratings and ${draft.likedGameIds.length} setup favorites.`
        : ratedCount > 0
          ? `Early read from ${ratedCount} rating(s) and ${draft.likedGameIds.length} setup favorites.`
          : "Early profile built from your favorites. Rate a few games to make it sharper.";

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
