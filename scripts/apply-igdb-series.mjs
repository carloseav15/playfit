// Applies reports/igdb-franchises.ndjson (from fetch-igdb-franchises.mjs) to
// fill games.series_id gaps, going further than apply-igdb-enrichment.mjs:
// that script only linked to series that already existed in
// games_library.series (exact-match, no new rows created). This one creates
// new series rows from IGDB collection/franchise names when no existing
// series matches - the user is fine with new rows/tables where they
// strengthen the DB (2026-07-04 decision).
//
// Gap-filling only: never overwrites a game that already has a series_id.
// Prefers IGDB "collections" (narrower, e.g. "Super Mario") over "franchises"
// (broader, e.g. "Mario") since collections maps closer to Playfit's
// single series-per-game concept. Ambiguous games (multiple distinct
// collection names) are skipped rather than guessed.
//
// Usage:
//   SUPABASE_SERVICE_KEY=... node scripts/apply-igdb-series.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

const FRANCHISES_FILE = new URL("../reports/igdb-franchises.ndjson", import.meta.url);

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is required.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 20;

function normalizeTitle(t) {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function readNdjson(fileUrl, onRecord) {
  const rl = createInterface({ input: createReadStream(fileUrl), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line) onRecord(JSON.parse(line));
  }
}

async function fetchAllRows(table, columns, filter, orderColumn = "id") {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1).order(orderColumn);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function runPool(items, worker) {
  let next = 0;
  let failed = 0;
  const lanes = Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch (e) {
        failed += 1;
        console.error(`  ${item.game_id}: ${e.message}`);
      }
    }
  });
  await Promise.all(lanes);
  return failed;
}

async function main() {
  const franchisesByIgdbId = new Map();
  await readNdjson(FRANCHISES_FILE, (r) => franchisesByIgdbId.set(r.igdb_id, r));
  console.log(`Franchise records: ${franchisesByIgdbId.size}`);

  const links = await fetchAllRows(
    "game_external_ids",
    "game_id,provider_game_key",
    (q) => q.eq("provider", "igdb"),
    "game_id",
  );
  const igdbIdByGame = new Map(links.map((l) => [l.game_id, Number(l.provider_game_key)]));

  const games = await fetchAllRows("games", "game_id,series_id", null, "game_id");

  const seriesRows = await fetchAllRows("series", "id,name", null, "id");
  const seriesByNormName = new Map(seriesRows.map((s) => [normalizeTitle(s.name), s.id]));
  const existingSlugs = new Set(seriesRows.map((s) => s.id));

  const resolutions = []; // { game_id, seriesName }
  const stats = { resolved: 0, ambiguous: 0, noCandidate: 0 };

  for (const game of games) {
    if (game.series_id) continue;
    const igdbId = igdbIdByGame.get(game.game_id);
    if (!igdbId) continue;
    const rec = franchisesByIgdbId.get(igdbId);
    if (!rec) continue;

    const candidates = rec.collections.length > 0 ? rec.collections : rec.franchises;
    if (candidates.length === 0) {
      stats.noCandidate += 1;
      continue;
    }
    const distinct = [...new Set(candidates)];
    if (distinct.length > 1) {
      stats.ambiguous += 1;
      continue;
    }
    resolutions.push({ game_id: game.game_id, seriesName: distinct[0] });
    stats.resolved += 1;
  }

  console.log(`Games resolved to a series name: ${stats.resolved}`);
  console.log(`  ambiguous (multiple distinct collections, skipped): ${stats.ambiguous}`);
  console.log(`  no candidate (no collection/franchise in IGDB): ${stats.noCandidate}`);

  // Phase 1: figure out which series need to be newly created (dedup by slug).
  const newSeriesBySlug = new Map(); // slug -> name
  const seriesIdForGame = new Map(); // game_id -> series id (existing or new)

  for (const r of resolutions) {
    const normName = normalizeTitle(r.seriesName);
    const existingId = seriesByNormName.get(normName);
    if (existingId) {
      seriesIdForGame.set(r.game_id, existingId);
      continue;
    }
    let slug = slugify(r.seriesName);
    if (!slug) continue;
    // Avoid colliding with an existing slug that belongs to a different name.
    if (existingSlugs.has(slug) && !newSeriesBySlug.has(slug)) {
      slug = `${slug}_igdb`;
    }
    newSeriesBySlug.set(slug, r.seriesName);
    seriesIdForGame.set(r.game_id, slug);
  }

  console.log(`New series to create: ${newSeriesBySlug.size}`);
  console.log(`Games to update (games.series_id): ${seriesIdForGame.size}`);

  if (DRY_RUN) {
    console.log("Sample new series:", [...newSeriesBySlug.entries()].slice(0, 10));
    console.log(
      "Sample game updates:",
      [...seriesIdForGame.entries()].slice(0, 10),
    );
    console.log("Dry run, no changes written.");
    return;
  }

  if (newSeriesBySlug.size > 0) {
    const rows = [...newSeriesBySlug.entries()].map(([id, name]) => ({ id, name }));
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error } = await supabase.from("series").insert(rows.slice(i, i + CHUNK));
      if (error) throw new Error(`series insert: ${error.message}`);
    }
    console.log(`Created ${rows.length} new series rows.`);
  }

  const updates = [...seriesIdForGame.entries()].map(([game_id, series_id]) => ({ game_id, series_id }));
  let done = 0;
  const failed = await runPool(updates, async (u) => {
    const { error } = await supabase.from("games").update({ series_id: u.series_id }).eq("game_id", u.game_id);
    if (error) throw new Error(error.message);
    done += 1;
    if (done % 5000 === 0) console.log(`  applied: ${done}/${updates.length}`);
  });
  console.log(`Applied: ${done}, failed: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
