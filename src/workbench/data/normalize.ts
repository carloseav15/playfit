import {
  buildCollectionsModel,
} from "../domain/collections";
import { buildUpcomingReleaseRecords } from "../domain/upcoming";
import {
  getBacklogPriorityReasons,
  getProfileMatchReasons,
  getTrapRiskReasons,
  getWatchRiskReasons,
  scoreBacklogPriority,
  scoreProfileMatch,
  scoreTrapRisk,
  scoreYoutubeRisk,
} from "../domain/scoring";

import type {
  AppData,
  BaseGameRecord,
  CatalogRow,
  GameRecord,
  OpinionRow,
  RawData,
  RecommendationRow,
  SessionCheckinRow,
} from "./schema";

function toNumber(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function mapByGameId<T extends { game_id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.game_id, row]));
}

function pickCanonicalPlayingGameId(
  opinions: OpinionRow[],
  franchiseProgress: RawData["franchiseProgress"],
) {
  const activeOpinions = opinions
    .filter((row) => row.status === "playing")
    .sort((left, right) => {
      const dateCompare = (right.last_updated ?? "").localeCompare(left.last_updated ?? "");
      return dateCompare !== 0
        ? dateCompare
        : right.opinion_id.localeCompare(left.opinion_id);
    });

  if (activeOpinions.length > 0) {
    return activeOpinions[0]?.game_id ?? null;
  }

  const activeFranchiseEntries = franchiseProgress
    .filter((row) => row.user_status === "playing" && row.mapped_game_id)
    .sort((left, right) => right.progress_id.localeCompare(left.progress_id));

  return activeFranchiseEntries[0]?.mapped_game_id ?? null;
}

function normalizeOpinionsForActiveRun(
  opinions: OpinionRow[],
  canonicalPlayingGameId: string | null,
) {
  if (!canonicalPlayingGameId) {
    return opinions;
  }

  return opinions.map((row) => {
    if (row.status !== "playing" || row.game_id === canonicalPlayingGameId) {
      return row;
    }

    return {
      ...row,
      status: "on_hold",
    };
  });
}

function normalizeFranchiseProgressForActiveRun(
  franchiseProgress: RawData["franchiseProgress"],
  canonicalPlayingGameId: string | null,
) {
  if (!canonicalPlayingGameId) {
    return franchiseProgress;
  }

  return franchiseProgress.map((row) => {
    if (!row.mapped_game_id) {
      return row;
    }

    if (row.mapped_game_id === canonicalPlayingGameId) {
      if (row.user_status === "playing") {
        return row;
      }

      return {
        ...row,
        user_status: "playing",
      };
    }

    if (row.user_status !== "playing") {
      return row;
    }

    return {
      ...row,
      user_status: "on_hold",
    };
  });
}

function mapCheckinsByGameId(rows: SessionCheckinRow[]) {
  const grouped = new Map<string, SessionCheckinRow[]>();
  const sortedRows = [...rows].sort((left, right) => {
    const dateCompare = right.checkin_date.localeCompare(left.checkin_date);
    return dateCompare !== 0
      ? dateCompare
      : right.checkin_id.localeCompare(left.checkin_id);
  });

  sortedRows.forEach((row) => {
    const existing = grouped.get(row.game_id) ?? [];
    existing.push(row);
    grouped.set(row.game_id, existing);
  });

  return grouped;
}

function collectGameIds(raw: RawData) {
  return new Set([
    ...raw.catalog.map((row) => row.game_id),
    ...raw.opinions.map((row) => row.game_id),
    ...raw.recommendations.map((row) => row.game_id),
    ...raw.checkins.map((row) => row.game_id),
  ]);
}

function fallbackTitle(gameId: string) {
  return gameId
    .split("_")
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function buildMatchedTraits(catalog?: CatalogRow, opinion?: OpinionRow) {
  const traits: string[] = [];

  if (!catalog) {
    return traits;
  }

  if (catalog.story_strength === "high") {
    traits.push("Strong story");
  }
  if (catalog.progression_clarity === "high") {
    traits.push("Clear progression");
  }
  if (catalog.early_hook === "high") {
    traits.push("Fast hook");
  }
  if (catalog.aesthetic_fit === "high") {
    traits.push("Strong identity");
  }
  if (catalog.emotional_complexity === "high") {
    traits.push("Emotional weight");
  }
  if (catalog.pacing_speed === "fast") {
    traits.push("Good momentum");
  }
  if (catalog.endgame_repetition_risk === "low") {
    traits.push("Low repetition");
  }
  if (catalog.primary_genre === "metroidvania") {
    traits.push("Metroidvania");
  }
  if (catalog.primary_genre === "survival_horror") {
    traits.push("Survival horror");
  }
  if (catalog.primary_genre === "detective_adventure") {
    traits.push("Investigation");
  }
  if (catalog.primary_genre === "arcade_racing") {
    traits.push("Arcade pace");
  }

  if (
    opinion?.status === "dropped_then_watched" ||
    opinion?.status === "completed_or_watched"
  ) {
    traits.push("Ended as a watch");
  }

  return traits.slice(0, 6);
}

function buildDecisionSummary(
  baseRecord: BaseGameRecord,
  backlogPriorityScore: number,
  trapRiskScore: number,
  watchRiskScore: number,
) {
  if (
    baseRecord.status === "playing" &&
    baseRecord.currentMomentum === "high" &&
    baseRecord.currentFriction !== "high"
  ) {
    return "Current momentum looks healthy. This is worth continuing before switching away.";
  }

  if (
    baseRecord.status === "playing" &&
    baseRecord.currentFriction === "high"
  ) {
    return "You are still in it, but recent sessions show friction. Continue only if the next session feels cleaner.";
  }

  if (
    baseRecord.status === "on_hold" &&
    ["immediate", "soon"].includes(baseRecord.currentReturnIntent)
  ) {
    return "Recent session memory suggests this is more resume-ready than a fresh blind pick.";
  }

  if (baseRecord.status === "completed" && backlogPriorityScore === 0) {
    return "Strong finished evidence in your profile.";
  }

  if (
    baseRecord.status === "dropped_then_watched" ||
    baseRecord.status === "completed_or_watched"
  ) {
    return "Strong concept or story pull, but the loop did not hold all the way through.";
  }

  if (backlogPriorityScore >= 75) {
    return "One of the strongest next-play candidates in the current database.";
  }

  if (baseRecord.status === "on_hold" && backlogPriorityScore >= 60) {
    return "Worth resuming when you want something familiar and promising.";
  }

  if (trapRiskScore >= 65 || watchRiskScore >= 65) {
    return "Interesting on paper, but there is clear risk of friction or stalling.";
  }

  return "Needs more timing or more evidence before it becomes a priority.";
}

function buildRecommendedAction(
  baseRecord: BaseGameRecord,
  backlogPriorityScore: number,
  trapRiskScore: number,
  watchRiskScore: number,
  fitEstimate?: number,
) {
  if (
    baseRecord.status === "playing" &&
    baseRecord.currentFriction === "high"
  ) {
    return "Continue carefully and check whether the next session feels less sticky.";
  }

  if (baseRecord.status === "playing") {
    return "Keep going. Momentum is already established.";
  }

  if (
    baseRecord.status === "on_hold" &&
    ["immediate", "soon"].includes(baseRecord.currentReturnIntent)
  ) {
    return "Resume this soon while the desire to come back is still active.";
  }

  if (baseRecord.status === "on_hold" && backlogPriorityScore >= 60) {
    return "Resume this when you want a reliable re-entry option.";
  }

  if (
    ["backlog", "interested_not_started"].includes(baseRecord.status) &&
    backlogPriorityScore >= 75
  ) {
    return "Prioritize this soon.";
  }

  if (
    baseRecord.status === "open" &&
    (fitEstimate ?? 0) >= 4 &&
    watchRiskScore < 60
  ) {
    return "Worth considering as a high-confidence recommendation.";
  }

  if (trapRiskScore >= 65 || watchRiskScore >= 65) {
    return "Approach carefully or wait for the right mood.";
  }

  return "Keep it in rotation, but not at the top of the queue.";
}

function createBaseRecord(
  gameId: string,
  catalog: CatalogRow | undefined,
  opinion: OpinionRow | undefined,
  recommendation: RecommendationRow | undefined,
  checkins: SessionCheckinRow[] | undefined,
  coverPath: string,
): BaseGameRecord {
  const gameCheckins = checkins ?? [];
  const latestCheckin = gameCheckins[0];

  return {
    gameId,
    title:
      opinion?.title ?? recommendation?.title ?? catalog?.title ?? fallbackTitle(gameId),
    series: catalog?.series ?? "",
    primaryGenre: catalog?.primary_genre ?? "",
    combatStyle: catalog?.combat_style ?? "",
    storyStrength: catalog?.story_strength ?? "",
    progressionClarity: catalog?.progression_clarity ?? "",
    earlyHook: catalog?.early_hook ?? "",
    aestheticFit: catalog?.aesthetic_fit ?? "",
    emotionalComplexity: catalog?.emotional_complexity ?? "",
    combatDepth: catalog?.combat_depth ?? "",
    endgameRepetitionRisk: catalog?.endgame_repetition_risk ?? "",
    pacingSpeed: catalog?.pacing_speed ?? "",
    catalogNotes: catalog?.notes ?? "",
    coverPath,
    opinion,
    recommendation,
    status: opinion?.status ?? recommendation?.status ?? "catalog_only",
    overallScore: toNumber(opinion?.overall_score),
    storyScore: toNumber(opinion?.story_score),
    progressionScore: toNumber(opinion?.progression_score),
    hookScore: toNumber(opinion?.hook_score),
    aestheticScore: toNumber(opinion?.aesthetic_score),
    emotionalScore: toNumber(opinion?.emotional_complexity_score),
    combatScore: toNumber(opinion?.combat_depth_score),
    repetitionPenalty: toNumber(opinion?.endgame_repetition_penalty),
    pacingScore: toNumber(opinion?.pacing_score),
    payoffScore: toNumber(opinion?.narrative_payoff_score),
    fitEstimate: toNumber(recommendation?.fit_estimate),
    checkins: gameCheckins,
    latestCheckin,
    sessionCount: gameCheckins.length,
    currentMood: latestCheckin?.mood ?? "",
    currentMomentum: latestCheckin?.momentum ?? "",
    currentFriction: latestCheckin?.friction ?? "",
    currentGuideUsage: latestCheckin?.used_guide ?? "",
    currentSessionOutcome: latestCheckin?.session_outcome ?? "",
    currentReturnIntent: latestCheckin?.return_intent ?? "",
    lastSessionDate: latestCheckin?.checkin_date ?? "",
    lastTouched:
      latestCheckin?.checkin_date ??
      opinion?.last_updated ??
      recommendation?.recommended_on ??
      "",
  };
}

function buildRecord(
  gameId: string,
  catalog: CatalogRow | undefined,
  opinion: OpinionRow | undefined,
  recommendation: RecommendationRow | undefined,
  checkins: SessionCheckinRow[] | undefined,
  coverPath: string,
): GameRecord {
  const baseRecord = createBaseRecord(
    gameId,
    catalog,
    opinion,
    recommendation,
    checkins,
    coverPath,
  );
  const profileMatchScore = scoreProfileMatch(baseRecord);
  const backlogPriorityScore = scoreBacklogPriority(baseRecord);
  const trapRiskScore = scoreTrapRisk(baseRecord);
  const watchRiskScore = scoreYoutubeRisk(baseRecord);

  return {
    ...baseRecord,
    matchedTraits: buildMatchedTraits(catalog, opinion),
    profileMatchScore,
    backlogPriorityScore,
    trapRiskScore,
    watchRiskScore,
    profileMatchReasons: getProfileMatchReasons(baseRecord),
    backlogPriorityReasons: getBacklogPriorityReasons(baseRecord),
    trapRiskReasons: getTrapRiskReasons(baseRecord),
    watchRiskReasons: getWatchRiskReasons(baseRecord),
    decisionSummary: buildDecisionSummary(
      baseRecord,
      backlogPriorityScore,
      trapRiskScore,
      watchRiskScore,
    ),
    recommendedAction: buildRecommendedAction(
      baseRecord,
      backlogPriorityScore,
      trapRiskScore,
      watchRiskScore,
      baseRecord.fitEstimate,
    ),
  };
}

export function normalizeData(raw: RawData): AppData {
  const canonicalPlayingGameId = pickCanonicalPlayingGameId(
    raw.opinions,
    raw.franchiseProgress,
  );
  const opinions = normalizeOpinionsForActiveRun(
    raw.opinions,
    canonicalPlayingGameId,
  );
  const franchiseProgress = normalizeFranchiseProgressForActiveRun(
    raw.franchiseProgress,
    canonicalPlayingGameId,
  );
  const catalogById = mapByGameId(raw.catalog);
  const opinionsById = mapByGameId(opinions);
  const recommendationsById = mapByGameId(raw.recommendations);
  const checkinsById = mapCheckinsByGameId(raw.checkins);
  const gameCoverById = mapByGameId(raw.gameCovers);

  const records = [...collectGameIds(raw)]
    .map((gameId) =>
      buildRecord(
        gameId,
        catalogById.get(gameId),
        opinionsById.get(gameId),
        recommendationsById.get(gameId),
        checkinsById.get(gameId),
        gameCoverById.get(gameId)?.cover_path ?? "",
      ),
    )
    .sort((left, right) => left.title.localeCompare(right.title));

  const { collections, collectionRails, franchiseShelves } = buildCollectionsModel(
    records,
    raw.franchiseMaster,
    franchiseProgress,
    raw.franchiseCovers,
    raw.gameCovers,
  );
  const upcomingReleaseRecords = buildUpcomingReleaseRecords(
    raw.upcomingReleases,
    raw.recommendations,
    collections,
    raw.platforms,
    raw.userPlatformAccess,
    raw.upcomingReleasePlatforms,
  );

  return {
    ...raw,
    opinions,
    franchiseProgress,
    records,
    upcomingReleaseRecords,
    collections,
    collectionRails,
    franchiseShelves,
  };
}
