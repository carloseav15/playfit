import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import Papa from "papaparse";
import { writeCsv } from "./lib/csv.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const publicDataDir = path.join(rootDir, "data", "public");
const personalDataDir = path.join(rootDir, "data", "personal");

const DEFAULT_SOURCE_URL = "https://github.com/leinstay/steamdb/raw/main/steamdb.min.json.gz";
const DEFAULT_LIMIT = 2000;

const GAME_UNIVERSE_COLUMNS = [
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

const CATALOG_COLUMNS = [
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

const BLOCKED_NAME_PATTERNS = [
  /\b(demo|soundtrack|ost|artbook|wallpaper|trailer|teaser|server|sdk|editor|tool|benchmark)\b/i,
  /\b(season pass|starter pack|supporter pack|founder'?s pack|upgrade pack|bonus content)\b/i,
  /\b(dlc|add[- ]on|expansion pass|cosmetic pack|skin pack|currency pack)\b/i,
];

const BLOCKED_GENRES = new Set([
  "Accounting",
  "Animation & Modeling",
  "Audio Production",
  "Design & Illustration",
  "Education",
  "Photo Editing",
  "Software Training",
  "Utilities",
  "Video Production",
  "Web Publishing",
]);

function parseArgs() {
  const args = new Map();
  for (const arg of process.argv.slice(2)) {
    const [key, value = "true"] = arg.replace(/^--/, "").split("=");
    args.set(key, value);
  }

  return {
    source: args.get("source") ?? DEFAULT_SOURCE_URL,
    limit: Number(args.get("limit") ?? DEFAULT_LIMIT),
  };
}

async function readCsv(filePath, columns) {
  const text = await readFile(filePath, "utf8");
  const parsed = Papa.parse(text.replace(/\r\n?/g, "\n"), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  if (parsed.errors.length > 0) {
    throw new Error(`${path.basename(filePath)} parse failed: ${parsed.errors[0].message}`);
  }

  const missing = columns.filter((column) => !(parsed.meta.fields ?? []).includes(column));
  if (missing.length > 0) {
    throw new Error(`${path.basename(filePath)} missing columns: ${missing.join(", ")}`);
  }

  return parsed.data;
}

async function loadSteamDb(source) {
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source, {
      headers: { "user-agent": "games-library/1.0 steam-universe-import" },
    });
    if (!response.ok) {
      throw new Error(`Steam source request failed: ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const text = source.endsWith(".gz") ? zlib.gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
    return JSON.parse(text);
  }

  const buffer = await readFile(path.resolve(source));
  const text = source.endsWith(".gz") ? zlib.gunzipSync(buffer).toString("utf8") : buffer.toString("utf8");
  return JSON.parse(text);
}

function normalizeTitle(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[®™]/g, "")
    .replace(/[’']/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[®™]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toLowerCase();
}

function splitCsvList(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function mapSteamPlatforms(value) {
  const platforms = splitCsvList(value);
  return platforms.length > 0 ? "PC" : "";
}

function getPrimaryGenre(row) {
  const genres = splitCsvList(row.genres);
  const firstGenre = genres.find((genre) => !BLOCKED_GENRES.has(genre)) ?? "";
  return slugify(firstGenre).replaceAll("_", "-").replaceAll("-", "_") || "unknown";
}

function getReleaseYear(row) {
  const date = row.published_store || row.published_meta || row.published_igdb || row.published_hltb || "";
  const match = /^(\d{4})/.exec(String(date));
  return match?.[1] ?? "";
}

function shouldSkip(row, knownTitles) {
  const title = String(row.name ?? "").trim();
  const normalized = normalizeTitle(title);
  if (!title || title.length < 2 || knownTitles.has(normalized)) return true;
  if (BLOCKED_NAME_PATTERNS.some((pattern) => pattern.test(title))) return true;

  const genres = splitCsvList(row.genres);
  if (genres.length === 0 || genres.every((genre) => BLOCKED_GENRES.has(genre))) return true;

  return false;
}

function rankRow(row) {
  const owners = Number(row.stsp_owners ?? 0);
  const popularity = Number(row.igdb_popularity ?? 0);
  const userScore = Number(row.store_uscore ?? 0);
  const metaScore = Number(row.meta_score ?? 0);
  return owners * 4 + popularity * 10000 + userScore * 1000 + metaScore * 500;
}

function toUniverseRow(row) {
  const releaseYear = getReleaseYear(row);
  const genre = getPrimaryGenre(row);
  const title = String(row.name).trim();
  const sourceId = String(row.sid);
  const publishers = splitCsvList(row.publishers).slice(0, 2).join(", ");
  const tags = splitCsvList(row.tags).slice(0, 4).join("; ");

  return {
    game_id: `steam_${sourceId}_${slugify(title)}`.slice(0, 120),
    title,
    aliases: "",
    series: "",
    release_year: releaseYear,
    release_state: "released",
    primary_genre: genre,
    platforms: mapSteamPlatforms(row.platforms),
    source_type: "steamdb",
    source_id: `steam:${sourceId}`,
    cover_url: row.image ?? "",
    notes: [
      publishers ? `Publisher: ${publishers}` : "",
      tags ? `Tags: ${tags}` : "",
    ].filter(Boolean).join(" | "),
  };
}

const { source, limit } = parseArgs();
if (!Number.isFinite(limit) || limit < 1) {
  throw new Error("--limit must be a positive number");
}

const [catalogRows, masterRows, existingUniverseRows, steamRows] = await Promise.all([
  readCsv(path.join(publicDataDir, "games_catalog.csv"), CATALOG_COLUMNS),
  readCsv(path.join(publicDataDir, "master_game_universe.csv"), MASTER_COLUMNS),
  readCsv(path.join(publicDataDir, "game_universe.csv"), GAME_UNIVERSE_COLUMNS).catch(() => []),
  loadSteamDb(source),
]);

const knownTitles = new Set([
  ...catalogRows.map((row) => normalizeTitle(row.title)),
  ...masterRows.map((row) => normalizeTitle(row.title)),
]);
const existingByTitle = new Map(existingUniverseRows.map((row) => [normalizeTitle(row.title), row]));

const importedRows = steamRows
  .filter((row) => !shouldSkip(row, knownTitles))
  .sort((left, right) => rankRow(right) - rankRow(left))
  .map(toUniverseRow)
  .filter((row) => {
    const normalized = normalizeTitle(row.title);
    if (knownTitles.has(normalized) || existingByTitle.has(normalized)) return false;
    existingByTitle.set(normalized, row);
    return true;
  })
  .slice(0, limit);

const nextRows = importedRows.sort((left, right) => left.title.localeCompare(right.title));

await Promise.all([
  writeCsv(path.join(publicDataDir, "game_universe.csv"), nextRows, GAME_UNIVERSE_COLUMNS),
  writeCsv(path.join(personalDataDir, "game_universe.csv"), nextRows, GAME_UNIVERSE_COLUMNS),
]);

console.log(`Imported ${nextRows.length} Finder universe games from ${source}.`);
