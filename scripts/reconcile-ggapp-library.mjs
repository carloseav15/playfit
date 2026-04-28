import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { writeCsv } from "./lib/csv.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const personalDataDir = path.join(rootDir, "data", "personal");
const catalogPath = path.join(personalDataDir, "games_catalog.csv");
const manifestPath = path.join(personalDataDir, "game_cover_assets.csv");
const extractedPath = path.join(personalDataDir, "raw-data-images-extracted.csv");
const publicDir = path.join(rootDir, "public", "covers", "games");

const DUPLICATE_IMPORT_GAME_IDS = new Set([
  "dead_space_huh31m",
  "paper_mario_the_thousand_year_door_hm44vd",
]);

const ALIAS_MERGES = [
  ["mirror_s_edgetm", "mirrors_edge"],
  ["prince_of_persia_the_forgotten_sandstm", "prince_of_persia_the_forgotten_sands"],
  ["prince_of_persia_the_two_thronestm", "prince_of_persia_the_two_thrones"],
  ["red_dead_redemption_ii", "red_dead_redemption_2"],
  ["tekken_5_dark_resurrection", "tekken_dark_resurrection"],
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, attempt = 0) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "games-library-workbench/0.1 ggapp-library-reconcile",
    },
  });

  if (response.status === 429 && attempt < 4) {
    await sleep(900 * (attempt + 1));
    return fetchWithRetry(url, attempt + 1);
  }

  return response;
}

function extensionFromUrl(url, contentType = "") {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const ext = path.extname(pathname);
    if (ext) {
      return ext;
    }
  } catch {
    // Fall through to content-type checks.
  }

  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  return ".jpg";
}

async function loadCsvRows(filePath) {
  const text = await readFile(filePath, "utf8");
  const parsed = Papa.parse(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`${path.basename(filePath)} parse failed: ${parsed.errors[0].message}`);
  }

  return parsed.data;
}

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

const GAME_COVER_COLUMNS = [
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

function nextAssetNumber(existingRows) {
  return (
    existingRows.reduce((highest, row) => {
      const match = /^GCA(\d+)$/.exec(row.asset_id ?? "");
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1
  );
}

function createManifestRow(gameId, title, assetNumber) {
  return {
    asset_id: `GCA${String(assetNumber).padStart(3, "0")}`,
    game_id: gameId,
    title,
    source_type: "",
    source_ref: "",
    cover_path: "",
    resolved_image_url: "",
    download_status: "",
    notes: "Auto-generated game cover row.",
  };
}

async function downloadIntoManifest(coverUrl, sourceRef, gameId, title, manifestRow, note) {
  const response = await fetchWithRetry(coverUrl);

  if (!response.ok) {
    throw new Error(`Image request failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const ext = extensionFromUrl(coverUrl, contentType);
  const absoluteFile = path.join(publicDir, `${gameId}${ext}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  await writeFile(absoluteFile, buffer);

  manifestRow.title = title;
  manifestRow.source_type = "ggapp_export";
  manifestRow.source_ref = sourceRef;
  manifestRow.cover_path = `/covers/games/${gameId}${ext}`;
  manifestRow.resolved_image_url = coverUrl;
  manifestRow.download_status = "downloaded";
  manifestRow.notes = note;
}

async function removeCoverFile(manifestRow) {
  if (!manifestRow?.cover_path) {
    return;
  }

  const absoluteFile = path.join(rootDir, "public", manifestRow.cover_path.replace(/^\//, ""));
  if (existsSync(absoluteFile)) {
    await rm(absoluteFile, { force: true });
  }
}

const catalogRows = await loadCsvRows(catalogPath);
const manifestRows = await loadCsvRows(manifestPath);
const extractedRows = await loadCsvRows(extractedPath);

const catalogByGameId = new Map(catalogRows.map((row) => [row.game_id, row]));
const manifestByGameId = new Map(manifestRows.map((row) => [row.game_id, row]));
const extractedByTitle = new Map(extractedRows.map((row) => [row.title, row]));

let nextAssetId = nextAssetNumber(manifestRows);
let mergedAliases = 0;
let removedDuplicateImports = 0;
let repairedMissingManifest = 0;

function ensureManifestRow(gameId, title) {
  const existing = manifestByGameId.get(gameId);
  if (existing) {
    return existing;
  }

  const created = createManifestRow(gameId, title, nextAssetId);
  nextAssetId += 1;
  manifestRows.push(created);
  manifestByGameId.set(gameId, created);
  repairedMissingManifest += 1;
  return created;
}

for (const [sourceGameId, targetGameId] of ALIAS_MERGES) {
  const sourceCatalogRow = catalogByGameId.get(sourceGameId);
  const targetCatalogRow = catalogByGameId.get(targetGameId);
  const sourceManifestRow = manifestByGameId.get(sourceGameId);

  if (!sourceCatalogRow || !targetCatalogRow || !sourceManifestRow?.resolved_image_url) {
    continue;
  }

  const targetManifestRow = ensureManifestRow(targetGameId, targetCatalogRow.title);
  await downloadIntoManifest(
    sourceManifestRow.resolved_image_url,
    sourceManifestRow.source_ref,
    targetGameId,
    targetCatalogRow.title,
    targetManifestRow,
    `Matched from GG App export during reconciliation (${sourceManifestRow.source_ref}).`,
  );
  await sleep(100);

  await removeCoverFile(sourceManifestRow);

  manifestByGameId.delete(sourceGameId);
  catalogByGameId.delete(sourceGameId);
  mergedAliases += 1;
}

for (const gameId of DUPLICATE_IMPORT_GAME_IDS) {
  const manifestRow = manifestByGameId.get(gameId);
  if (manifestRow) {
    await removeCoverFile(manifestRow);
    manifestByGameId.delete(gameId);
  }

  if (catalogByGameId.delete(gameId)) {
    removedDuplicateImports += 1;
  }
}

const catherineCatalogRow = catalogByGameId.get("catherine");
const catherineExtractedRow = extractedByTitle.get("Catherine");

if (catherineCatalogRow && catherineExtractedRow) {
  const catherineManifestRow = ensureManifestRow("catherine", "Catherine");
  if (!catherineManifestRow.cover_path) {
    await downloadIntoManifest(
      catherineExtractedRow.cover_url,
      catherineExtractedRow.gg_url,
      "catherine",
      "Catherine",
      catherineManifestRow,
      `Matched from GG App export during reconciliation (${catherineExtractedRow.gg_url}).`,
    );
    await sleep(100);
  }
}

const nextCatalogRows = Array.from(catalogByGameId.values()).sort((left, right) =>
  left.title.localeCompare(right.title),
);
const nextManifestRows = Array.from(manifestByGameId.values()).sort((left, right) =>
  left.title.localeCompare(right.title),
);

await writeCsv(catalogPath, nextCatalogRows, CATALOG_COLUMNS);
await writeCsv(manifestPath, nextManifestRows, GAME_COVER_COLUMNS);

console.log(
  JSON.stringify(
    {
      merged_alias_variants: mergedAliases,
      removed_duplicate_imports: removedDuplicateImports,
      repaired_missing_manifest_rows: repairedMissingManifest,
      catalog_rows: nextCatalogRows.length,
      manifest_rows: nextManifestRows.length,
    },
    null,
    2,
  ),
);
