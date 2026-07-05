// Applies reports/igdb-age-ratings.ndjson (from fetch-igdb-age-ratings.mjs)
// to games_library.game_age_ratings, per rating board (ESRB/PEGI/CERO/etc).
//
// Local data is currently ESRB-only (rawg/metacritic/vgsales, all US-centric
// sources), stored inconsistently as either full names ("Teen") or
// abbreviations ("T") depending on source. IGDB adds PEGI/CERO/USK/GRAC/
// CLASS_IND/ACB for the first time, plus fills ESRB gaps.
//
// Policy (same as game_releases, 2026-07-04 decision): IGDB is the source of
// truth. For a given (game, board), if an existing rating disagrees with
// IGDB's, the old row is deleted and replaced. Ratings are compared after
// normalizing full ESRB names to abbreviations so "Teen" vs "T" isn't
// flagged as a false conflict.
//
// Usage:
//   SUPABASE_SERVICE_KEY=... node scripts/apply-igdb-age-ratings.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

const RATINGS_FILE = new URL("../reports/igdb-age-ratings.ndjson", import.meta.url);

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is required.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

const DRY_RUN = process.argv.includes("--dry-run");
const CONCURRENCY = 20;

// Only ESRB has full-name variants in the existing data (rawg source).
const ESRB_FULL_NAME_TO_ABBR = {
  "rating pending": "RP",
  "everyone": "E",
  "everyone 10+": "E10+",
  "teen": "T",
  "mature": "M",
  "adults only": "AO",
};

function normalizeExistingRating(board, rating) {
  if (board !== "ESRB") return rating;
  const key = rating.trim().toLowerCase();
  return ESRB_FULL_NAME_TO_ABBR[key] ?? rating;
}

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
  const ratingsByIgdbId = new Map();
  await readNdjson(RATINGS_FILE, (r) => ratingsByIgdbId.set(r.igdb_id, r.ratings));
  console.log(`Age rating records: ${ratingsByIgdbId.size}`);

  const links = await fetchAllRows(
    "game_external_ids",
    "game_id,provider_game_key",
    (q) => q.eq("provider", "igdb"),
  );
  const igdbIdByGame = new Map(links.map((l) => [l.game_id, Number(l.provider_game_key)]));

  const games = await fetchAllRows("games", "game_id,pk");
  const gameRefByGameId = new Map(games.map((g) => [g.game_id, g.pk]));

  const existing = await fetchAllRows(
    "game_age_ratings",
    "id,game_id,rating_board,rating,source",
  );
  const existingByGameBoard = new Map();
  for (const r of existing) {
    const key = `${r.game_id}::${r.rating_board}`;
    if (!existingByGameBoard.has(key)) existingByGameBoard.set(key, []);
    existingByGameBoard.get(key).push(r);
  }

  const plan = [];
  const stats = { gapFill: 0, conflictFixed: 0, alreadyCorrect: 0 };

  for (const [gameId, igdbId] of igdbIdByGame) {
    const ratings = ratingsByIgdbId.get(igdbId);
    if (!ratings || ratings.length === 0) continue;
    const gameRef = gameRefByGameId.get(gameId);
    if (!gameRef) continue;

    const byBoard = new Map();
    for (const r of ratings) if (!byBoard.has(r.board)) byBoard.set(r.board, r.rating);

    for (const [board, rating] of byBoard) {
      const key = `${gameId}::${board}`;
      const existingRows = existingByGameBoard.get(key) ?? [];
      const matching = existingRows.filter((e) => normalizeExistingRating(board, e.rating) === rating);
      const conflicting = existingRows.filter((e) => normalizeExistingRating(board, e.rating) !== rating);

      if (matching.length > 0) {
        stats.alreadyCorrect += 1;
        if (conflicting.length > 0) {
          plan.push({ game_id: gameId, deletes: conflicting.map((c) => c.id), insert: null });
          stats.conflictFixed += 1;
        }
        continue;
      }

      stats[conflicting.length > 0 ? "conflictFixed" : "gapFill"] += 1;
      plan.push({
        game_id: gameId,
        deletes: conflicting.map((c) => c.id),
        insert: {
          game_id: gameId,
          game_ref: gameRef,
          platform_id: null,
          rating_board: board,
          rating,
          source: "igdb",
          source_key: String(igdbId),
        },
      });
    }
  }

  console.log(`Plan: ${plan.length} operations`);
  console.log(`  gap fills (no prior row for this board): ${stats.gapFill}`);
  console.log(`  conflicts fixed (igdb overwrote a differing rating): ${stats.conflictFixed}`);
  console.log(`  already correct (no-op): ${stats.alreadyCorrect}`);

  if (DRY_RUN) {
    for (const p of plan.slice(0, 15)) console.log(" ", JSON.stringify(p));
    console.log("Dry run, no changes written.");
    return;
  }

  let done = 0;
  const failed = await runPool(plan, async (p) => {
    if (p.deletes.length > 0) {
      const { error } = await supabase.from("game_age_ratings").delete().in("id", p.deletes);
      if (error) throw new Error(`delete: ${error.message}`);
    }
    if (p.insert) {
      const { error } = await supabase.from("game_age_ratings").insert(p.insert);
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
