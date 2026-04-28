import Fuse from "fuse.js";

import type {
  PlatformAvailability,
  ProductOwnershipStatus,
  ProductProfile,
  ProductState,
  ProductTodayModel,
  RankedSeedGame,
  SeedGame,
} from "../types";

const SEARCH_KEYS = [
  { name: "title", weight: 0.72 },
  { name: "series", weight: 0.18 },
  { name: "primaryGenre", weight: 0.1 },
];

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
    case "low":
    default:
      return 1;
  }
}

function uniq(items: string[]) {
  return [...new Set(items)].filter(Boolean).slice(0, 4);
}

function getOwnershipStatus(state: ProductState, game: SeedGame): ProductOwnershipStatus {
  if (game.releaseState === "unreleased") {
    return "unknown";
  }

  return state.user.gameStates[game.gameId]?.ownershipStatus ?? "unknown";
}

function isPlayableNow(entry: RankedSeedGame) {
  return (
    entry.game.releaseState === "released" &&
    entry.ownershipStatus === "owned" &&
    entry.platformAvailability !== "unavailable"
  );
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

    if (record.sentiment === "liked") {
      liked.set(game.primaryGenre, (liked.get(game.primaryGenre) ?? 0) + 1);
      if (game.series) {
        likedSeries.add(game.series);
      }
    }

    if (record.sentiment === "disliked") {
      disliked.set(game.primaryGenre, (disliked.get(game.primaryGenre) ?? 0) + 1);
    }
  });

  return {
    likedGenres: [...liked.keys()],
    dislikedGenres: [...disliked.keys()],
    likedSeries,
  };
}

function getPlatformAvailability(game: SeedGame, accessiblePlatformIds: Set<string>): PlatformAvailability {
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

  if (
    state.user.onboarding.likedGameIds.length >= 3 &&
    state.user.onboarding.dislikedGameIds.length >= 3
  ) {
    score += 1;
  }

  if (profile.signals.length >= 3) {
    score += 1;
  }

  if (likedGenres.includes(game.primaryGenre)) {
    score += 1;
  }

  if (platformAvailability !== "unknown") {
    score += 1;
  }

  if (score >= 4) return "high";
  if (score >= 2) return "medium";
  return "low";
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
  const ownershipStatus = getOwnershipStatus(state, game);
  const gameState = state.user.gameStates[game.gameId];
  let affinity = 18;
  let risk = 10;

  affinity += priorityValue(profile.priorities.story) * levelValue(game.storyStrength) * 4;
  affinity += priorityValue(profile.priorities.progression) * levelValue(game.progressionClarity) * 4;
  affinity += priorityValue(profile.priorities.hook) * levelValue(game.earlyHook) * 3;
  affinity += priorityValue(profile.priorities.aesthetic) * levelValue(game.aestheticFit) * 3;
  affinity += priorityValue(profile.priorities.emotional) * levelValue(game.emotionalComplexity) * 3;
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

  if (gameState?.status === "interested") {
    affinity += 6;
    fitReasons.push("Already saved as a title you want to keep in view");
  }

  if (profile.avoidPatterns.slowStart && (game.earlyHook === "low" || game.pacingSpeed === "slow")) {
    risk += 18;
    cautionReasons.push("Slow start risk is high for your current profile");
  }

  if (profile.avoidPatterns.repetition && game.endgameRepetitionRisk !== "low") {
    risk += game.endgameRepetitionRisk === "high" ? 22 : 12;
    cautionReasons.push("Repetition is one of the clearest early risk factors");
  }

  if (
    profile.avoidPatterns.confusingSystems &&
    game.progressionClarity === "low"
  ) {
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

  if (profile.watchVsPlayRisk === "high" && game.storyStrength === "high" && game.pacingSpeed === "slow") {
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

  if (platformAvailability === "unavailable") {
    risk += 30;
    cautionReasons.push("You do not currently have a mapped platform for this game");
  }

  if (game.releaseState === "unreleased") {
    risk += 25;
    cautionReasons.push("This title is not out yet, so it cannot be part of a right-now play decision");
  } else if (ownershipStatus !== "owned") {
    cautionReasons.push("Fit looks promising, but ownership is not confirmed yet");
  }

  return {
    game,
    affinityScore: clamp(affinity),
    riskScore: clamp(risk),
    confidence: confidenceFromProfile(game, state, profile, platformAvailability, likedGenres),
    fitReasons: uniq(fitReasons).slice(0, 4),
    cautionReasons: uniq(cautionReasons).slice(0, 4),
    platformAvailability,
    ownershipStatus,
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
      nextUp: null,
      avoid: null,
      resume: null,
      wishlistFit: null,
      playableAlternative: null,
    };
  }

  const ranked = games
    .map((game) => scoreSeedGame(game, state, profile, gamesById))
    .filter((entry) => {
      const stateEntry = state.user.gameStates[entry.game.gameId];

      if (stateEntry?.status === "completed") {
        return false;
      }

      if (stateEntry?.status === "dropped") {
        return false;
      }

      if (stateEntry?.sentiment === "liked" || stateEntry?.sentiment === "disliked") {
        return false;
      }

      if (entry.game.releaseState === "unreleased") {
        return false;
      }

      return true;
    });

  const currentRun =
    ranked
      .filter((entry) => state.user.gameStates[entry.game.gameId]?.status === "playing")
      .filter((entry) => entry.ownershipStatus === "owned")
      .sort((left, right) => right.affinityScore - left.affinityScore)[0] ?? null;

  const resume =
    ranked
      .filter(
        (entry) =>
          state.user.gameStates[entry.game.gameId]?.status === "on_hold" &&
          entry.ownershipStatus === "owned" &&
          entry.platformAvailability !== "unavailable",
      )
      .sort((left, right) => right.affinityScore - left.affinityScore)[0] ?? null;

  const ownedPlayableCandidates = ranked.filter((entry) => {
    const stateEntry = state.user.gameStates[entry.game.gameId];
    return (
      isPlayableNow(entry) &&
      stateEntry?.status !== "playing" &&
      stateEntry?.status !== "on_hold" &&
      stateEntry?.status !== "dismissed"
    );
  });

  const nextUp =
    ownedPlayableCandidates
      .sort((left, right) => {
        const leftInterested = state.user.gameStates[left.game.gameId]?.status === "interested" ? 1 : 0;
        const rightInterested = state.user.gameStates[right.game.gameId]?.status === "interested" ? 1 : 0;
        return (
          rightInterested - leftInterested ||
          right.affinityScore - left.affinityScore ||
          left.riskScore - right.riskScore
        );
      })[0] ?? null;

  const wishlistFit =
    ranked
      .filter((entry) => {
        const stateEntry = state.user.gameStates[entry.game.gameId];
        return (
          entry.ownershipStatus !== "owned" &&
          stateEntry?.status !== "playing" &&
          stateEntry?.status !== "on_hold" &&
          stateEntry?.status !== "dismissed"
        );
      })
      .sort((left, right) => {
        return (
          right.affinityScore - left.affinityScore ||
          left.riskScore - right.riskScore
        );
      })[0] ?? null;

  const playableAlternative =
    wishlistFit && nextUp ? nextUp : null;

  const avoid =
    ranked
      .filter((entry) => {
        const stateEntry = state.user.gameStates[entry.game.gameId];
    return (
      stateEntry?.status !== "dismissed" &&
      stateEntry?.status !== "playing" &&
      stateEntry?.sentiment !== "liked" &&
      entry.ownershipStatus === "owned" &&
      entry.riskScore >= 58
    );
  })
      .sort((left, right) => right.riskScore - left.riskScore)[0] ?? null;

  return {
    currentRun,
    nextUp,
    avoid,
    resume,
    wishlistFit,
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

export function searchSeedGames(
  games: SeedGame[],
  query: string,
  index: Fuse<SeedGame>,
) {
  const normalized = query.trim();

  if (!normalized) {
    return games.slice(0, 12);
  }

  return index.search(normalized).map((result) => result.item).slice(0, 12);
}
