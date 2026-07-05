// Applies reports/igdb-taxonomies.ndjson (from fetch-igdb-taxonomies.mjs) to
// the three new junction tables: game_game_modes, game_themes,
// game_perspectives. Lookup tables (game_modes, themes, perspectives) were
// seeded by migration 20260704_seed_igdb_taxonomy_lookups with IGDB's fixed
// id sets.
//
// Purely additive - these are new taxonomies with no prior data, so there's
// no gap-fill-vs-overwrite question, just insert-if-missing.
//
// Usage:
//   SUPABASE_SERVICE_KEY=... node scripts/apply-igdb-taxonomies.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

const TAXONOMIES_FILE = new URL("../reports/igdb-taxonomies.ndjson", import.meta.url);

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is required.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

const DRY_RUN = process.argv.includes("--dry-run");

const TAXONOMIES = [
  { field: "game_modes", table: "game_modes", junction: "game_game_modes", refCol: "mode_ref", idCol: "mode_id" },
  { field: "themes", table: "themes", junction: "game_themes", refCol: "theme_ref", idCol: "theme_id" },
  {
    field: "player_perspectives",
    table: "perspectives",
    junction: "game_perspectives",
    refCol: "perspective_ref",
    idCol: "perspective_id",
  },
];

async function readNdjson(fileUrl, onRecord) {
  const rl = createInterface({ input: createReadStream(fileUrl), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line) onRecord(JSON.parse(line));
  }
}

async function fetchAllRows(table, columns, filter, orderColumn = "game_id") {
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

async function main() {
  const records = new Map();
  await readNdjson(TAXONOMIES_FILE, (r) => records.set(r.igdb_id, r));
  console.log(`Taxonomy records: ${records.size}`);

  const links = await fetchAllRows(
    "game_external_ids",
    "game_id,provider_game_key",
    (q) => q.eq("provider", "igdb"),
  );
  const igdbIdByGame = new Map(links.map((l) => [l.game_id, Number(l.provider_game_key)]));

  const games = await fetchAllRows("games", "game_id,pk");
  const gameRefByGameId = new Map(games.map((g) => [g.game_id, g.pk]));

  for (const tax of TAXONOMIES) {
    const lookupRows = await fetchAllRows(tax.table, "id,pk,igdb_id", null, "id");
    const lookupByIgdbId = new Map(lookupRows.filter((r) => r.igdb_id != null).map((r) => [r.igdb_id, r]));

    const existingLinks = await fetchAllRows(tax.junction, "game_id," + tax.idCol, null, "game_id");
    const existingSet = new Set(existingLinks.map((l) => `${l.game_id}::${l[tax.idCol]}`));

    const toInsert = [];
    for (const [gameId, igdbId] of igdbIdByGame) {
      const rec = records.get(igdbId);
      if (!rec) continue;
      const gameRef = gameRefByGameId.get(gameId);
      if (!gameRef) continue;
      for (const valueIgdbId of rec[tax.field]) {
        const lookup = lookupByIgdbId.get(valueIgdbId);
        if (!lookup) continue;
        const key = `${gameId}::${lookup.id}`;
        if (existingSet.has(key)) continue;
        existingSet.add(key);
        toInsert.push({
          game_id: gameId,
          game_ref: gameRef,
          [tax.idCol]: lookup.id,
          [tax.refCol]: lookup.pk,
          source: "igdb",
        });
      }
    }

    console.log(`${tax.junction}: ${toInsert.length} links to insert`);
    if (DRY_RUN) {
      console.log(" ", toInsert.slice(0, 5));
      continue;
    }

    const CHUNK = 1000;
    let done = 0;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const { error } = await supabase.from(tax.junction).insert(toInsert.slice(i, i + CHUNK));
      if (error) throw new Error(`${tax.junction} insert: ${error.message}`);
      done += Math.min(CHUNK, toInsert.length - i);
    }
    console.log(`  applied: ${done}`);
  }

  if (DRY_RUN) console.log("Dry run, no changes written.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
