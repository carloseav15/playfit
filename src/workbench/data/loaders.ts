import Papa from "papaparse";

import {
  DATA_FILES,
  REQUIRED_HEADERS,
  type CatalogRow,
  type DatasetKey,
  type FranchiseCoverRow,
  type FranchiseMasterRow,
  type FranchiseProgressRow,
  type GamePlatformRow,
  type GameCoverRow,
  type OpinionRow,
  type PlatformRow,
  type ProfileRow,
  type RawData,
  type RecommendationRow,
  type SessionCheckinRow,
  type UpcomingReleasePlatformRow,
  type UpcomingReleaseRow,
  type UserPlatformAccessRow,
} from "./schema";

type ParsedRow = Record<string, string>;

const DEFAULT_WORKBENCH_DATA_BASE = `${import.meta.env.BASE_URL}data/personal/`;

function getDataBaseUrl() {
  const configured = import.meta.env.VITE_WORKBENCH_DATA_BASE as string | undefined;
  const base = configured?.trim() || DEFAULT_WORKBENCH_DATA_BASE;
  return base.endsWith("/") ? base : `${base}/`;
}

function getDatasetUrl(file: string) {
  return `${getDataBaseUrl()}${file}`;
}

async function loadCsvText(file: string) {
  const response = await fetch(getDatasetUrl(file), { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Could not load ${file}`);
  }

  return response.text();
}

function sanitizeRow(row: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.trim(), value?.trim?.() ?? ""]),
  );
}

function parseCsv<T>(
  text: string,
  datasetKey: DatasetKey,
): T[] {
  const result = Papa.parse<ParsedRow>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header: string) => header.trim(),
    transform: (value: string) => value.trim(),
  });

  if (result.errors.length > 0) {
    const firstError = result.errors[0];
    throw new Error(
      `Could not parse ${DATA_FILES[datasetKey]}: ${firstError.message}`,
    );
  }

  const headers = result.meta.fields ?? [];
  const missingHeaders = REQUIRED_HEADERS[datasetKey].filter(
    (header) => !headers.includes(header),
  );

  if (missingHeaders.length > 0) {
    throw new Error(
      `${DATA_FILES[datasetKey]} is missing expected columns: ${missingHeaders.join(", ")}`,
    );
  }

  return result.data.map((row: ParsedRow) => sanitizeRow(row) as T);
}

export async function loadRawData(): Promise<RawData> {
  const [
    profileText,
    catalogText,
    upcomingReleasesText,
    platformsText,
    userPlatformAccessText,
    gamePlatformsText,
    upcomingReleasePlatformsText,
    opinionsText,
    recommendationsText,
    checkinsText,
    franchiseMasterText,
    franchiseProgressText,
    franchiseCoversText,
    gameCoversText,
  ] =
    await Promise.all(
      Object.values(DATA_FILES).map((file) => loadCsvText(file)),
    );

  return {
    profile: parseCsv<ProfileRow>(profileText, "profile"),
    catalog: parseCsv<CatalogRow>(catalogText, "catalog"),
    upcomingReleases: parseCsv<UpcomingReleaseRow>(
      upcomingReleasesText,
      "upcomingReleases",
    ),
    platforms: parseCsv<PlatformRow>(platformsText, "platforms"),
    userPlatformAccess: parseCsv<UserPlatformAccessRow>(
      userPlatformAccessText,
      "userPlatformAccess",
    ),
    gamePlatforms: parseCsv<GamePlatformRow>(
      gamePlatformsText,
      "gamePlatforms",
    ),
    upcomingReleasePlatforms: parseCsv<UpcomingReleasePlatformRow>(
      upcomingReleasePlatformsText,
      "upcomingReleasePlatforms",
    ),
    opinions: parseCsv<OpinionRow>(opinionsText, "opinions"),
    recommendations: parseCsv<RecommendationRow>(
      recommendationsText,
      "recommendations",
    ),
    checkins: parseCsv<SessionCheckinRow>(checkinsText, "checkins"),
    franchiseMaster: parseCsv<FranchiseMasterRow>(
      franchiseMasterText,
      "franchiseMaster",
    ),
    franchiseProgress: parseCsv<FranchiseProgressRow>(
      franchiseProgressText,
      "franchiseProgress",
    ),
    franchiseCovers: parseCsv<FranchiseCoverRow>(
      franchiseCoversText,
      "franchiseCovers",
    ),
    gameCovers: parseCsv<GameCoverRow>(gameCoversText, "gameCovers"),
  };
}
