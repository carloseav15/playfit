import Fuse from "fuse.js";
import { cosineSimilarity } from "../data/tags";
import type {
  GameAccessStatus,
  PlatformAvailability,
  ProductProfile,
  ProductState,
  ProductTodayModel,
  RankedSeedGame,
  SeedGame,
} from "../types";

// Scoring constants
export const HIGH_FRICTION_THRESHOLD = 58;
export const STRONG_FIT_THRESHOLD = 78;
export const PROMISING_FIT_THRESHOLD = 62;

const BASE_AFFINITY = 15;
const BASE_RISK = 10;
const MAX_AFFINITY_SCORE = 100;
const GENRE_MATCH_BONUS = 8;
const GENRE_MISMATCH_PENALTY = 6;
const BACKLOG_BONUS = 6;
const SOULS_LIKE_RISK = 15;
const HORROR_RISK = 12;
const DISLIKED_TAG_PENALTY_MULTIPLIER = 2;
const CONFIDENCE_HIGH_THRESHOLD = 6;
const CONFIDENCE_MEDIUM_THRESHOLD = 3;
const AFFINITY_MULTIPLIER: Record<string, number> = {
  low: 0.75,
  medium: 0.9,
  high: 1.0,
};

const SEARCH_KEYS = [
  { name: "title", weight: 0.7 },
  { name: "aliases", weight: 0.15 },
  { name: "series", weight: 0.1 },
  { name: "tags", weight: 0.05 },
];

const TAG_WEIGHTS: Record<string, number> = {
  story_rich: 3,
  lore_heavy: 2.5,
  minimalist_story: 1,
  branching_narrative: 3,
  text_based: 2,

  souls_like: 4,
  stealth: 3,
  puzzle: 2.5,
  rhythm: 2.5,
  tactical: 3,
  deck_building: 3,
  immersive_sim: 3.5,
  survival: 2.5,

  open_world: 2,
  linear: 1.5,
  hub_based: 1.5,
  roguelike: 2.5,
  metroidvania: 3,
  sandbox: 2,

  demanding: 3,
  unforgiving: 3.5,
  chill: 2.5,
  accessible: 2,

  short_sessions: 1,
  long_sessions: 1.5,
  pick_up_and_play: 2,

  dark: 1.5,
  lighthearted: 1.5,
  horror: 2.5,
  cozy: 2,
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function uniq(items: string[]) {
  return [...new Set(items)].filter(Boolean).slice(0, 4);
}

function isScoredGame(game: SeedGame) {
  return game.tags.length > 0;
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

function getTagWeight(tag: string): number {
  return TAG_WEIGHTS[tag] ?? 2;
}

function buildLikedTagsFromProfile(profile: ProductProfile) {
  return Object.fromEntries(
    Object.entries(profile.likedTags).filter(
      ([tag, count]) => count > (profile.dislikedTags[tag] ?? 0),
    ),
  );
}

function buildDislikedTagsFromProfile(profile: ProductProfile) {
  return Object.fromEntries(
    Object.entries(profile.dislikedTags).filter(
      ([tag, count]) => count > (profile.likedTags[tag] ?? 0),
    ),
  );
}

export function scoreSeedGame(
  game: SeedGame,
  state: ProductState,
  profile: ProductProfile,
  _gamesById: Map<string, SeedGame>,
): RankedSeedGame {
  const fitReasons: string[] = [];
  const cautionReasons: string[] = [];
  const accessiblePlatformIds = buildAccessiblePlatformIds(state);
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
      fitReasons: ["This game hasn't been categorized yet."],
      cautionReasons: ["We need more info before Playfit can recommend this game."],
      platformAvailability,
      accessStatus,
      inBacklog,
      inWishlist,
      similarGames: [],
    };
  }

  const likedTags = buildLikedTagsFromProfile(profile);
  const dislikedTags = buildDislikedTagsFromProfile(profile);
  const gameTags = game.tags;

  let affinity = BASE_AFFINITY;
  let risk = BASE_RISK;

  for (const tag of gameTags) {
    const weight = getTagWeight(tag);
    const likedScore = likedTags[tag] ?? 0;
    if (likedScore > 0) {
      const boost = likedScore * weight;
      affinity += boost;
      fitReasons.push(`You tend to like ${tag.replace(/_/g, " ")}`);
    }
  }

  for (const tag of gameTags) {
    const dislikedScore = dislikedTags[tag] ?? 0;
    if (dislikedScore > 0) {
      const penalty = dislikedScore * getTagWeight(tag) * DISLIKED_TAG_PENALTY_MULTIPLIER;
      risk += penalty;
      cautionReasons.push(`You tend to dislike ${tag.replace(/_/g, " ")}`);
    }
  }

  if (profile.likedGenres.includes(game.primaryGenre)) {
    affinity += GENRE_MATCH_BONUS;
    fitReasons.push("Matches a genre already visible in your library");
  }

  if (profile.avoidedGenres.includes(game.primaryGenre)) {
    affinity -= GENRE_MISMATCH_PENALTY;
    cautionReasons.push("Shares genre overlap with games that already failed for you");
  }

  if (inBacklog) {
    affinity += BACKLOG_BONUS;
    fitReasons.push("Already saved as a title you want to keep in view");
  }

  if (gameTags.includes("souls_like") && gameTags.includes("demanding")) {
    const dislikedCombo = (dislikedTags.souls_like ?? 0) + (dislikedTags.demanding ?? 0);
    if (dislikedCombo > 0) {
      risk += SOULS_LIKE_RISK;
      cautionReasons.push("High difficulty + souls-like pattern may not fit your preferences");
    }
  }

  if (dislikedTags.horror > 0 && (gameTags.includes("horror") || gameTags.includes("dark"))) {
    risk += HORROR_RISK;
  }

  const ratedCount = profile.ratedCount ?? 0;
  let confidence: RankedSeedGame["confidence"] = "low";
  if (ratedCount >= CONFIDENCE_HIGH_THRESHOLD) confidence = "high";
  else if (ratedCount >= CONFIDENCE_MEDIUM_THRESHOLD) confidence = "medium";

  affinity =
    BASE_AFFINITY + Math.round((affinity - BASE_AFFINITY) * AFFINITY_MULTIPLIER[confidence]);
  affinity = Math.min(affinity, MAX_AFFINITY_SCORE);

  return {
    game,
    affinityScore: clamp(affinity),
    riskScore: clamp(risk),
    confidence,
    fitReasons: uniq(fitReasons).slice(0, 4),
    cautionReasons: uniq(cautionReasons).slice(0, 4),
    platformAvailability,
    accessStatus,
    inBacklog,
    inWishlist,
    similarGames: [],
  };
}

export function findSimilarGames(game: SeedGame, allGames: SeedGame[], limit = 5): SeedGame[] {
  return allGames
    .filter((g) => g.gameId !== game.gameId && isScoredGame(g))
    .map((g) => ({
      game: g,
      similarity: cosineSimilarity(game.tags, g.tags),
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, limit)
    .map((entry) => entry.game);
}

export function buildTodayModel(
  games: SeedGame[],
  state: ProductState,
  profile: ProductProfile | null,
  gamesById: Map<string, SeedGame>,
): ProductTodayModel {
  if (!profile) {
    return { currentRun: [], nextUp: [], resume: [] };
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

      if (stateEntry?.excluded) {
        return false;
      }

      return true;
    });

  const currentRun = ranked
    .filter((entry) => state.user.gameStates[entry.game.gameId]?.status === "playing")
    .sort(sortPlayingNow(state));

  const resume = ranked
    .filter(
      (entry) =>
        (state.user.gameStates[entry.game.gameId]?.status === "on_hold" ||
          state.user.gameStates[entry.game.gameId]?.status === "shelved") &&
        entry.accessStatus === "playable",
    )
    .sort((left, right) => right.affinityScore - left.affinityScore)
    .slice(0, 10);

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

  const nextUp = sortedPlayable.slice(0, 10);

  return { currentRun, nextUp, resume };
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
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return (
    games.find((game) => game.title.toLowerCase() === normalized) ??
    games.find((game) => game.aliases?.some((alias) => alias.toLowerCase() === normalized)) ??
    games.find((game) => game.series.toLowerCase() === normalized) ??
    null
  );
}
