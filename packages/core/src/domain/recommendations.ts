import type {
  ProductConfidence,
  ProductProfile,
  ProductState,
  ProductTodayModel,
  RankedSeedGame,
  SeedGame,
} from "../types";

import {
  buildAccessiblePlatformIds,
  getAccessStatus,
  getPlatformAvailability,
  isPlayableNow,
} from "./recommendation-access";
import { buildTodayModel as buildTodayModelFromPipeline } from "./recommendation-model";
import {
  buildDislikedTagsFromProfile,
  buildLikedTagsFromProfile,
} from "./recommendation-profile-tags";

export {
  buildDislikedTagsFromProfile,
  buildLikedTagsFromProfile,
} from "./recommendation-profile-tags";
export { findSeriesGames, findSimilarGames } from "./recommendation-similarity";

// Scoring constants
export const HIGH_FRICTION_THRESHOLD = 58;
export const STRONG_FIT_THRESHOLD = 78;
export const PROMISING_FIT_THRESHOLD = 62;

const BASE_AFFINITY = 15;
const BASE_RISK = 10;
const MAX_AFFINITY_SCORE = 100;
const MAX_RISK_SCORE = 100;
const GENRE_MATCH_BONUS = 8;
const GENRE_MISMATCH_PENALTY = 6;
const SOULS_LIKE_RISK = 15;
const HORROR_RISK = 12;
const CONFIDENCE_HIGH_THRESHOLD = 6;
const CONFIDENCE_MEDIUM_THRESHOLD = 3;
const AFFINITY_MULTIPLIER: Record<ProductConfidence, number> = {
  low: 0.65,
  medium: 0.9,
  high: 1.0,
};
const CONFIDENCE_RANK: Record<ProductConfidence, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

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

// Snapshot of catalog-wide tag document frequency (from games_library.game_tags,
// taken 2026-07-05), used only as a fallback for tags outside TAG_WEIGHTS above.
// This mirrors games_library.refresh_tag_weights() in
// supabase/migrations/20260705020000_hybrid_tag_weights.sql: rarer tags carry
// more discriminating weight instead of every uncovered tag flattening to the
// same generic constant. This only affects fitReasons/cautionReasons copy --
// the real ranking similarity runs in SQL against the live tag_weights table,
// so this snapshot going slightly stale as the catalog grows is low-risk.
const TAG_DOCUMENT_FREQUENCY: Record<string, number> = {
  retro_revival: 23791,
  single_player: 12668,
  action_combat: 12492,
  story_rich: 11693,
  exploration: 7944,
  pick_up_and_play: 7659,
  online_multiplayer: 5259,
  indie: 5199,
  lore_heavy: 4722,
  racing: 4548,
  tactical: 4257,
  chill: 4213,
  short_sessions: 4128,
  "2d_flat": 4004,
  sandbox: 3827,
  puzzle: 3166,
  shooter: 2985,
  ranged_focused: 2388,
  platformer: 2379,
  "3d_cg": 2249,
  dark: 2171,
  cozy: 1906,
  atmospheric_audio: 1729,
  fantasy: 1606,
  horror: 1578,
  first_person: 1572,
  first_person_3d: 1570,
  whimsical: 1412,
  co_op: 1364,
  sci_fi: 1115,
  fighting: 1054,
  third_person: 953,
  third_person_3d: 925,
  comedy: 822,
  open_world: 791,
  lighthearted: 743,
  survival: 738,
  turn_based_combat: 698,
  top_down: 667,
  great_soundtrack: 609,
  branching_narrative: 579,
  demanding: 577,
  roguelike: 522,
  multiple_endings: 504,
  mmo: 442,
  side_scroller: 400,
  stealth: 397,
  stealth_combat: 391,
  high_replayability: 383,
  minimalist_story: 367,
  aaa_adjacent: 362,
  local_multiplayer: 359,
  bullet_hell: 352,
  vr: 350,
  post_apocalyptic: 319,
  cinematic: 299,
  crafting: 281,
  turn_based: 275,
  isometric: 236,
  metroidvania: 211,
  aaa: 205,
  base_building: 197,
  cyberpunk: 195,
  simulation: 190,
  experimental: 119,
  party: 114,
  historical: 105,
  souls_like: 91,
  competitive_multiplayer: 89,
  moddable: 88,
  pixel_art: 68,
  cel_shaded: 66,
  real_time: 40,
  deck_building: 37,
  hack_and_slash: 33,
  real_time_combat: 27,
  text_based: 27,
  long_sessions: 25,
  melee_focused: 20,
  parkour: 19,
  rhythm: 18,
  rhythm_combat: 10,
};
const TAG_DOCUMENT_FREQUENCY_TOTAL_GAMES = 65118;
const TAG_WEIGHT_MIN = 1.0;
const TAG_WEIGHT_MAX = 4.0;
const TAG_WEIGHT_IDF_SCALE = 0.45;

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

function clampWeight(value: number) {
  return Math.max(TAG_WEIGHT_MIN, Math.min(TAG_WEIGHT_MAX, value));
}

export function getTagWeight(tag: string): number {
  const curated = TAG_WEIGHTS[tag];
  if (curated !== undefined) return curated;

  const gameCount = TAG_DOCUMENT_FREQUENCY[tag] ?? 1;
  const idf = Math.log(TAG_DOCUMENT_FREQUENCY_TOTAL_GAMES / Math.max(gameCount, 1));
  return clampWeight(TAG_WEIGHT_MIN + TAG_WEIGHT_IDF_SCALE * idf);
}

function weightedCosineSimilarity(gameTags: string[], profileTags: Record<string, number>): number {
  let dotProduct = 0;
  let normGame = 0;
  let normProfile = 0;

  for (const tag of gameTags) {
    const weight = getTagWeight(tag);
    normGame += weight * weight;

    const profileCount = profileTags[tag] ?? 0;
    if (profileCount > 0) {
      const profileVal = profileCount * weight;
      dotProduct += weight * profileVal;
    }
  }

  for (const [tag, count] of Object.entries(profileTags)) {
    const weight = getTagWeight(tag);
    const profileVal = count * weight;
    normProfile += profileVal * profileVal;
  }

  if (normGame === 0 || normProfile === 0) {
    return 0;
  }

  // Regularize the game norm to reward games with more matching tags
  // and prevent high similarity scores for low-information (single-tag) games.
  const regularizedNormGame = Math.sqrt(normGame + 15.0);
  return dotProduct / (regularizedNormGame * Math.sqrt(normProfile));
}

export function scoreSeedGame(
  game: SeedGame,
  state: ProductState,
  profile: ProductProfile,
): RankedSeedGame {
  return scoreSeedGameWithContext(
    game,
    state,
    buildLikedTagsFromProfile(profile),
    buildDislikedTagsFromProfile(profile),
    buildAccessiblePlatformIds(state),
    profile,
  );
}

function scoreSeedGameWithContext(
  game: SeedGame,
  state: ProductState,
  likedTags: Record<string, number>,
  dislikedTags: Record<string, number>,
  accessiblePlatformIds: Set<string>,
  profile: ProductProfile,
): RankedSeedGame {
  const fitReasons: string[] = [];
  const cautionReasons: string[] = [];
  const platformAvailability = getPlatformAvailability(game, accessiblePlatformIds);
  const accessStatus = getAccessStatus(game, platformAvailability);
  const gameState = state.user.gameStates[game.gameId];
  const inBacklog = gameState?.inBacklog ?? false;
  const inWishlist = gameState?.inWishlist ?? false;
  const inPlayfitPicks = gameState?.inPlayfitPicks ?? false;
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
      inPlayfitPicks,
      similarGames: [],
    };
  }
  const gameTags = game.tags;
  const gameTagsByWeight = [...gameTags].sort((a, b) => getTagWeight(b) - getTagWeight(a));

  for (const tag of gameTagsByWeight) {
    const likedScore = likedTags[tag] ?? 0;
    if (likedScore > 0) {
      fitReasons.push(matchCopy(tag, confidence));
    }
  }

  for (const tag of gameTagsByWeight) {
    const dislikedScore = dislikedTags[tag] ?? 0;
    if (dislikedScore > 0) {
      cautionReasons.push(caveatCopy(tag, confidence));
    }
  }

  const similarityLiked = weightedCosineSimilarity(gameTags, likedTags);
  const similarityDisliked = weightedCosineSimilarity(gameTags, dislikedTags);

  let affinity = BASE_AFFINITY + similarityLiked * (MAX_AFFINITY_SCORE - BASE_AFFINITY);
  let risk = BASE_RISK + similarityDisliked * (MAX_RISK_SCORE - BASE_RISK);

  const genreKey = game.genreId ?? game.primaryGenre;
  if (profile.likedGenres.includes(genreKey)) {
    affinity += GENRE_MATCH_BONUS;
    fitReasons.push(`Genre match: ${formatTrait(genreKey)}`);
  }

  if (profile.avoidedGenres.includes(genreKey)) {
    risk += GENRE_MISMATCH_PENALTY;
    cautionReasons.push(`Genre caveat: ${formatTrait(genreKey)}`);
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
    cautionReasons.push(caveatCopy("horror", confidence));
  }

  affinity =
    BASE_AFFINITY + Math.round((affinity - BASE_AFFINITY) * AFFINITY_MULTIPLIER[confidence]);
  affinity = Math.min(affinity, MAX_AFFINITY_SCORE);

  risk = BASE_RISK + Math.round((risk - BASE_RISK) * AFFINITY_MULTIPLIER[confidence]);
  risk = Math.min(risk, MAX_RISK_SCORE);

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
    inPlayfitPicks,
    similarGames: [],
  };
}

export function buildTodayModel(
  games: SeedGame[],
  state: ProductState,
  profile: ProductProfile | null,
): ProductTodayModel {
  return buildTodayModelFromPipeline(games, state, profile, {
    buildAccessiblePlatformIds,
    buildDislikedTagsFromProfile,
    buildLikedTagsFromProfile,
    confidenceRank: CONFIDENCE_RANK,
    highFrictionThreshold: HIGH_FRICTION_THRESHOLD,
    isPlayableNow,
    isScoredGame,
    scoreSeedGameWithContext,
    sortPlayingNow,
  });
}
export {
  buildFinderIndex,
  findExactSeedGame,
  searchSeedGames,
} from "./search";
