import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import Papa from "papaparse";

import { validateCsv, writeCsv } from "./lib/csv.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const personalDataDir = path.join(rootDir, "data", "personal");

const PLATFORM_COLUMNS = [
  "platform_id",
  "display_name",
  "family",
  "vendor",
  "generation",
  "kind",
  "sort_order",
  "active_status",
  "notes",
];

const MASTER_COLUMNS = [
  "game_id",
  "title",
  "series",
  "platforms",
  "release_year",
  "primary_genre",
  "combat_style",
  "story_strength",
  "progression_clarity",
  "early_hook",
  "aesthetic_fit",
  "emotional_complexity",
  "combat_depth",
  "endgame_repetition_risk",
  "pacing_speed",
  "universe_status",
  "source_type",
  "notes",
];

const UPCOMING_COLUMNS = [
  "release_id",
  "game_id",
  "title",
  "series",
  "platforms",
  "sort_date",
  "release_label",
  "primary_genre",
  "combat_style",
  "story_strength",
  "progression_clarity",
  "early_hook",
  "aesthetic_fit",
  "emotional_complexity",
  "combat_depth",
  "endgame_repetition_risk",
  "pacing_speed",
  "source_ref",
  "notes",
];

const GAME_PLATFORM_COLUMNS = [
  "mapping_id",
  "game_id",
  "platform_id",
  "availability_status",
  "source_type",
  "source_ref",
  "notes",
];

const UPCOMING_PLATFORM_COLUMNS = [
  "release_platform_id",
  "release_id",
  "platform_id",
  "sort_date",
  "release_label",
  "source_ref",
  "notes",
];

function parseCsv(text, fileName, columns) {
  validateCsv(text, columns, fileName);
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  return parsed.data.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key.trim(), value?.trim?.() ?? ""]),
    ),
  );
}

async function readCsv(fileName, columns) {
  const filePath = path.join(personalDataDir, fileName);
  const text = await readFile(filePath, "utf8");
  return parseCsv(text, fileName, columns);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function sortPlatformRows(rows, platformById) {
  return [...rows].sort((left, right) => {
    const leftPlatform = platformById.get(left.platform_id);
    const rightPlatform = platformById.get(right.platform_id);

    return (
      toNumber(leftPlatform?.sort_order ?? "") - toNumber(rightPlatform?.sort_order ?? "") ||
      (leftPlatform?.display_name ?? left.platform_id).localeCompare(
        rightPlatform?.display_name ?? right.platform_id,
      ) ||
      left.platform_id.localeCompare(right.platform_id)
    );
  });
}

function joinPlatformNames(rows, platformById) {
  const uniqueRows = [...new Map(rows.map((row) => [row.platform_id, row])).values()];
  const names = sortPlatformRows(uniqueRows, platformById)
    .map((row) => platformById.get(row.platform_id)?.display_name ?? "")
    .filter(Boolean);

  return names.length > 0 ? names.join("; ") : "TBA";
}

function sortUpcomingPlatformRows(rows, platformById) {
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

function groupBy(rows, key) {
  const grouped = new Map();

  rows.forEach((row) => {
    const rowsForKey = grouped.get(row[key]) ?? [];
    rowsForKey.push(row);
    grouped.set(row[key], rowsForKey);
  });

  return grouped;
}

function assertKnownReferences({
  platforms,
  catalogRows,
  masterRows,
  upcomingRows,
  gamePlatforms,
  upcomingPlatformRows,
}) {
  const platformIds = new Set(platforms.map((row) => row.platform_id));
  const knownGameIds = new Set([
    ...catalogRows.map((row) => row.game_id),
    ...masterRows.map((row) => row.game_id),
  ]);
  const knownReleaseIds = new Set(upcomingRows.map((row) => row.release_id));

  const unknownGamePlatformIds = [...new Set(
    gamePlatforms
      .map((row) => row.platform_id)
      .filter((platformId) => !platformIds.has(platformId)),
  )];
  const unknownGameIds = [...new Set(
    gamePlatforms
      .map((row) => row.game_id)
      .filter((gameId) => !knownGameIds.has(gameId)),
  )];
  const unknownUpcomingPlatformIds = [...new Set(
    upcomingPlatformRows
      .map((row) => row.platform_id)
      .filter((platformId) => !platformIds.has(platformId)),
  )];
  const unknownReleaseIds = [...new Set(
    upcomingPlatformRows
      .map((row) => row.release_id)
      .filter((releaseId) => !knownReleaseIds.has(releaseId)),
  )];
  const unknownUpcomingGameIds = [...new Set(
    upcomingRows
      .map((row) => row.game_id)
      .filter((gameId) => !knownGameIds.has(gameId)),
  )];

  if (unknownGamePlatformIds.length > 0) {
    throw new Error(
      `game_platforms.csv references unknown platform ids: ${unknownGamePlatformIds.join(", ")}`,
    );
  }

  if (unknownGameIds.length > 0) {
    throw new Error(
      `game_platforms.csv references unknown game ids: ${unknownGameIds.join(", ")}`,
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

  if (unknownUpcomingGameIds.length > 0) {
    throw new Error(
      `upcoming_releases.csv references unknown game ids: ${unknownUpcomingGameIds.join(", ")}`,
    );
  }
}

async function main() {
  const [
    platforms,
    catalogRows,
    masterRows,
    upcomingRows,
    gamePlatforms,
    upcomingPlatformRows,
  ] = await Promise.all([
    readCsv("platforms.csv", PLATFORM_COLUMNS),
    readCsv("games_catalog.csv", [
      "game_id",
      "title",
      "series",
      "primary_genre",
      "combat_style",
      "story_strength",
      "progression_clarity",
      "early_hook",
      "aesthetic_fit",
      "emotional_complexity",
      "combat_depth",
      "endgame_repetition_risk",
      "pacing_speed",
      "notes",
    ]),
    readCsv("master_game_universe.csv", MASTER_COLUMNS),
    readCsv("upcoming_releases.csv", UPCOMING_COLUMNS),
    readCsv("game_platforms.csv", GAME_PLATFORM_COLUMNS),
    readCsv("upcoming_release_platforms.csv", UPCOMING_PLATFORM_COLUMNS),
  ]);

  assertKnownReferences({
    platforms,
    catalogRows,
    masterRows,
    upcomingRows,
    gamePlatforms,
    upcomingPlatformRows,
  });

  const platformById = new Map(platforms.map((row) => [row.platform_id, row]));
  const gamePlatformsByGameId = groupBy(gamePlatforms, "game_id");
  const upcomingPlatformsByReleaseId = groupBy(upcomingPlatformRows, "release_id");

  const syncedMasterRows = masterRows.map((row) => ({
    ...row,
    platforms: joinPlatformNames(gamePlatformsByGameId.get(row.game_id) ?? [], platformById),
  }));

  const syncedUpcomingRows = upcomingRows.map((row) => {
    const releasePlatforms = sortUpcomingPlatformRows(
      upcomingPlatformsByReleaseId.get(row.release_id) ?? [],
      platformById,
    );
    const primaryRelease = releasePlatforms[0];

    return {
      ...row,
      platforms: joinPlatformNames(releasePlatforms, platformById),
      sort_date: primaryRelease?.sort_date ?? row.sort_date,
      release_label: primaryRelease?.release_label ?? row.release_label,
    };
  });

  await Promise.all([
    writeCsv(path.join(personalDataDir, "master_game_universe.csv"), syncedMasterRows, MASTER_COLUMNS),
    writeCsv(path.join(personalDataDir, "upcoming_releases.csv"), syncedUpcomingRows, UPCOMING_COLUMNS),
  ]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
