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

const LOW_QUALITY_SEARCH_TERMS = [
  "bonus disc",
  "classic nes series",
  "collector's edition",
  "demo",
  "demo disc",
  "not for resale",
  "picross",
  "soundtrack",
  "wii u",
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

function formatTrait(value: string) {
  return value.replace(/[_;]+/g, " ").replace(/\s+/g, " ").trim();
}

function confidenceFromRatings(ratedCount: number): RankedSeedGame["confidence"] {
  if (ratedCount >= CONFIDENCE_HIGH_THRESHOLD) return "high";
  if (ratedCount >= CONFIDENCE_MEDIUM_THRESHOLD) return "medium";
  return "low";
}

function matchCopy(tag: string, confidence: RankedSeedGame["confidence"]) {
  const label = formatTrait(tag);
  if (confidence === "high") return `Strong history with ${label}`;
  if (confidence === "medium") return `Emerging pattern around ${label}`;
  return `Early signal around ${label}`;
}

function caveatCopy(tag: string, confidence: RankedSeedGame["confidence"]) {
  const label = formatTrait(tag);
  if (confidence === "high") return `Strong watch-out around ${label}`;
  if (confidence === "medium") return `Emerging watch-out around ${label}`;
  return `Early caveat around ${label}`;
}

function normalizeSearchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function directSearchScore(game: SeedGame, query: string) {
  const title = normalizeSearchText(game.title);
  const series = normalizeSearchText(game.series);
  const aliases = game.aliases?.map(normalizeSearchText) ?? [];

  if (title === query) return 160;
  if (aliases.some((alias) => alias === query)) return 150;
  if (series === query) return 138;
  if (title.startsWith(query)) return 126;
  if (aliases.some((alias) => alias.startsWith(query))) return 116;
  if (series.startsWith(query)) return 108;
  if (title.includes(query)) return 96;
  if (aliases.some((alias) => alias.includes(query))) return 88;
  if (series.includes(query)) return 78;
  return 0;
}

function searchQualityPenalty(game: SeedGame) {
  const searchable = normalizeSearchText(
    [game.title, game.series, ...(game.aliases ?? [])].join(" "),
  );
  let penalty = 0;

  for (const term of LOW_QUALITY_SEARCH_TERMS) {
    if (searchable.includes(normalizeSearchText(term))) {
      penalty += 22;
    }
  }

  if (!isScoredGame(game)) penalty += 20;
  if (game.primaryGenre === "unknown") penalty += 16;
  if (!game.coverPath) penalty += 6;

  return penalty;
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
): RankedSeedGame {
  const fitReasons: string[] = [];
  const cautionReasons: string[] = [];
  const accessiblePlatformIds = buildAccessiblePlatformIds(state);
  const platformAvailability = getPlatformAvailability(game, accessiblePlatformIds);
  const accessStatus = getAccessStatus(game, platformAvailability);
  const gameState = state.user.gameStates[game.gameId];
  const inBacklog = gameState?.inBacklog ?? false;
  const inWishlist = gameState?.inWishlist ?? false;
  const ratedCount = profile.ratedCount ?? 0;
  const confidence = confidenceFromRatings(ratedCount);

  if (!isScoredGame(game)) {
    return {
      game,
      affinityScore: 0,
      riskScore: 0,
      confidence: "low",
      fitReasons: ["This record needs better catalog data."],
      cautionReasons: ["No reliable call yet."],
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
      fitReasons.push(matchCopy(tag, confidence));
    }
  }

  for (const tag of gameTags) {
    const dislikedScore = dislikedTags[tag] ?? 0;
    if (dislikedScore > 0) {
      const penalty = dislikedScore * getTagWeight(tag) * DISLIKED_TAG_PENALTY_MULTIPLIER;
      risk += penalty;
      cautionReasons.push(caveatCopy(tag, confidence));
    }
  }

  if (profile.likedGenres.includes(game.primaryGenre)) {
    affinity += GENRE_MATCH_BONUS;
    fitReasons.push(`Genre match: ${formatTrait(game.primaryGenre)}`);
  }

  if (profile.avoidedGenres.includes(game.primaryGenre)) {
    affinity -= GENRE_MISMATCH_PENALTY;
    cautionReasons.push(`Genre caveat: ${formatTrait(game.primaryGenre)}`);
  }

  if (inBacklog) {
    affinity += BACKLOG_BONUS;
    fitReasons.push("Already on your radar");
  }

  if (gameTags.includes("souls_like") && gameTags.includes("demanding")) {
    const dislikedCombo = (dislikedTags.souls_like ?? 0) + (dislikedTags.demanding ?? 0);
    if (dislikedCombo > 0) {
      risk += SOULS_LIKE_RISK;
      cautionReasons.push("Difficulty curve may get in the way");
    }
  }

  if (dislikedTags.horror > 0 && (gameTags.includes("horror") || gameTags.includes("dark"))) {
    risk += HORROR_RISK;
  }

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
): ProductTodayModel {
  if (!profile) {
    return { currentRun: [], nextUp: [], resume: [] };
  }

  const ranked = games
    .filter(isScoredGame)
    .map((game) => scoreSeedGame(game, state, profile))
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
  const normalized = normalizeSearchText(query);

  if (!normalized) {
    return [...games]
      .filter(isScoredGame)
      .sort((left, right) => searchQualityPenalty(left) - searchQualityPenalty(right))
      .slice(0, 12);
  }

  const scored = new Map<string, { game: SeedGame; score: number }>();

  for (const game of games) {
    const directScore = directSearchScore(game, normalized);
    if (directScore > 0) {
      scored.set(game.gameId, {
        game,
        score: directScore - searchQualityPenalty(game),
      });
    }
  }

  for (const result of index.search(normalized)) {
    const current = scored.get(result.item.gameId);
    const fuzzyScore =
      72 - Math.round((result.score ?? 1) * 60) - searchQualityPenalty(result.item);
    scored.set(result.item.gameId, {
      game: result.item,
      score: Math.max(current?.score ?? Number.NEGATIVE_INFINITY, fuzzyScore),
    });
  }

  return [...scored.values()]
    .sort(
      (left, right) => right.score - left.score || left.game.title.localeCompare(right.game.title),
    )
    .map(({ game }) => game)
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
