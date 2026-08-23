import { resolveKnownGenre } from "../data/seeds";
import type {
  ProductGameState,
  ProductOnboardingDraft,
  ProductProfile,
  ProductProfileSignal,
  SeedGame,
} from "../types";

function countGenresRecord(
  gameIds: string[],
  gamesById: Map<string, SeedGame>,
): Record<string, number> {
  const counts: Record<string, number> = {};

  gameIds.forEach((gameId) => {
    const game = gamesById.get(gameId);
    if (!game) return;
    const genre = resolveKnownGenre(game);
    if (!genre) return;
    counts[genre] = (counts[genre] ?? 0) + 1;
  });

  return counts;
}

function countGenres(gameIds: string[], gamesById: Map<string, SeedGame>) {
  const counts = countGenresRecord(gameIds, gamesById);
  return Object.entries(counts)
    .sort((left, right) => right[1] - left[1])
    .map(([genre]) => genre);
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

interface RatingEvidence {
  ratedGameIds: Set<string>;
  ratedCount: number;
  positiveOutcomeCount: number;
  negativeOutcomeCount: number;
}

function collectRatingEvidence(
  gameStates: Record<string, ProductGameState>,
  gamesById: Map<string, SeedGame>,
  positiveGenres: Record<string, number>,
  negativeGenres: Record<string, number>,
  positiveTags: Record<string, number>,
  negativeTags: Record<string, number>,
): RatingEvidence {
  const ratedGameIds = new Set<string>();
  let ratedCount = 0;
  let positiveOutcomeCount = 0;
  let negativeOutcomeCount = 0;

  Object.values(gameStates).forEach((record) => {
    const game = gamesById.get(record.gameId);
    if (!game) return;
    if (record.rating == null || record.rating <= 0) return;

    const magnitude = record.rating - 3;
    if (magnitude === 0) return;

    ratedGameIds.add(record.gameId);
    ratedCount++;

    const positive = magnitude > 0;
    const negative = magnitude < 0;
    const genreKey = resolveKnownGenre(game);

    if (positive) {
      positiveOutcomeCount++;
      addTagEvidence(positiveTags, game.tags, magnitude);
      if (genreKey) addTagEvidence(positiveGenres, [genreKey], magnitude);
    }

    if (negative) {
      negativeOutcomeCount++;
      addTagEvidence(negativeTags, game.tags, Math.abs(magnitude));
      if (genreKey) addTagEvidence(negativeGenres, [genreKey], Math.abs(magnitude));
    }
  });

  return { ratedGameIds, ratedCount, positiveOutcomeCount, negativeOutcomeCount };
}

function buildProfileSignals(
  topLikedTags: [string, number][],
  topDislikedTags: [string, number][],
  likedTags: Record<string, number>,
  dislikedTags: Record<string, number>,
  ratedCount: number,
  positiveOutcomeCount: number,
  negativeOutcomeCount: number,
): ProductProfileSignal[] {
  const signalDrafts: ProductProfileSignal[] = [];

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

  return uniqueSignals(signalDrafts).slice(0, 8);
}

function buildProfileSummary(ratedCount: number, onboardingLikedCount: number): string {
  if (ratedCount >= 6)
    return `Strong pattern from ${ratedCount} ratings and ${onboardingLikedCount} setup favorites.`;
  if (ratedCount >= 3)
    return `Emerging pattern from ${ratedCount} ratings and ${onboardingLikedCount} setup favorites.`;
  if (ratedCount > 0)
    return `Early read from ${ratedCount} rating(s) and ${onboardingLikedCount} setup favorites.`;
  return "Early profile built from your favorites. Rate a few games to make it sharper.";
}

export function buildAdaptiveProfile(
  draft: ProductOnboardingDraft,
  gamesById: Map<string, SeedGame>,
  gameStates: Record<string, ProductGameState>,
): ProductProfile {
  const dislikedGameIds = new Set(draft.dislikedGameIds ?? []);
  const positiveAnchorIds = draft.likedGameIds.filter((gameId) => !dislikedGameIds.has(gameId));
  const positiveTags: Record<string, number> = {};
  const negativeTags: Record<string, number> = {};
  const positiveGenres: Record<string, number> = {};
  const negativeGenres: Record<string, number> = {};
  const anchorTags = countTags(positiveAnchorIds, gamesById);
  const anchorGenres = countGenresRecord(positiveAnchorIds, gamesById);

  const {
    ratedGameIds,
    ratedCount: initialRatedCount,
    positiveOutcomeCount,
    negativeOutcomeCount: initialNegativeOutcomeCount,
  } = collectRatingEvidence(
    gameStates,
    gamesById,
    positiveGenres,
    negativeGenres,
    positiveTags,
    negativeTags,
  );

  let ratedCount = initialRatedCount;
  let negativeOutcomeCount = initialNegativeOutcomeCount;

  for (const gameId of dislikedGameIds) {
    if (ratedGameIds.has(gameId)) continue;
    const game = gamesById.get(gameId);
    if (!game) continue;

    ratedCount++;
    negativeOutcomeCount++;
    addTagEvidence(negativeTags, game.tags, 1);
    const genreKey = resolveKnownGenre(game);
    if (genreKey) addTagEvidence(negativeGenres, [genreKey], 1);
  }

  const { likedTags, dislikedTags } = buildNetTagProfiles(positiveTags, negativeTags, anchorTags);
  // Genres get the exact same net-evidence reconciliation as tags
  // (buildNetTagProfiles is generic over any Record<string, number> triple):
  // a genre only ends up on the liked or avoided side once its positive and
  // negative evidence are compared, never both, and a true tie lands on
  // neither list -- same semantics as tags, no new weighting invented.
  const { likedTags: likedGenreEvidence, dislikedTags: avoidedGenreEvidence } = buildNetTagProfiles(
    positiveGenres,
    negativeGenres,
    anchorGenres,
  );
  const likedGenres = Object.entries(likedGenreEvidence)
    .sort(([, a], [, b]) => b - a)
    .map(([genre]) => genre)
    .slice(0, 5);
  const avoidedGenres = Object.entries(avoidedGenreEvidence)
    .sort(([, a], [, b]) => b - a)
    .map(([genre]) => genre)
    .slice(0, 3);
  const topLikedTags = Object.entries(likedTags)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  const topDislikedTags = Object.entries(dislikedTags)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  const signals = buildProfileSignals(
    topLikedTags,
    topDislikedTags,
    likedTags,
    dislikedTags,
    ratedCount,
    positiveOutcomeCount,
    negativeOutcomeCount,
  );
  return {
    summary: buildProfileSummary(ratedCount, draft.likedGameIds.length),
    likedGenres,
    avoidedGenres,
    likedTags,
    dislikedTags,
    ratedCount,
    signals,
  };
}
