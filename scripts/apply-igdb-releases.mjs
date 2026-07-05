// Applies reports/igdb-releases.ndjson (from fetch-igdb-releases.mjs) to
// games_library.game_releases, per-platform.
//
// Policy (per user decision 2026-07-04): IGDB is the source of truth for
// release dates. Unlike every other backfill in this repo, this one is
// allowed to overwrite: for a given (game, platform), if an existing
// metacritic/rawg/vgsales row disagrees with IGDB's year, the old row is
// deleted and replaced with IGDB's (Option A - replace in-place, chosen
// after reviewing the Shovel Knight example where rawg had wrong dates for
// PS4/PS3/PS Vita/Switch). Only touches (game, platform) pairs where IGDB
// actually has data - platforms/games IGDB doesn't cover are left untouched.
//
// Usage:
//   SUPABASE_SERVICE_KEY=... node scripts/apply-igdb-releases.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

const RELEASES_FILE = new URL("../reports/igdb-releases.ndjson", import.meta.url);

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is required.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 20;

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
  const releasesByIgdbId = new Map();
  await readNdjson(RELEASES_FILE, (r) => releasesByIgdbId.set(r.igdb_id, r.releases));
  console.log(`Release records: ${releasesByIgdbId.size}`);

  const links = await fetchAllRows(
    "game_external_ids",
    "game_id,provider_game_key",
    (q) => q.eq("provider", "igdb"),
  );
  const igdbIdByGame = new Map(links.map((l) => [l.game_id, Number(l.provider_game_key)]));

  const games = await fetchAllRows("games", "game_id,pk");
  const gameRefByGameId = new Map(games.map((g) => [g.game_id, g.pk]));

  const platforms = await fetchAllRows("platforms", "id,pk,igdb_id", null, "id");
  const platformByIgdbId = new Map(platforms.filter((p) => p.igdb_id != null).map((p) => [p.igdb_id, p]));

  const existingReleases = await fetchAllRows(
    "game_releases",
    "id,game_id,platform_id,release_year,release_date,source",
  );
  const existingByGamePlatform = new Map();
  for (const r of existingReleases) {
    const key = `${r.game_id}::${r.platform_id}`;
    if (!existingByGamePlatform.has(key)) existingByGamePlatform.set(key, []);
    existingByGamePlatform.get(key).push(r);
  }

  const plan = []; // { game_id, deletes: [id,...], insert: {...} | null }
  const stats = { gapFill: 0, conflictFixed: 0, alreadyCorrect: 0, unmappablePlatform: 0, unlinkedGameNoOp: 0 };

  for (const [gameId, igdbId] of igdbIdByGame) {
    const releases = releasesByIgdbId.get(igdbId);
    if (!releases || releases.length === 0) continue;
    const gameRef = gameRefByGameId.get(gameId);
    if (!gameRef) continue;

    // Dedup: one row per platform, earliest date/year wins (regional release
    // date variance - IGDB lists NA/EU/JP separately for the same platform).
    const byPlatform = new Map();
    for (const r of releases) {
      const existing = byPlatform.get(r.platform_igdb_id);
      if (!existing || (r.year < existing.year)) byPlatform.set(r.platform_igdb_id, r);
    }

    for (const [platformIgdbId, r] of byPlatform) {
      const platform = platformByIgdbId.get(platformIgdbId);
      if (!platform) {
        stats.unmappablePlatform += 1;
        continue; // IGDB platform we don't track locally (e.g. Arcade, VR) - skip, no data lost
      }
      const key = `${gameId}::${platform.id}`;
      const existingRows = existingByGamePlatform.get(key) ?? [];
      const matching = existingRows.filter((e) => e.release_year === r.year);
      const conflicting = existingRows.filter((e) => e.release_year !== r.year);

      if (matching.length > 0) {
        stats.alreadyCorrect += 1;
        if (conflicting.length > 0) {
          // A correct row coexists with wrong duplicate(s) from another source - clean up.
          plan.push({ game_id: gameId, deletes: conflicting.map((c) => c.id), insert: null });
          stats.conflictFixed += 1;
        }
        continue;
      }

      if (conflicting.length > 0) {
        stats.conflictFixed += 1;
      } else {
        stats.gapFill += 1;
      }
      plan.push({
        game_id: gameId,
        deletes: conflicting.map((c) => c.id),
        insert: {
          game_id: gameId,
          game_ref: gameRef,
          platform_id: platform.id,
          platform_ref: platform.pk,
          release_date: r.date,
          release_year: r.year,
          source: "igdb",
          source_key: String(igdbId),
        },
      });
    }
  }

  console.log(`Plan: ${plan.length} operations`);
  console.log(`  gap fills (no prior row): ${stats.gapFill}`);
  console.log(`  conflicts fixed (igdb overwrote rawg/metacritic/vgsales): ${stats.conflictFixed}`);
  console.log(`  already correct (no-op): ${stats.alreadyCorrect}`);
  console.log(`  igdb platform not tracked locally (skipped): ${stats.unmappablePlatform}`);

  if (DRY_RUN) {
    for (const p of plan.slice(0, 15)) console.log(" ", JSON.stringify(p));
    console.log("Dry run, no changes written.");
    return;
  }

  let done = 0;
  const failed = await runPool(plan, async (p) => {
    if (p.deletes.length > 0) {
      const { error } = await supabase.from("game_releases").delete().in("id", p.deletes);
      if (error) throw new Error(`delete: ${error.message}`);
    }
    if (p.insert) {
      const { error } = await supabase.from("game_releases").insert(p.insert);
      if (error) throw new Error(`insert: ${error.message}`);
    }
    done += 1;
    if (done % 5000 === 0) console.log(`  applied: ${done}/${plan.length}`);
  });
  console.log(`Applied: ${done}, failed: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
