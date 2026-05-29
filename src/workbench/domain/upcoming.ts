import type {
  BaseGameRecord,
  FranchiseCollection,
  PlatformRow,
  RecommendationRow,
  UpcomingReleasePlatformRow,
  UpcomingReleaseRecord,
  UpcomingReleaseRow,
  UserPlatformAccessRow,
} from "../data/schema";
import { getProfileMatchReasons, scoreProfileMatch } from "./scoring";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function sortPlatformMappings(
  rows: UpcomingReleasePlatformRow[],
  platformById: Map<string, PlatformRow>,
) {
  return [...rows].sort((left, right) => {
    const leftPlatform = platformById.get(left.platform_id);
    const rightPlatform = platformById.get(right.platform_id);

    return (
      left.sort_date.localeCompare(right.sort_date) ||
      toNumber(leftPlatform?.sort_order ?? "") - toNumber(rightPlatform?.sort_order ?? "") ||
      (leftPlatform?.display_name ?? left.platform_id).localeCompare(
        rightPlatform?.display_name ?? right.platform_id,
      )
    );
  });
}

function joinPlatformNames(platformIds: string[], platformById: Map<string, PlatformRow>) {
  const names = platformIds
    .map((platformId) => platformById.get(platformId)?.display_name ?? "")
    .filter(Boolean);

  return names.length > 0 ? names.join("; ") : "TBA";
}

function fitTier(score: number): UpcomingReleaseRecord["fitTier"] {
  if (score >= 75) {
    return "high";
  }

  if (score >= 55) {
    return "medium";
  }

  return "low";
}

function buildSyntheticRecord(row: UpcomingReleaseRow): BaseGameRecord {
  return {
    gameId: row.game_id,
    title: row.title,
    series: row.series,
    primaryGenre: row.primary_genre,
    combatStyle: row.combat_style,
    storyStrength: row.story_strength,
    progressionClarity: row.progression_clarity,
    earlyHook: row.early_hook,
    aestheticFit: row.aesthetic_fit,
    emotionalComplexity: row.emotional_complexity,
    combatDepth: row.combat_depth,
    endgameRepetitionRisk: row.endgame_repetition_risk,
    pacingSpeed: row.pacing_speed,
    catalogNotes: row.notes,
    coverPath: "",
    status: "catalog_only",
    checkins: [],
    sessionCount: 0,
    currentMood: "",
    currentMomentum: "",
    currentFriction: "",
    currentGuideUsage: "",
    currentSessionOutcome: "",
    currentReturnIntent: "",
    lastSessionDate: "",
    lastTouched: row.sort_date,
  };
}

export function buildUpcomingReleaseRecords(
  rows: UpcomingReleaseRow[],
  recommendations: RecommendationRow[],
  collections: FranchiseCollection[],
  platforms: PlatformRow[],
  userPlatformAccess: UserPlatformAccessRow[],
  upcomingReleasePlatforms: UpcomingReleasePlatformRow[],
) {
  const trackedSeries = new Set(
    collections
      .filter(
        (collection) =>
          collection.playedCount > 0 || collection.resumeCount > 0 || collection.cautionCount > 0,
      )
      .map((collection) => normalizeKey(collection.series)),
  );
  const openRecommendationsById = new Map(
    recommendations.filter((row) => row.status === "open").map((row) => [row.game_id, row]),
  );
  const platformById = new Map(platforms.map((row) => [row.platform_id, row]));
  const knownReleaseIds = new Set(rows.map((row) => row.release_id));
  const availablePlatformIds = new Set(
    userPlatformAccess
      .filter((row) => ["available", "limited"].includes(row.access_status))
      .map((row) => row.platform_id),
  );
  const releasePlatformsByReleaseId = new Map<string, UpcomingReleasePlatformRow[]>();
  const unknownAccessPlatformIds = [
    ...new Set(
      userPlatformAccess
        .map((row) => row.platform_id)
        .filter((platformId) => !platformById.has(platformId)),
    ),
  ];
  const unknownUpcomingPlatformIds = [
    ...new Set(
      upcomingReleasePlatforms
        .map((row) => row.platform_id)
        .filter((platformId) => !platformById.has(platformId)),
    ),
  ];
  const unknownReleaseIds = [
    ...new Set(
      upcomingReleasePlatforms
        .map((row) => row.release_id)
        .filter((releaseId) => !knownReleaseIds.has(releaseId)),
    ),
  ];

  if (unknownAccessPlatformIds.length > 0) {
    throw new Error(
      `user_platform_access.csv references unknown platform ids: ${unknownAccessPlatformIds.join(", ")}`,
    );
  }

  if (unknownUpcomingPlatformIds.length > 0) {
    throw new Error(
      `upcoming_release_platforms.csv references unknown platform ids: ${unknownUpcomingPlatformIds.join(", ")}`,
    );
  }

  if (unknownReleaseIds.length > 0) {
    throw new Error(
      `upcoming_release_platforms.csv references unknown release ids: ${unknownReleaseIds.join(", ")}`,
    );
  }

  upcomingReleasePlatforms.forEach((row) => {
    const existing = releasePlatformsByReleaseId.get(row.release_id) ?? [];
    existing.push(row);
    releasePlatformsByReleaseId.set(row.release_id, existing);
  });

  return [...rows]
    .map((row) => {
      const syntheticRecord = buildSyntheticRecord(row);
      const trackedUniverse = trackedSeries.has(normalizeKey(row.series));
      const openRecommendation = openRecommendationsById.get(row.game_id);
      const releasePlatforms = sortPlatformMappings(
        releasePlatformsByReleaseId.get(row.release_id) ?? [],
        platformById,
      );
      const reasons = getProfileMatchReasons(syntheticRecord);

      if (trackedUniverse) {
        reasons.unshift("Already tied to a universe you actively track");
      }

      if (openRecommendation) {
        reasons.unshift("Already supported by an open recommendation");
      }

      const predictedFitScore = clampScore(
        scoreProfileMatch(syntheticRecord) +
          (trackedUniverse ? 10 : 0) +
          (openRecommendation ? 8 : 0),
      );
      const fitReasons = [...new Set(reasons)].filter(Boolean).slice(0, 4);
      const derivedPlatformIds = [...new Set(releasePlatforms.map((item) => item.platform_id))];
      const derivedPlatforms = joinPlatformNames(derivedPlatformIds, platformById);
      const primaryRelease = releasePlatforms[0];

      return {
        releaseId: row.release_id,
        gameId: row.game_id,
        title: row.title,
        series: row.series,
        platforms: derivedPlatforms !== "TBA" ? derivedPlatforms : row.platforms || "TBA",
        sortDate: primaryRelease?.sort_date || row.sort_date || "9999-12-31",
        releaseLabel: primaryRelease?.release_label || row.release_label || "TBA",
        sourceRef: row.source_ref,
        notes: row.notes,
        predictedFitScore,
        fitTier: fitTier(predictedFitScore),
        fitReasons: fitReasons.length > 0 ? fitReasons : ["Early fit signal is still weak."],
        trackedUniverse,
        availableToUser: releasePlatforms.some((item) =>
          availablePlatformIds.has(item.platform_id),
        ),
      } satisfies UpcomingReleaseRecord;
    })
    .sort(
      (left, right) =>
        left.sortDate.localeCompare(right.sortDate) || left.title.localeCompare(right.title),
    );
}
