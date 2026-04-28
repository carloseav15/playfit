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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, attempt = 0) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "games-library-workbench/0.1 ggapp-cover-replacer",
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

const catalogRows = await loadCsvRows(catalogPath);
const manifestRows = await loadCsvRows(manifestPath);
const extractedRows = await loadCsvRows(extractedPath);

const manifestByGameId = new Map(manifestRows.map((row) => [row.game_id, row]));
const extractedByTitle = new Map(
  extractedRows.map((row) => [row.title.trim(), row]),
);

await mkdir(publicDir, { recursive: true });

let updated = 0;
let failed = 0;
let skipped = 0;

for (const game of catalogRows) {
  const extracted = extractedByTitle.get(game.title.trim());
  const manifest = manifestByGameId.get(game.game_id);

  if (!extracted || !manifest) {
    skipped += 1;
    continue;
  }

  try {
    const response = await fetchWithRetry(extracted.cover_url);

    if (!response.ok) {
      throw new Error(`Image request failed (${response.status})`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const ext = extensionFromUrl(extracted.cover_url, contentType);
    const absoluteFile = path.join(publicDir, `${game.game_id}${ext}`);
    const buffer = Buffer.from(await response.arrayBuffer());

    await writeFile(absoluteFile, buffer);

    manifest.source_type = "ggapp_export";
    manifest.source_ref = extracted.gg_url;
    manifest.cover_path = `/covers/games/${game.game_id}${ext}`;
    manifest.resolved_image_url = extracted.cover_url;
    manifest.download_status = "downloaded";
    manifest.notes = `Replaced from raw-data-images.rtf export (${extracted.gg_url}).`;

    updated += 1;
    await sleep(120);
  } catch (error) {
    failed += 1;
    manifest.notes = `GG App replacement failed: ${error instanceof Error ? error.message : "unknown error"}`;
  }
}

await writeCsv(manifestPath, manifestRows, GAME_COVER_COLUMNS);

console.log(
  `GG App cover replacement completed: updated=${updated}, failed=${failed}, skipped=${skipped}`,
);
