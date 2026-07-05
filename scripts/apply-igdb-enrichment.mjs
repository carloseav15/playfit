// Applies reports/igdb-enrichment.ndjson (from fetch-igdb-enrichment.mjs) to
// fill gaps in games_library.games: genre_id, series_id, notes.
//
// Gap-filling only: never overwrites a value the game already has, same
// convention as every other backfill in this repo (gamesdatabase, psxdatacenter).
//
// - genre_id: resolved from IGDB's genres[] array (a fixed 23-item taxonomy)
//   using priority rules that combine co-occurring genres (e.g. RPG + Tactical
//   -> tactical_rpg) before falling back to coarser single-genre mappings.
//   Only genre ids that exist in games_library.genres are ever assigned.
// - series_id: IGDB collections[] (franchise names) matched by exact
//   normalized name against Playfit's existing, curated series list. No new
//   series are created; ambiguous (multiple distinct series match) is skipped.
// - notes: IGDB summary text, used verbatim when notes is empty.
//
// Usage:
//   SUPABASE_SERVICE_KEY=... node scripts/apply-igdb-enrichment.mjs [--dry-run]
//     [--only genre,series,notes] [--limit 500]
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

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? null : process.argv[idx + 1];
}

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY = argValue("--only") ? new Set(argValue("--only").split(",")) : new Set(["genre", "series", "notes"]);
const LIMIT = argValue("--limit") ? Number(argValue("--limit")) : null;
const CONCURRENCY = 20;

function normalizeTitle(t) {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Only Playfit genre ids that exist in games_library.genres (verified against
// a live query, not guessed): resolveGenre() below never returns an id
// outside this set.
function resolveGenre(igdbGenreNames) {
  const g = new Set(igdbGenreNames);
  const has = (name) => g.has(name);

  const hasRpg = has("Role-playing (RPG)");
  const hasTactical = has("Tactical");
  const hasTbsRtsStrategy = has("Turn-based strategy (TBS)") || has("Real Time Strategy (RTS)") || has("Strategy");

  if (hasRpg && hasTactical) return "tactical_rpg";
  if (hasRpg) return "rpg";
  if (hasTactical) return "tactical_strategy";
  if (hasTbsRtsStrategy) return "strategy";
  if (has("Fighting")) return "fighting";
  if (has("Shooter")) return "shooter";
  if (has("Platform")) return "platformer";
  if (has("Point-and-click")) return "point_and_click_adventure";
  if (has("Puzzle")) return "puzzle";
  if (has("Racing")) return "racing";
  if (has("Simulator")) return "simulation";
  if (has("Sport")) return "sports";
  if (has("Hack and slash/Beat 'em up")) return "action";
  if (has("Visual Novel")) return "visual_novel";
  if (has("Card & Board Game")) return "card";
  if (has("Arcade")) return "arcade";
  if (has("Adventure")) return "adventure";
  if (has("Indie")) return "indie";
  if (has("MOBA")) return "massively_multiplayer";
  return null;
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
  const enrichmentByIgdbId = new Map();
  await readNdjson(ENRICHMENT_FILE, (r) => enrichmentByIgdbId.set(r.igdb_id, r));
  console.log(`Enrichment records: ${enrichmentByIgdbId.size}`);

  const links = await fetchAllRows(
    "game_external_ids",
    "game_id,provider_game_key",
    (q) => q.eq("provider", "igdb"),
  );
  const igdbIdByGame = new Map(links.map((l) => [l.game_id, Number(l.provider_game_key)]));

  const games = await fetchAllRows("games", "game_id,genre_id,series_id,notes");
  const seriesRows = await fetchAllRows("series", "id,name", null, "id");
  const seriesByNormName = new Map();
  for (const s of seriesRows) {
    const key = normalizeTitle(s.name);
    if (!seriesByNormName.has(key)) seriesByNormName.set(key, new Set());
    seriesByNormName.get(key).add(s.id);
  }

  const updates = [];
  const stats = { genre: 0, series: 0, notes: 0 };

  for (const game of games) {
    const igdbId = igdbIdByGame.get(game.game_id);
    if (!igdbId) continue;
    const enrich = enrichmentByIgdbId.get(igdbId);
    if (!enrich) continue;

    const patch = {};

    if (ONLY.has("genre") && !game.genre_id) {
      const genreId = resolveGenre(enrich.genres);
      if (genreId) {
        patch.genre_id = genreId;
        stats.genre += 1;
      }
    }

    if (ONLY.has("series") && !game.series_id && enrich.collections.length > 0) {
      const matchedIds = new Set();
      for (const name of enrich.collections) {
        const hit = seriesByNormName.get(normalizeTitle(name));
        if (hit) for (const id of hit) matchedIds.add(id);
      }
      if (matchedIds.size === 1) {
        patch.series_id = [...matchedIds][0];
        stats.series += 1;
      }
    }

    if (ONLY.has("notes") && !game.notes && enrich.summary) {
      patch.notes = enrich.summary.trim();
      stats.notes += 1;
    }

    if (Object.keys(patch).length > 0) {
      updates.push({ game_id: game.game_id, patch });
    }
  }

  const limited = LIMIT ? updates.slice(0, LIMIT) : updates;
  console.log(`Games to update: ${limited.length} (of ${updates.length} eligible)`);
  console.log(`  genre_id fills: ${stats.genre}`);
  console.log(`  series_id fills: ${stats.series}`);
  console.log(`  notes fills: ${stats.notes}`);

  if (DRY_RUN) {
    for (const u of limited.slice(0, 15)) {
      console.log(`  ${u.game_id}: ${JSON.stringify(u.patch)}`);
    }
    console.log("Dry run, no changes written.");
    return;
  }

  let done = 0;
  const failed = await runPool(limited, async (u) => {
    const { error } = await supabase.from("games").update(u.patch).eq("game_id", u.game_id);
    if (error) throw new Error(error.message);
    done += 1;
    if (done % 5000 === 0) console.log(`  applied: ${done}/${limited.length}`);
  });
  console.log(`Applied: ${done}, failed: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
