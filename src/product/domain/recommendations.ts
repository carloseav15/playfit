import Fuse from "fuse.js";

import type {
  GameAccessStatus,
  PlatformAvailability,
  ProductProfile,
  ProductState,
  ProductTodayModel,
  RankedSeedGame,
  SeedGame,
} from "../types";

const SEARCH_KEYS = [
  { name: "title", weight: 0.62 },
  { name: "aliases", weight: 0.18 },
  { name: "series", weight: 0.12 },
  { name: "primaryGenre", weight: 0.08 },
];

export const HIGH_FRICTION_THRESHOLD = 58;
export const STRONG_FIT_THRESHOLD = 78;
export const PROMISING_FIT_THRESHOLD = 62;
export const LOW_SIGNAL_CAP = 72;
export const MEDIUM_SIGNAL_CAP = 88;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function levelValue(value: SeedGame["storyStrength"]) {
  switch (value) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function paceValue(value: SeedGame["pacingSpeed"]) {
  switch (value) {
    case "fast":
      return 3;
    case "medium":
      return 2;
    case "slow":
      return 1;
    default:
      return 0;
  }
}

function priorityValue(value: ProductProfile["priorities"]["story"]) {
  switch (value) {
    case "high":
      return 3;
    case "medium":
      return 2;
    default:
      return 1;
  }
}

function uniq(items: string[]) {
  return [...new Set(items)].filter(Boolean).slice(0, 4);
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isScoredGame(game: SeedGame) {
  return game.scoringStatus !== "basic";
}

function isPlayableNow(entry: RankedSeedGame) {
  return entry.accessStatus === "playable";
}

function getAccessStatus(
  game: SeedGame,
  platformAvailability: PlatformAvailability,
): GameAccessStatus {
  if (game.releaseState === "unreleased") {
    return "unreleased";
  }

  if (platformAvailability === "unavailable") {
    return "not_on_platforms";
  }

  if (platformAvailability === "unknown") {
    return "unknown_platform";
  }

  return "playable";
}

function updatedAtValue(state: ProductState, entry: RankedSeedGame) {
  const value = state.user.gameStates[entry.game.gameId]?.updatedAt;
  return value ? Date.parse(value) || 0 : 0;
}

function sortPlayingNow(state: ProductState) {
  return (left: RankedSeedGame, right: RankedSeedGame) =>
    right.affinityScore - left.affinityScore ||
    left.riskScore - right.riskScore ||
    updatedAtValue(state, right) - updatedAtValue(state, left);
}

function buildAccessiblePlatformIds(state: ProductState) {
  return new Set(
    state.user.onboarding.platforms
      .filter((entry) => ["available", "limited"].includes(entry.status))
      .map((entry) => entry.platformId),
  );
}

function buildLikedGenres(state: ProductState, gamesById: Map<string, SeedGame>) {
  const liked = new Map<string, number>();
  const disliked = new Map<string, number>();
  const likedSeries = new Set<string>();

  Object.values(state.user.gameStates).forEach((record) => {
    const game = gamesById.get(record.gameId);

    if (!game) {
      return;
    }

    if (record.rating == null) {
      return;
    }

    if (record.rating >= 4) {
      liked.set(game.primaryGenre, (liked.get(game.primaryGenre) ?? 0) + 1);
      if (game.series) {
        likedSeries.add(game.series);
      }
    }

    if (record.rating <= 2) {
      disliked.set(game.primaryGenre, (disliked.get(game.primaryGenre) ?? 0) + 1);
    }
  });

  return {
    likedGenres: [...liked.keys()],
    dislikedGenres: [...disliked.keys()],
    likedSeries,
  };
}

function getPlatformAvailability(
  game: SeedGame,
  accessiblePlatformIds: Set<string>,
): PlatformAvailability {
  if (game.availablePlatformIds.length === 0) {
    return "unknown";
  }

  return game.availablePlatformIds.some((platformId) => accessiblePlatformIds.has(platformId))
    ? "available"
    : "unavailable";
}

function confidenceFromProfile(
  game: SeedGame,
  state: ProductState,
  profile: ProductProfile,
  platformAvailability: PlatformAvailability,
  likedGenres: string[],
) {
  let score = 0;
  const anchorCount = state.user.onboarding.likedGameIds.length;
  const ratedCount = Object.values(state.user.gameStates).filter(
    (record) => record.rating != null,
  ).length;

  if (anchorCount >= 3 || ratedCount >= 3) {
    score += 1;
  }

  if (ratedCount >= 6) {
    score += 1;
  }

  if (profile.signals.length >= 4) {
    score += 1;
  }

  if (likedGenres.includes(game.primaryGenre)) {
    score += 1;
  }

  if (platformAvailability !== "unknown") {
    score += 1;
  }

  if (score >= 5) return "high";
  if (score >= 3) return "medium";
  return "low";
}

function capAffinityByConfidence(score: number, confidence: RankedSeedGame["confidence"]) {
  if (confidence === "low") {
    return Math.min(score, LOW_SIGNAL_CAP);
  }

  if (confidence === "medium") {
    return Math.min(score, MEDIUM_SIGNAL_CAP);
  }

  return score;
}

export function scoreSeedGame(
  game: SeedGame,
  state: ProductState,
  profile: ProductProfile,
  gamesById: Map<string, SeedGame>,
): RankedSeedGame {
  const fitReasons: string[] = [];
  const cautionReasons: string[] = [];
  const accessiblePlatformIds = buildAccessiblePlatformIds(state);
  const { likedGenres, dislikedGenres, likedSeries } = buildLikedGenres(state, gamesById);
  const platformAvailability = getPlatformAvailability(game, accessiblePlatformIds);
  const accessStatus = getAccessStatus(game, platformAvailability);
  const gameState = state.user.gameStates[game.gameId];
  const inBacklog = gameState?.inBacklog ?? false;
  const inWishlist = gameState?.inWishlist ?? false;

  if (!isScoredGame(game)) {
    return {
      game,
      affinityScore: 0,
      riskScore: 0,
      confidence: "low",
      fitReasons: ["This is a Finder-only catalog record and has not been taste-scored yet."],
      cautionReasons: ["Add it to My Games or log an outcome before Playfit can learn from it."],
      platformAvailability,
      accessStatus,
      inBacklog,
      inWishlist,
    };
  }

  let affinity = 18;
  let risk = 10;

  affinity += priorityValue(profile.priorities.story) * levelValue(game.storyStrength) * 4;
  affinity +=
    priorityValue(profile.priorities.progression) * levelValue(game.progressionClarity) * 4;
  affinity += priorityValue(profile.priorities.hook) * levelValue(game.earlyHook) * 3;
  affinity += priorityValue(profile.priorities.aesthetic) * levelValue(game.aestheticFit) * 3;
  affinity +=
    priorityValue(profile.priorities.emotional) * levelValue(game.emotionalComplexity) * 3;
  affinity += priorityValue(profile.priorities.combat) * levelValue(game.combatDepth) * 2;
  affinity += priorityValue(profile.priorities.pace) * paceValue(game.pacingSpeed) * 3;

  if (likedGenres.includes(game.primaryGenre)) {
    affinity += 10;
    fitReasons.push("Matches a genre already visible in your early anchors");
  }

  if (dislikedGenres.includes(game.primaryGenre)) {
    affinity -= 8;
    cautionReasons.push("Shares genre overlap with games that already failed for you");
  }

  if (likedSeries.has(game.series)) {
    affinity += 5;
    fitReasons.push("Belongs to a series already associated with positive signal");
  }

  if (inBacklog) {
    affinity += 6;
    fitReasons.push("Already saved as a title you want to keep in view");
  }

  if (
    profile.avoidPatterns.slowStart &&
    (game.earlyHook === "low" || game.pacingSpeed === "slow")
  ) {
    risk += 18;
    cautionReasons.push("Slow start risk is high for your current profile");
  }

  if (profile.avoidPatterns.repetition && game.endgameRepetitionRisk !== "low") {
    risk += game.endgameRepetitionRisk === "high" ? 22 : 12;
    cautionReasons.push("Repetition is one of the clearest early risk factors");
  }

  if (profile.avoidPatterns.confusingSystems && game.progressionClarity === "low") {
    risk += 14;
    cautionReasons.push("Opaque progression can create friction quickly");
  }

  if (
    profile.avoidPatterns.weakEmotionalPull &&
    game.storyStrength !== "high" &&
    game.emotionalComplexity !== "high"
  ) {
    risk += 12;
    cautionReasons.push("The narrative anchor may be too weak for your current profile");
  }

  if (profile.avoidPatterns.shallowCombat && game.combatDepth === "low") {
    risk += 12;
    cautionReasons.push("Combat depth may be weaker than what tends to sustain your interest");
  }

  if (
    profile.watchVsPlayRisk === "high" &&
    game.storyStrength === "high" &&
    game.pacingSpeed === "slow"
  ) {
    risk += 10;
    cautionReasons.push("This could become a title you follow for story more than active play");
  }

  if (game.storyStrength === "high") {
    fitReasons.push("Strong story potential");
  }
  if (game.progressionClarity === "high") {
    fitReasons.push("Clear progression");
  }
  if (game.earlyHook === "high") {
    fitReasons.push("Fast early hook");
  }
  if (game.aestheticFit === "high") {
    fitReasons.push("Strong aesthetic identity");
  }
  if (game.endgameRepetitionRisk === "low") {
    fitReasons.push("Low repetition risk");
  }

  const confidence = confidenceFromProfile(game, state, profile, platformAvailability, likedGenres);
  return {
    game,
    affinityScore: capAffinityByConfidence(clamp(affinity), confidence),
    riskScore: clamp(risk),
    confidence,
    fitReasons: uniq(fitReasons).slice(0, 4),
    cautionReasons: uniq(cautionReasons).slice(0, 4),
    platformAvailability,
    accessStatus,
    inBacklog,
    inWishlist,
  };
}

export function buildTodayModel(
  games: SeedGame[],
  state: ProductState,
  profile: ProductProfile | null,
  gamesById: Map<string, SeedGame>,
): ProductTodayModel {
  if (!profile) {
    return {
      currentRun: null,
      playingNow: [],
      nextUp: null,
      avoid: null,
      resume: null,
      wishlistFit: null,
      worthTracking: null,
      playableAlternative: null,
    };
  }

  const ranked = games
    .filter(isScoredGame)
    .map((game) => scoreSeedGame(game, state, profile, gamesById))
    .filter((entry) => {
      const stateEntry = state.user.gameStates[entry.game.gameId];

      if (stateEntry?.status === "completed" || stateEntry?.status === "beaten") {
        return false;
      }

      if (stateEntry?.status === "abandoned") {
        return false;
      }

      return true;
    });

  const playingNow = ranked
    .filter((entry) => state.user.gameStates[entry.game.gameId]?.status === "playing")
    .sort(sortPlayingNow(state));

  const currentRun = playingNow[0] ?? null;

  const resume =
    ranked
      .filter(
        (entry) =>
          (state.user.gameStates[entry.game.gameId]?.status === "on_hold" ||
            state.user.gameStates[entry.game.gameId]?.status === "shelved") &&
          entry.accessStatus === "playable",
      )
      .sort((left, right) => right.affinityScore - left.affinityScore)[0] ?? null;

  const playableCandidates = ranked.filter((entry) => {
    const stateEntry = state.user.gameStates[entry.game.gameId];
    return (
      isPlayableNow(entry) &&
      entry.riskScore < HIGH_FRICTION_THRESHOLD &&
      stateEntry?.status !== "playing" &&
      stateEntry?.status !== "on_hold" &&
      stateEntry?.status !== "shelved" &&
      stateEntry?.status !== "abandoned" &&
      !entry.inWishlist
    );
  });

  const sortedPlayable = playableCandidates.sort((left, right) => {
    const leftInterested = left.inBacklog ? 1 : 0;
    const rightInterested = right.inBacklog ? 1 : 0;
    return (
      rightInterested - leftInterested ||
      right.affinityScore - left.affinityScore ||
      left.riskScore - right.riskScore
    );
  });

  const nextUp = sortedPlayable[0] ?? null;
  const playableAlternative = sortedPlayable[1] ?? null;
  const primaryPlayableIds = new Set(
    [...playingNow, nextUp, playableAlternative, resume]
      .map((entry) => entry?.game.gameId)
      .filter((gameId): gameId is string => Boolean(gameId)),
  );

  const wishlistFit =
    ranked
      .filter((entry) => {
        const stateEntry = state.user.gameStates[entry.game.gameId];
        return (
          isPlayableNow(entry) &&
          !primaryPlayableIds.has(entry.game.gameId) &&
          !entry.inBacklog &&
          stateEntry?.status !== "playing" &&
          stateEntry?.status !== "on_hold" &&
          stateEntry?.status !== "shelved" &&
          stateEntry?.status !== "completed" &&
          stateEntry?.status !== "beaten" &&
          stateEntry?.status !== "abandoned"
        );
      })
      .sort((left, right) => {
        const leftTracked = left.inWishlist ? 1 : 0;
        const rightTracked = right.inWishlist ? 1 : 0;
        return (
          rightTracked - leftTracked ||
          right.affinityScore - left.affinityScore ||
          left.riskScore - right.riskScore
        );
      })[0] ?? null;

  const worthTracking =
    ranked
      .filter((entry) => {
        const stateEntry = state.user.gameStates[entry.game.gameId];
        return (
          !primaryPlayableIds.has(entry.game.gameId) &&
          entry.inWishlist &&
          !isPlayableNow(entry) &&
          stateEntry?.status !== "completed" &&
          stateEntry?.status !== "beaten" &&
          stateEntry?.status !== "abandoned"
        );
      })
      .sort((left, right) => {
        const leftUnreleased = left.accessStatus === "unreleased" ? 1 : 0;
        const rightUnreleased = right.accessStatus === "unreleased" ? 1 : 0;
        return (
          rightUnreleased - leftUnreleased ||
          right.affinityScore - left.affinityScore ||
          left.riskScore - right.riskScore
        );
      })[0] ?? null;

  const avoid =
    ranked
      .filter((entry) => {
        const stateEntry = state.user.gameStates[entry.game.gameId];
        return (
          entry.accessStatus === "playable" &&
          !stateEntry?.status &&
          !entry.inBacklog &&
          !entry.inWishlist &&
          entry.riskScore >= HIGH_FRICTION_THRESHOLD
        );
      })
      .sort((left, right) => right.riskScore - left.riskScore)[0] ?? null;

  return {
    currentRun,
    playingNow,
    nextUp,
    avoid,
    resume,
    wishlistFit,
    worthTracking,
    playableAlternative,
  };
}

export function buildFinderIndex(games: SeedGame[]) {
  return new Fuse(games, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.34,
    keys: SEARCH_KEYS,
  });
}

export function searchSeedGames(games: SeedGame[], query: string, index: Fuse<SeedGame>) {
  const normalized = query.trim();

  if (!normalized) {
    return games.filter(isScoredGame).slice(0, 12);
  }

  return index
    .search(normalized)
    .map((result) => result.item)
    .slice(0, 12);
}

export function findExactSeedGame(games: SeedGame[], query: string) {
  const normalized = normalizeSearchValue(query);

  if (!normalized) {
    return null;
  }

  return (
    games.find((game) => normalizeSearchValue(game.title) === normalized) ??
    games.find((game) =>
      (game.aliases ?? []).some((alias) => normalizeSearchValue(alias) === normalized),
    ) ??
    games.find((game) => normalizeSearchValue(game.series) === normalized) ??
    null
  );
}
