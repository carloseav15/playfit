import type { Level, Pace } from "../taste-types";
import type { ProductPlatformOption, ProductSeedData, SeedGame } from "../types";
import { loadCsvText, type ProductDataFile, parseCsv } from "./csv";

interface CatalogCsvRow {
  game_id: string;
  title: string;
  series: string;
  primary_genre: string;
  combat_style: string;
  story_strength: Level;
  progression_clarity: Level;
  early_hook: Level;
  aesthetic_fit: Level;
  emotional_complexity: Level;
  combat_depth: Level;
  endgame_repetition_risk: Level;
  pacing_speed: Pace;
  notes: string;
}

interface GameCoverCsvRow {
  asset_id: string;
  game_id: string;
  title: string;
  source_type: string;
  source_ref: string;
  cover_path: string;
  resolved_image_url: string;
  download_status: string;
  notes: string;
}

interface GamePlatformCsvRow {
  mapping_id: string;
  game_id: string;
  platform_id: string;
  availability_status: string;
  source_type: string;
  source_ref: string;
  notes: string;
}

interface GameUniverseCsvRow {
  game_id: string;
  title: string;
  aliases: string;
  series: string;
  release_year: string;
  release_state: string;
  primary_genre: string;
  platforms: string;
  source_type: string;
  source_id: string;
  cover_url: string;
  notes: string;
}

interface PlatformCsvRow {
  platform_id: string;
  display_name: string;
  family: string;
  vendor: string;
  generation: string;
  kind: string;
  sort_order: string;
  active_status: string;
  notes: string;
}

interface UpcomingReleaseCsvRow {
  release_id: string;
  game_id: string;
  title: string;
  series: string;
  platforms: string;
  sort_date: string;
  release_label: string;
  primary_genre: string;
  combat_style: string;
  story_strength: Level;
  progression_clarity: Level;
  early_hook: Level;
  aesthetic_fit: Level;
  emotional_complexity: Level;
  combat_depth: Level;
  endgame_repetition_risk: Level;
  pacing_speed: Pace;
  source_ref: string;
  notes: string;
}

interface MasterGameUniverseRow {
  game_id: string;
  title: string;
  series: string;
  platforms: string;
  release_year: string;
  primary_genre: string;
  combat_style: string;
  story_strength: Level;
  progression_clarity: Level;
  early_hook: Level;
  aesthetic_fit: Level;
  emotional_complexity: Level;
  combat_depth: Level;
  endgame_repetition_risk: Level;
  pacing_speed: Pace;
  universe_status: string;
  source_type: string;
  notes: string;
}

const CATALOG_HEADERS = [
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
];

const COVER_HEADERS = [
  "asset_id",
  "game_id",
  "title",
  "source_type",
  "source_ref",
  "cover_path",
  "resolved_image_url",
  "download_status",
  "notes",
];

const PLATFORM_HEADERS = [
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

const GAME_PLATFORM_HEADERS = [
  "mapping_id",
  "game_id",
  "platform_id",
  "availability_status",
  "source_type",
  "source_ref",
  "notes",
];

const GAME_UNIVERSE_HEADERS = [
  "game_id",
  "title",
  "aliases",
  "series",
  "release_year",
  "release_state",
  "primary_genre",
  "platforms",
  "source_type",
  "source_id",
  "cover_url",
  "notes",
];

const MASTER_HEADERS = [
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

const UPCOMING_HEADERS = [
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

function toNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function sortPlatformNames(
  rows: GamePlatformCsvRow[],
  platformById: Map<string, ProductPlatformOption>,
) {
  return [...rows].sort((left, right) => {
    const leftPlatform = platformById.get(left.platform_id);
    const rightPlatform = platformById.get(right.platform_id);

    return (
      (leftPlatform?.sortOrder ?? Number.MAX_SAFE_INTEGER) -
        (rightPlatform?.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
      (leftPlatform?.displayName ?? left.platform_id).localeCompare(
        rightPlatform?.displayName ?? right.platform_id,
      )
    );
  });
}

function splitList(value: string) {
  return value
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function inferPlatformIds(
  platformNames: string[],
  platformById: Map<string, ProductPlatformOption>,
) {
  const normalizedByName = new Map(
    [...platformById.values()].map((platform) => [
      platform.displayName.toLowerCase(),
      platform.platformId,
    ]),
  );

  const inferred = platformNames
    .map((platform) => {
      const normalized = platform.toLowerCase();
      if (normalizedByName.has(normalized)) return normalizedByName.get(normalized);
      if (
        normalized.includes("pc") ||
        normalized.includes("windows") ||
        normalized.includes("mac") ||
        normalized.includes("linux")
      )
        return "pc";
      if (normalized.includes("playstation 5") || normalized === "ps5") return "ps5";
      if (normalized.includes("xbox series")) return "xbox_series_xs";
      if (normalized.includes("switch 2")) return "switch_2";
      if (normalized.includes("switch")) return "switch_1";
      return null;
    })
    .filter((platformId): platformId is string => Boolean(platformId));

  return [...new Set(inferred)];
}

function buildSeedGame(
  row: CatalogCsvRow | MasterGameUniverseRow,
  source: SeedGame["source"],
  coverByGameId: Map<string, string>,
  gamePlatformsById: Map<string, GamePlatformCsvRow[]>,
  platformById: Map<string, ProductPlatformOption>,
  releaseState: SeedGame["releaseState"],
  upcomingByGameId?: Map<string, UpcomingReleaseCsvRow>,
) {
  const platformRows = sortPlatformNames(gamePlatformsById.get(row.game_id) ?? [], platformById);
  const fallbackPlatforms =
    "platforms" in row && row.platforms && row.platforms !== "TBA" ? splitList(row.platforms) : [];
  const platformNames =
    platformRows.length > 0
      ? [
          ...new Set(
            platformRows.map((entry) => platformById.get(entry.platform_id)?.displayName ?? ""),
          ),
        ].filter(Boolean)
      : fallbackPlatforms;

  const upcomingRow = upcomingByGameId?.get(row.game_id);

  return {
    gameId: row.game_id,
    title: row.title,
    aliases: [],
    series: row.series,
    source,
    scoringStatus: "scored",
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
    notes: row.notes,
    coverPath: coverByGameId.get(row.game_id) ?? "",
    releaseYear: "release_year" in row ? row.release_year : "",
    sourceRef: "",
    availablePlatformIds: [...new Set(platformRows.map((entry) => entry.platform_id))],
    availablePlatformNames: platformNames,
    releaseState,
    sortDate: upcomingRow?.sort_date,
    releaseLabel: upcomingRow?.release_label,
  } satisfies SeedGame;
}

function buildBasicUniverseGame(
  row: GameUniverseCsvRow,
  coverByGameId: Map<string, string>,
  platformById: Map<string, ProductPlatformOption>,
) {
  const platformNames = splitList(row.platforms);
  const releaseState = row.release_state === "unreleased" ? "unreleased" : "released";

  return {
    gameId: row.game_id,
    title: row.title,
    aliases: splitList(row.aliases),
    series: row.series,
    source: "finder",
    scoringStatus: "basic",
    primaryGenre: row.primary_genre || "unknown",
    combatStyle: "unknown",
    storyStrength: "medium",
    progressionClarity: "medium",
    earlyHook: "medium",
    aestheticFit: "medium",
    emotionalComplexity: "medium",
    combatDepth: "medium",
    endgameRepetitionRisk: "medium",
    pacingSpeed: "medium",
    notes: row.notes,
    coverPath: coverByGameId.get(row.game_id) ?? "",
    externalCoverUrl: row.cover_url,
    releaseYear: row.release_year,
    sourceRef: row.source_id,
    availablePlatformIds: inferPlatformIds(platformNames, platformById),
    availablePlatformNames: platformNames,
    releaseState,
  } satisfies SeedGame;
}

export type ProductSeedCsvTexts = Record<ProductDataFile, string>;

export function loadSeedDataFromCsv(csvTexts: ProductSeedCsvTexts): ProductSeedData {
  const catalogText = csvTexts["games_catalog.csv"];
  const coverText = csvTexts["game_cover_assets.csv"];
  const platformText = csvTexts["platforms.csv"];
  const gamePlatformText = csvTexts["game_platforms.csv"];
  const gameUniverseText = csvTexts["game_universe.csv"];
  const masterText = csvTexts["master_game_universe.csv"];
  const upcomingText = csvTexts["upcoming_releases.csv"];

  const catalogRows = parseCsv<CatalogCsvRow>(catalogText, "games_catalog.csv", CATALOG_HEADERS);
  const coverRows = parseCsv<GameCoverCsvRow>(coverText, "game_cover_assets.csv", COVER_HEADERS);
  const platformRows = parseCsv<PlatformCsvRow>(platformText, "platforms.csv", PLATFORM_HEADERS);
  const gamePlatformRows = parseCsv<GamePlatformCsvRow>(
    gamePlatformText,
    "game_platforms.csv",
    GAME_PLATFORM_HEADERS,
  );
  const gameUniverseRows = parseCsv<GameUniverseCsvRow>(
    gameUniverseText,
    "game_universe.csv",
    GAME_UNIVERSE_HEADERS,
  );
  const masterRows = parseCsv<MasterGameUniverseRow>(
    masterText,
    "master_game_universe.csv",
    MASTER_HEADERS,
  );
  const upcomingRows = parseCsv<UpcomingReleaseCsvRow>(
    upcomingText,
    "upcoming_releases.csv",
    UPCOMING_HEADERS,
  );

  const platforms = platformRows
    .map((row) => ({
      platformId: row.platform_id,
      displayName: row.display_name,
      family: row.family,
      activeStatus: row.active_status,
      sortOrder: toNumber(row.sort_order),
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const platformById = new Map(platforms.map((row) => [row.platformId, row]));
  const coverByGameId = new Map(
    coverRows.filter((row) => row.cover_path).map((row) => [row.game_id, row.cover_path]),
  );
  const gamePlatformsById = new Map<string, GamePlatformCsvRow[]>();

  gamePlatformRows.forEach((row) => {
    const existing = gamePlatformsById.get(row.game_id) ?? [];
    existing.push(row);
    gamePlatformsById.set(row.game_id, existing);
  });

  const upcomingByGameId = new Map(upcomingRows.map((row) => [row.game_id, row]));
  const upcomingGameIds = new Set(upcomingByGameId.keys());
  const catalogGames = catalogRows.map((row) =>
    buildSeedGame(
      row,
      "catalog",
      coverByGameId,
      gamePlatformsById,
      platformById,
      upcomingGameIds.has(row.game_id) ? "unreleased" : "released",
      upcomingByGameId,
    ),
  );
  const knownCatalogIds = new Set(catalogGames.map((row) => row.gameId));
  const universeGames = masterRows
    .filter((row) => !knownCatalogIds.has(row.game_id))
    .map((row) =>
      buildSeedGame(
        row,
        "universe",
        coverByGameId,
        gamePlatformsById,
        platformById,
        "unreleased",
        upcomingByGameId,
      ),
    );
  const knownScoredIds = new Set([...knownCatalogIds, ...universeGames.map((row) => row.gameId)]);
  const knownScoredTitles = new Set(
    [...catalogGames, ...universeGames].map((row) => row.title.trim().toLowerCase()),
  );
  const finderUniverseGames = gameUniverseRows
    .filter((row) => row.game_id && row.title)
    .filter((row) => !knownScoredIds.has(row.game_id))
    .filter((row) => !knownScoredTitles.has(row.title.trim().toLowerCase()))
    .map((row) => buildBasicUniverseGame(row, coverByGameId, platformById));
  const allGames = [...catalogGames, ...universeGames, ...finderUniverseGames].sort((left, right) =>
    left.title.localeCompare(right.title),
  );
  const gamesById = new Map(allGames.map((row) => [row.gameId, row]));

  return {
    allGames,
    catalogGames,
    gamesById,
    platforms,
  };
}

export async function loadProductSeedData(baseUrl?: string): Promise<ProductSeedData> {
  const [
    catalogText,
    coverText,
    platformText,
    gamePlatformText,
    gameUniverseText,
    masterText,
    upcomingText,
  ] = await Promise.all([
    loadCsvText("games_catalog.csv", baseUrl),
    loadCsvText("game_cover_assets.csv", baseUrl),
    loadCsvText("platforms.csv", baseUrl),
    loadCsvText("game_platforms.csv", baseUrl),
    loadCsvText("game_universe.csv", baseUrl),
    loadCsvText("master_game_universe.csv", baseUrl),
    loadCsvText("upcoming_releases.csv", baseUrl),
  ]);

  return loadSeedDataFromCsv({
    "games_catalog.csv": catalogText,
    "game_cover_assets.csv": coverText,
    "platforms.csv": platformText,
    "game_platforms.csv": gamePlatformText,
    "game_universe.csv": gameUniverseText,
    "master_game_universe.csv": masterText,
    "upcoming_releases.csv": upcomingText,
  });
}
