// Applies reports/igdb-similar-games.ndjson (from fetch-igdb-similar-games.mjs)
// to games_library.game_similar_games. Each entry in IGDB's similar_games is
// a reference to another game in IGDB's full catalog (~350k+ games) - only
// ones that also exist in Playfit (linked via game_external_ids) are kept.
// Verified live: ~62.5% of references resolve locally, and 97.4% of games
// with similar_games data have at least one resolvable match.
//
// Purely additive - no prior data, no gap-fill-vs-overwrite question.
//
// Usage:
//   SUPABASE_SERVICE_KEY=... node scripts/apply-igdb-similar-games.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

const SIMILAR_FILE = new URL("../reports/igdb-similar-games.ndjson", import.meta.url);

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is required.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

const DRY_RUN = process.argv.includes("--dry-run");

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
  const similarByIgdbId = new Map();
  await readNdjson(SIMILAR_FILE, (r) => similarByIgdbId.set(r.igdb_id, r.similar_games));
  console.log(`Similar-games records: ${similarByIgdbId.size}`);

  const links = await fetchAllRows(
    "game_external_ids",
    "game_id,provider_game_key",
    (q) => q.eq("provider", "igdb"),
  );
  const gameIdByIgdbId = new Map(links.map((l) => [Number(l.provider_game_key), l.game_id]));
  const igdbIdByGame = new Map(links.map((l) => [l.game_id, Number(l.provider_game_key)]));

  const games = await fetchAllRows("games", "game_id,pk");
  const gameRefByGameId = new Map(games.map((g) => [g.game_id, g.pk]));

  const existingLinks = await fetchAllRows("game_similar_games", "game_id,similar_game_id");
  const existingSet = new Set(existingLinks.map((l) => `${l.game_id}::${l.similar_game_id}`));

  const toInsert = [];
  const stats = { gamesWithData: 0, gamesWithAtLeastOneMatch: 0, refsResolved: 0, refsUnresolved: 0 };

  for (const [gameId, igdbId] of igdbIdByGame) {
    const similarIgdbIds = similarByIgdbId.get(igdbId);
    if (!similarIgdbIds || similarIgdbIds.length === 0) continue;
    stats.gamesWithData += 1;
    const gameRef = gameRefByGameId.get(gameId);
    if (!gameRef) continue;

    let matchedAny = false;
    for (const targetIgdbId of similarIgdbIds) {
      const targetGameId = gameIdByIgdbId.get(targetIgdbId);
      if (!targetGameId || targetGameId === gameId) {
        stats.refsUnresolved += 1;
        continue;
      }
      const targetGameRef = gameRefByGameId.get(targetGameId);
      if (!targetGameRef) {
        stats.refsUnresolved += 1;
        continue;
      }
      stats.refsResolved += 1;
      matchedAny = true;
      const key = `${gameId}::${targetGameId}`;
      if (existingSet.has(key)) continue;
      existingSet.add(key);
      toInsert.push({
        game_id: gameId,
        game_ref: gameRef,
        similar_game_id: targetGameId,
        similar_game_ref: targetGameRef,
        source: "igdb",
      });
    }
    if (matchedAny) stats.gamesWithAtLeastOneMatch += 1;
  }

  console.log(`Games with similar_games data: ${stats.gamesWithData}`);
  console.log(`Games with >=1 resolvable local match: ${stats.gamesWithAtLeastOneMatch}`);
  console.log(`References resolved locally: ${stats.refsResolved}`);
  console.log(`References with no local match (skipped): ${stats.refsUnresolved}`);
  console.log(`New game_similar_games links to insert: ${toInsert.length}`);

  if (DRY_RUN) {
    console.log(toInsert.slice(0, 10));
    console.log("Dry run, no changes written.");
    return;
  }

  const CHUNK = 1000;
  let done = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const { error } = await supabase.from("game_similar_games").insert(toInsert.slice(i, i + CHUNK));
    if (error) throw new Error(`insert: ${error.message}`);
    done += Math.min(CHUNK, toInsert.length - i);
    if (done % 10000 < CHUNK) console.log(`  applied: ${done}/${toInsert.length}`);
  }
  console.log(`Applied: ${done}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
