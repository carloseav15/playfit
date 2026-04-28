import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { writeCsv } from "./lib/csv.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const personalDataDir = path.join(rootDir, "data", "personal");
const franchiseMasterPath = path.join(personalDataDir, "franchise_master_entries.csv");
const franchiseCoverPath = path.join(personalDataDir, "franchise_cover_assets.csv");
const gameCoverPath = path.join(personalDataDir, "game_cover_assets.csv");

function parseCsv(text, filePath) {
  const parsed = Papa.parse(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(`${path.basename(filePath)} parse failed: ${parsed.errors[0].message}`);
  }

  return parsed.data;
}

async function loadCsvRows(filePath) {
  const text = await readFile(filePath, "utf8");
  return parseCsv(text, filePath);
}

function nextAssetNumber(rows) {
  return (
    rows.reduce((highest, row) => {
      const match = /^FCA(\d+)$/.exec(row.asset_id ?? "");
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0) + 1
  );
}

const FRANCHISE_COVER_COLUMNS = [
  "asset_id",
  "entry_id",
  "collection_id",
  "series",
  "title",
  "source_type",
  "source_ref",
  "cover_path",
  "resolved_image_url",
  "download_status",
  "notes",
];

const franchiseMasterRows = await loadCsvRows(franchiseMasterPath);
const franchiseCoverRows = await loadCsvRows(franchiseCoverPath);
const gameCoverRows = await loadCsvRows(gameCoverPath);

const franchiseCoverByEntryId = new Map(franchiseCoverRows.map((row) => [row.entry_id, row]));
const gameCoverByGameId = new Map(gameCoverRows.map((row) => [row.game_id, row]));

let nextAssetId = nextAssetNumber(franchiseCoverRows);
let updated = 0;
let created = 0;
let skipped = 0;

for (const masterRow of franchiseMasterRows) {
  const mappedGameId = masterRow.mapped_game_id?.trim();
  if (!mappedGameId) {
    skipped += 1;
    continue;
  }

  const gameCover = gameCoverByGameId.get(mappedGameId);
  if (!gameCover?.cover_path || gameCover.source_type !== "ggapp_export") {
    skipped += 1;
    continue;
  }

  let franchiseCover = franchiseCoverByEntryId.get(masterRow.entry_id);
  if (!franchiseCover) {
    franchiseCover = {
      asset_id: `FCA${String(nextAssetId).padStart(3, "0")}`,
      entry_id: masterRow.entry_id,
      collection_id: masterRow.collection_id,
      series: masterRow.series,
      title: masterRow.title,
      source_type: "",
      source_ref: "",
      cover_path: "",
      resolved_image_url: "",
      download_status: "",
      notes: "",
    };
    nextAssetId += 1;
    franchiseCoverRows.push(franchiseCover);
    franchiseCoverByEntryId.set(masterRow.entry_id, franchiseCover);
    created += 1;
  }

  const nextSourceRef = `game:${mappedGameId}`;
  const alreadySynced =
    franchiseCover.cover_path === gameCover.cover_path &&
    franchiseCover.resolved_image_url === gameCover.resolved_image_url &&
    franchiseCover.source_type === "game_cover_sync" &&
    franchiseCover.source_ref === nextSourceRef;

  if (alreadySynced) {
    skipped += 1;
    continue;
  }

  franchiseCover.collection_id = masterRow.collection_id;
  franchiseCover.series = masterRow.series;
  franchiseCover.title = masterRow.title;
  franchiseCover.source_type = "game_cover_sync";
  franchiseCover.source_ref = nextSourceRef;
  franchiseCover.cover_path = gameCover.cover_path;
  franchiseCover.resolved_image_url = gameCover.resolved_image_url;
  franchiseCover.download_status = gameCover.download_status || "downloaded";
  franchiseCover.notes =
    `Synced from mapped game cover ${mappedGameId} ` +
    `(${gameCover.source_type}${gameCover.source_ref ? `; ${gameCover.source_ref}` : ""}).`;
  updated += 1;
}

franchiseCoverRows.sort((left, right) => left.entry_id.localeCompare(right.entry_id));

await writeCsv(franchiseCoverPath, franchiseCoverRows, FRANCHISE_COVER_COLUMNS);

console.log(
  JSON.stringify(
    {
      updated,
      created,
      skipped,
      total_rows: franchiseCoverRows.length,
    },
    null,
    2,
  ),
);
