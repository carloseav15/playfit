// Backfills games_library.game_genres (the multi-genre junction, barely
// used: 107 rows before this) from IGDB's full genres[] array, reusing
// reports/igdb-enrichment.ndjson (already fetched by fetch-igdb-enrichment.mjs
// for genre_id/series_id/notes - no new API calls needed).
//
// games.genre_id already holds ONE genre per game (resolved via priority
// rules in apply-igdb-enrichment.mjs's resolveGenre()). This script is purely
// additive: it links every IGDB genre that has a clean, unambiguous 1:1
// match to an existing games_library.genres slug (verified against a live
// query - no new genre slugs are created, same restraint as resolveGenre).
// Combo-only slugs (tactical_rpg, action_rpg, jrpg, metroidvania, etc.) are
// intentionally left alone since they require judgment this script doesn't
// have; games.genre_id already covers those cases where detectable.
//
// Usage:
//   SUPABASE_SERVICE_KEY=... node scripts/apply-igdb-game-genres.mjs [--dry-run]
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

const ENRICHMENT_FILE = new URL("../reports/igdb-enrichment.ndjson", import.meta.url);

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is required.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

const DRY_RUN = process.argv.includes("--dry-run");

// Direct 1:1 matches only (verified against the 37 existing genre slugs).
// Ambiguous IGDB genres (Card & Board Game spans two local slugs, Music /
// Quiz-Trivia have no local equivalent) are intentionally omitted.
const IGDB_GENRE_TO_SLUG = {
  "Fighting": "fighting",
  "Shooter": "shooter",
  "Platform": "platformer",
  "Point-and-click": "point_and_click_adventure",
  "Puzzle": "puzzle",
  "Racing": "racing",
  "Simulator": "simulation",
  "Sport": "sports",
  "Visual Novel": "visual_novel",
  "Arcade": "arcade",
  "Adventure": "adventure",
  "Indie": "indie",
  "MOBA": "massively_multiplayer",
  "Role-playing (RPG)": "rpg",
  "Tactical": "tactical_strategy",
  "Turn-based strategy (TBS)": "strategy",
  "Real Time Strategy (RTS)": "strategy",
  "Strategy": "strategy",
  "Hack and slash/Beat 'em up": "action",
  "4X (explore, expand, exploit, and exterminate)": "strategy",
};

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
  const enrichmentByIgdbId = new Map();
  await readNdjson(ENRICHMENT_FILE, (r) => enrichmentByIgdbId.set(r.igdb_id, r.genres));
  console.log(`Enrichment records: ${enrichmentByIgdbId.size}`);

  const links = await fetchAllRows(
    "game_external_ids",
    "game_id,provider_game_key",
    (q) => q.eq("provider", "igdb"),
  );
  const igdbIdByGame = new Map(links.map((l) => [l.game_id, Number(l.provider_game_key)]));

  const games = await fetchAllRows("games", "game_id,pk");
  const gameRefByGameId = new Map(games.map((g) => [g.game_id, g.pk]));

  const genres = await fetchAllRows("genres", "id,pk", null, "id");
  const genreRefById = new Map(genres.map((g) => [g.id, g.pk]));

  const existingLinks = await fetchAllRows("game_genres", "game_id,genre_id");
  const existingSet = new Set(existingLinks.map((l) => `${l.game_id}::${l.genre_id}`));

  const toInsert = [];
  for (const [gameId, igdbId] of igdbIdByGame) {
    const igdbGenres = enrichmentByIgdbId.get(igdbId);
    if (!igdbGenres || igdbGenres.length === 0) continue;
    const gameRef = gameRefByGameId.get(gameId);
    if (!gameRef) continue;

    const slugs = new Set();
    for (const name of igdbGenres) {
      const slug = IGDB_GENRE_TO_SLUG[name];
      if (slug) slugs.add(slug);
    }
    for (const slug of slugs) {
      const key = `${gameId}::${slug}`;
      if (existingSet.has(key)) continue;
      const genreRef = genreRefById.get(slug);
      if (!genreRef) continue;
      existingSet.add(key);
      toInsert.push({ game_id: gameId, genre_id: slug, game_ref: gameRef, genre_ref: genreRef });
    }
  }

  console.log(`New game_genres links to insert: ${toInsert.length}`);
  if (DRY_RUN) {
    console.log(toInsert.slice(0, 15));
    console.log("Dry run, no changes written.");
    return;
  }

  const CHUNK = 1000;
  let done = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const { error } = await supabase.from("game_genres").insert(toInsert.slice(i, i + CHUNK));
    if (error) throw new Error(`insert: ${error.message}`);
    done += Math.min(CHUNK, toInsert.length - i);
    console.log(`  applied: ${done}/${toInsert.length}`);
  }
  console.log(`Applied: ${done}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
