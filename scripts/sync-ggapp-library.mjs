import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

const SAFE_ALIAS_TO_EXISTING = new Map([
  ["Fahrenheit", "Fahrenheit: Indigo Prophecy"],
  ["Broken Age: The Complete Adventure", "Broken Age"],
  ["Dissidia Final Fantasy", "Dissidia: Final Fantasy"],
  ["Baten Kaitos I & II HD Remaster", "Baten Kaitos I and II"],
  ["Mirror's Edge™", "Mirror's Edge"],
  ["Prince of Persia: The Forgotten Sands™", "Prince of Persia: The Forgotten Sands"],
  ["Prince of Persia: The Two Thrones™", "Prince of Persia: The Two Thrones"],
  ["Red Dead Redemption II", "Red Dead Redemption 2"],
  ["Tekken 5: Dark Resurrection", "Tekken: Dark Resurrection"],
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, attempt = 0) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "games-library-workbench/0.1 ggapp-library-sync",
    },
  });

  if (response.status === 429 && attempt < 4) {
    await sleep(900 * (attempt + 1));
    return fetchWithRetry(url, attempt + 1);
  }

  return response;
}

function decodeHtmlEntities(value) {
  let decoded = value;

  while (true) {
    const next = decoded
      .replaceAll("&amp;", "&")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'")
      .replaceAll("&apos;", "'")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");

    if (next === decoded) {
      return next;
    }

    decoded = next;
  }
}

function normalizeText(value) {
  return decodeHtmlEntities(value)
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

function slugifyTitle(value) {
  return decodeHtmlEntities(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[®™]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toLowerCase();
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

function buildGroupMap(items, keyFn) {
  const grouped = new Map();

  items.forEach((item) => {
    const key = keyFn(item);
    const existing = grouped.get(key) ?? [];
    existing.push(item);
    grouped.set(key, existing);
  });

  return grouped;
}

async function downloadIntoGameManifest(row, gameId, title, manifestRow, note) {
  const response = await fetchWithRetry(row.cover_url);

  if (!response.ok) {
    throw new Error(`Image request failed (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const ext = extensionFromUrl(row.cover_url, contentType);
  const absoluteFile = path.join(publicDir, `${gameId}${ext}`);
  const buffer = Buffer.from(await response.arrayBuffer());

  await writeFile(absoluteFile, buffer);

  manifestRow.title = title;
  manifestRow.source_type = "ggapp_export";
  manifestRow.source_ref = row.gg_url;
  manifestRow.cover_path = `/covers/games/${gameId}${ext}`;
  manifestRow.resolved_image_url = row.cover_url;
  manifestRow.download_status = "downloaded";
  manifestRow.notes = note;
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

const catalogRows = await loadCsvRows(catalogPath);
const manifestRows = await loadCsvRows(manifestPath);
const extractedRows = (await loadCsvRows(extractedPath)).map((row) => ({
  ...row,
  title: decodeHtmlEntities(row.title.trim()),
}));

await mkdir(publicDir, { recursive: true });

const manifestByGameId = new Map(manifestRows.map((row) => [row.game_id, row]));
const catalogByTitle = buildGroupMap(catalogRows, (row) => row.title.trim());
const catalogByNormalizedTitle = buildGroupMap(catalogRows, (row) => normalizeText(row.title));
const extractedByTitle = buildGroupMap(extractedRows, (row) => row.title);

const assignedExtracted = new Set();
const assignedGameIds = new Set();
const matchAssignments = [];
const ambiguousDuplicates = [];

for (const [title, catalogGroup] of catalogByTitle.entries()) {
  const extractedGroup = extractedByTitle.get(title) ?? [];
  const count = Math.min(catalogGroup.length, extractedGroup.length);

  for (let index = 0; index < count; index += 1) {
    const extractedRow = extractedGroup[index];
    const catalogRow = catalogGroup[index];
    const extractedIndex = extractedRows.indexOf(extractedRow);

    assignedExtracted.add(extractedIndex);
    assignedGameIds.add(catalogRow.game_id);
    matchAssignments.push({
      type: "exact",
      extracted: extractedRow,
      catalog: catalogRow,
    });
  }

  if (extractedGroup.length > catalogGroup.length) {
    ambiguousDuplicates.push({
      title,
      skipped: extractedGroup.length - catalogGroup.length,
      reason: "export contains more duplicate titles than catalog",
    });
  }
}

extractedRows.forEach((row, index) => {
  if (assignedExtracted.has(index)) {
    return;
  }

  const normalized = normalizeText(row.title);
  const candidates = (catalogByNormalizedTitle.get(normalized) ?? []).filter(
    (candidate) => !assignedGameIds.has(candidate.game_id),
  );

  if (candidates.length !== 1) {
    return;
  }

  assignedExtracted.add(index);
  assignedGameIds.add(candidates[0].game_id);
  matchAssignments.push({
    type: "normalized",
    extracted: row,
    catalog: candidates[0],
  });
});

extractedRows.forEach((row, index) => {
  if (assignedExtracted.has(index)) {
    return;
  }

  const aliasedTitle = SAFE_ALIAS_TO_EXISTING.get(row.title);
  if (!aliasedTitle) {
    return;
  }

  const candidates = (catalogByTitle.get(aliasedTitle) ?? []).filter(
    (candidate) => !assignedGameIds.has(candidate.game_id),
  );

  if (candidates.length !== 1) {
    return;
  }

  assignedExtracted.add(index);
  assignedGameIds.add(candidates[0].game_id);
  matchAssignments.push({
    type: "alias",
    extracted: row,
    catalog: candidates[0],
  });
});

let nextAssetId = nextAssetNumber(manifestRows);
const knownGameIds = new Set(catalogRows.map((row) => row.game_id));
let updatedExistingCovers = 0;
let integratedNewGames = 0;
let failedDownloads = 0;

function ensureManifestRow(gameId, title) {
  const existing = manifestByGameId.get(gameId);
  if (existing) {
    return existing;
  }

  const created = createManifestRow(gameId, title, nextAssetId);
  nextAssetId += 1;
  manifestRows.push(created);
  manifestByGameId.set(gameId, created);
  return created;
}

for (const assignment of matchAssignments) {
  const manifestRow = ensureManifestRow(assignment.catalog.game_id, assignment.catalog.title);

  const currentPath = manifestRow.cover_path
    ? path.join(rootDir, "public", manifestRow.cover_path.replace(/^\//, ""))
    : "";

  const alreadyCurrent =
    manifestRow.source_type === "ggapp_export" &&
    manifestRow.resolved_image_url === assignment.extracted.cover_url &&
    currentPath &&
    existsSync(currentPath);

  if (alreadyCurrent) {
    continue;
  }

  try {
    await downloadIntoGameManifest(
      assignment.extracted,
      assignment.catalog.game_id,
      assignment.catalog.title,
      manifestRow,
      `Matched from GG App export by ${assignment.type} title reference (${assignment.extracted.gg_url}).`,
    );
    updatedExistingCovers += 1;
    await sleep(100);
  } catch (error) {
    failedDownloads += 1;
    manifestRow.notes = `GG App sync failed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

for (let index = 0; index < extractedRows.length; index += 1) {
  if (assignedExtracted.has(index)) {
    continue;
  }

  const row = extractedRows[index];
  const normalizedCandidates = catalogByNormalizedTitle.get(normalizeText(row.title)) ?? [];
  const aliasedTitle = SAFE_ALIAS_TO_EXISTING.get(row.title);

  if (catalogByTitle.has(row.title) || aliasedTitle || normalizedCandidates.length > 0) {
    continue;
  }

  const baseGameId = slugifyTitle(row.title) || `ggapp_${index + 1}`;
  const ggId = row.gg_url.split("/").filter(Boolean).at(-2) ?? `gg${index + 1}`;
  let gameId = baseGameId;

  if (knownGameIds.has(gameId)) {
    gameId = `${baseGameId}_${ggId.toLowerCase()}`;
  }

  while (knownGameIds.has(gameId)) {
    gameId = `${gameId}_x`;
  }

  knownGameIds.add(gameId);

  const duplicateTitleCount = extractedByTitle.get(row.title)?.length ?? 1;
  const duplicateNote =
    duplicateTitleCount > 1
      ? ` Duplicate title in GG export (${duplicateTitleCount} entries); manual metadata review recommended.`
      : "";

  const catalogRow = {
    game_id: gameId,
    title: row.title,
    series: "",
    primary_genre: "",
    combat_style: "",
    story_strength: "",
    progression_clarity: "",
    early_hook: "",
    aesthetic_fit: "",
    emotional_complexity: "",
    combat_depth: "",
    endgame_repetition_risk: "",
    pacing_speed: "",
    notes: `Imported from GG App export on 2026-04-08. Metadata pending enrichment. Source: ${row.gg_url}.${duplicateNote}`.trim(),
  };

  const manifestRow = {
    ...createManifestRow(gameId, row.title, nextAssetId),
    source_type: "ggapp_export",
    source_ref: row.gg_url,
    resolved_image_url: row.cover_url,
    notes: `Imported from GG App export (${row.gg_url}).`,
  };

  nextAssetId += 1;
  catalogRows.push(catalogRow);
  manifestRows.push(manifestRow);
  manifestByGameId.set(gameId, manifestRow);
  integratedNewGames += 1;

  try {
    await downloadIntoGameManifest(
      row,
      gameId,
      row.title,
      manifestRow,
      `Imported new game and cover from GG App export (${row.gg_url}).`,
    );
    await sleep(100);
  } catch (error) {
    failedDownloads += 1;
    manifestRow.download_status = "failed";
    manifestRow.notes = `Imported new game, but cover download failed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

catalogRows.sort((left, right) => left.title.localeCompare(right.title));
manifestRows.sort((left, right) => left.title.localeCompare(right.title));

await writeCsv(catalogPath, catalogRows, CATALOG_COLUMNS);
await writeCsv(manifestPath, manifestRows, GAME_COVER_COLUMNS);

console.log(
  JSON.stringify(
    {
      matched_existing: matchAssignments.length,
      updated_existing_covers: updatedExistingCovers,
      integrated_new_games: integratedNewGames,
      failed_downloads: failedDownloads,
      ambiguous_duplicate_groups: ambiguousDuplicates.length,
    },
    null,
    2,
  ),
);
