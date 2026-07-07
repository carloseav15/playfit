// Creates NEW rows in games_library.games from IGDB console/handheld games
// that have no Playfit counterpart yet (reports/igdb-new-games.ndjson +
// reports/igdb-games.ndjson, from fetch-igdb-new-games.mjs).
//
// This is a different kind of operation than every other script in this
// pipeline: those only filled gaps in existing rows. This one inserts brand
// new canonical games, so it's higher-risk (duplicate creation, id
// collisions) and always run with --dry-run first.
//
// game_id is generated in JS to mirror games_library_private
// .slugify_game_id_unaccent (NFKD-normalize, strip diacritics, lowercase,
// non a-z0-9 -> underscore, collapse/trim) since that function lives in a
// private schema not reachable over PostgREST from a plain script. Collisions
// against existing games or other candidates in the same run are
// disambiguated with a year suffix, then the igdb id as a last resort.
//
// Usage:
//   SUPABASE_SERVICE_KEY=... node scripts/apply-igdb-new-games.mjs [--dry-run] [--limit 500]
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const GAMES_FILE = new URL("../reports/igdb-games.ndjson", import.meta.url);
const NEW_GAMES_FILE = new URL("../reports/igdb-new-games.ndjson", import.meta.url);
const REPORT_FILE = new URL("../reports/igdb-new-games-preview.json", import.meta.url);

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
const LIMIT = argValue("--limit") ? Number(argValue("--limit")) : null;
const CONCURRENCY = 20;

// Same console platform allowlist as fetch-igdb-new-games.mjs, mapped to
// Playfit's own platform ids (verified against games_library.platforms).
const IGDB_TO_PLAYFIT_PLATFORM = {
  4: "n64",
  37: "3ds",
  137: "3ds",
  59: "atari_2600",
  23: "dreamcast",
  20: "ds",
  159: "ds",
  35: "game_gear",
  21: "gamecube",
  33: "gb",
  24: "gba",
  22: "gbc",
  29: "genesis",
  79: "neo_geo",
  80: "neo_geo",
  136: "neo_geo",
  18: "nes",
  99: "nes",
  51: "nes",
  46: "ps_vita",
  7: "ps1",
  8: "ps2",
  9: "ps3",
  48: "ps4",
  167: "ps5",
  38: "psp",
  32: "saturn",
  64: "sega_master_system",
  19: "snes",
  58: "snes",
  130: "switch_1",
  508: "switch_2",
  5: "wii",
  41: "wii_u",
  12: "xbox_360",
  49: "xbox_one",
  11: "xbox_original",
  169: "xbox_series_xs",
};

const PLATFORM_NAMES = {
  "3ds": "Nintendo 3DS",
  atari_2600: "Atari 2600",
  dreamcast: "Dreamcast",
  ds: "Nintendo DS",
  game_gear: "Game Gear",
  gamecube: "GameCube",
  gb: "Game Boy",
  gba: "Game Boy Advance",
  gbc: "Game Boy Color",
  genesis: "Genesis",
  n64: "Nintendo 64",
  neo_geo: "Neo Geo",
  nes: "NES",
  ps_vita: "PS Vita",
  ps1: "PlayStation",
  ps2: "PlayStation 2",
  ps3: "PlayStation 3",
  ps4: "PlayStation 4",
  ps5: "PlayStation 5",
  psp: "PSP",
  saturn: "Saturn",
  sega_master_system: "Sega Master System",
  snes: "SNES",
  switch_1: "Nintendo Switch",
  switch_2: "Nintendo Switch 2",
  wii: "Wii",
  wii_u: "Wii U",
  xbox_360: "Xbox 360",
  xbox_one: "Xbox One",
  xbox_original: "Xbox",
  xbox_series_xs: "Xbox Series X|S",
};

// Same priority-resolution logic as apply-igdb-enrichment.mjs, restricted to
// genre ids that exist in games_library.genres.
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

function slugifyUnaccent(title) {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

async function fetchAllExistingGameIds() {
  const ids = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("games")
      .select("game_id")
      .order("game_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of data) ids.add(r.game_id);
    if (data.length < PAGE) break;
  }
  return ids;
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
        console.error(`  ${JSON.stringify(item).slice(0, 100)}: ${e.message}`);
      }
    }
  });
  await Promise.all(lanes);
  return failed;
}

function igdbCoverUrl(imageId) {
  return `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
}

async function main() {
  const baseById = new Map();
  for (const l of readFileSync(GAMES_FILE, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(l);
    baseById.set(r.id, r);
  }
  const enrichRows = readFileSync(NEW_GAMES_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  console.log(`Candidates: ${enrichRows.length}`);

  const existingGameIds = await fetchAllExistingGameIds();
  console.log(`Existing games (for collision check): ${existingGameIds.size}`);

  const games = [];
  const companyInserts = [];
  const scoreInserts = [];
  const usedIds = new Set();
  const needsReview = [];

  for (const enrich of enrichRows) {
    const base = baseById.get(enrich.igdb_id);
    if (!base) continue;

    const platforms = [
      ...new Set(base.platforms.map((p) => IGDB_TO_PLAYFIT_PLATFORM[p]).filter(Boolean)),
    ];
    if (platforms.length === 0) continue;
    const platformNames = platforms.map((p) => PLATFORM_NAMES[p]);

    // A collision against a PRE-EXISTING Playfit game means Playfit likely
    // already has this exact game and our earlier IGDB match just missed it
    // (e.g. IGDB has both an original and a remake sharing the same title,
    // which match-igdb-covers.mjs treats as ambiguous and skips). Inserting
    // here would risk a real duplicate, so these are set aside for manual
    // review instead of auto-created.
    //
    // A collision against another NEW candidate from this same run (not an
    // existing game) isn't a duplicate risk - it's just two different,
    // legitimately-missing games that happen to share a title on different
    // platforms (the same pattern Playfit already uses, e.g. brutal_legend
    // vs brutal_legend_2013), so it's disambiguated with a year suffix.
    const baseSlug = slugifyUnaccent(base.name);
    if (existingGameIds.has(baseSlug)) {
      needsReview.push({ igdb_id: enrich.igdb_id, title: base.name, year: base.year, reason: "collides_with_existing_game" });
      continue;
    }
    let gameId = baseSlug;
    if (usedIds.has(gameId)) {
      const withYear = base.year ? `${gameId}_${base.year}` : gameId;
      if (!existingGameIds.has(withYear) && !usedIds.has(withYear)) {
        gameId = withYear;
      } else {
        needsReview.push({ igdb_id: enrich.igdb_id, title: base.name, year: base.year, reason: "collides_with_new_candidate" });
        continue;
      }
    }
    usedIds.add(gameId);

    games.push({
      game_id: gameId,
      title: base.name,
      aliases: base.alt_names ?? [],
      release_year: base.year,
      release_state: "released",
      source_type: "catalog",
      source_ref: "",
      cover_url: igdbCoverUrl(base.image_id),
      notes: enrich.summary ? enrich.summary.trim() : "",
      genre_id: resolveGenre(enrich.genres),
      platforms,
      platform_names: platformNames,
      _igdb_id: enrich.igdb_id,
    });

    for (const name of enrich.developers) {
      companyInserts.push({ game_id: gameId, company_name: name, role: "developer", source: "igdb", source_key: `igdb:${enrich.igdb_id}` });
    }
    for (const name of enrich.publishers) {
      companyInserts.push({ game_id: gameId, company_name: name, role: "publisher", source: "igdb", source_key: `igdb:${enrich.igdb_id}` });
    }

    const critic_score = enrich.critic_rating != null ? Math.round(enrich.critic_rating) : null;
    const user_score = enrich.user_rating != null ? Math.round((enrich.user_rating / 10) * 10) / 10 : null;
    if (critic_score != null || user_score != null) {
      scoreInserts.push({
        game_id: gameId,
        score_source: "igdb",
        critic_score,
        critic_count: critic_score != null ? enrich.critic_rating_count : null,
        user_score,
        user_count: user_score != null ? enrich.user_rating_count : null,
        source_key: `igdb:${enrich.igdb_id}`,
      });
    }
  }

  const limited = LIMIT ? games.slice(0, LIMIT) : games;
  const limitedIds = new Set(limited.map((g) => g.game_id));
  const limitedCompanies = companyInserts.filter((c) => limitedIds.has(c.game_id));
  const limitedScores = scoreInserts.filter((s) => limitedIds.has(s.game_id));

  console.log(`Games to insert: ${limited.length} (of ${games.length})`);
  console.log(`Set aside for manual review (title collision): ${needsReview.length}`);
  console.log(`Company rows: ${limitedCompanies.length}, Score rows: ${limitedScores.length}`);
  console.log(`With genre resolved: ${limited.filter((g) => g.genre_id).length}`);
  console.log(`With summary/notes: ${limited.filter((g) => g.notes).length}`);

  writeFileSync(REPORT_FILE, JSON.stringify(limited.slice(0, 50), null, 2));
  writeFileSync(
    new URL("../reports/igdb-new-games-needs-review.json", import.meta.url),
    JSON.stringify(needsReview, null, 2),
  );
  console.log(`Preview (first 50) written to reports/igdb-new-games-preview.json`);
  console.log(`Needs-review list written to reports/igdb-new-games-needs-review.json`);

  if (DRY_RUN) {
    for (const g of limited.slice(0, 10)) {
      console.log(`  ${g.game_id} | ${g.title} (${g.release_year}) | ${g.platforms.join(",")} | genre=${g.genre_id}`);
    }
    console.log("Dry run, no changes written.");
    return;
  }

  let doneGames = 0;
  const failedGames = await runPool(limited, async (g) => {
    const { _igdb_id, ...row } = g;
    const { error } = await supabase.from("games").insert(row);
    if (error) throw new Error(error.message);
    const { error: linkError } = await supabase.from("game_external_ids").insert({
      game_id: g.game_id,
      provider: "igdb",
      provider_game_key: String(_igdb_id),
      source_title: g.title,
      confidence_score: 100,
      metadata: { cover_image_id: baseById.get(_igdb_id)?.image_id, matched_by: "new_game_catalog_import" },
    });
    if (linkError) throw new Error(`external_id: ${linkError.message}`);
    doneGames += 1;
    if (doneGames % 1000 === 0) console.log(`  games: ${doneGames}/${limited.length}`);
  });
  console.log(`Games inserted: ${doneGames}, failed: ${failedGames}`);

  let doneCompanies = 0;
  const failedCompanies = await runPool(limitedCompanies, async (c) => {
    const { error } = await supabase.from("game_companies").insert(c);
    if (error) throw new Error(error.message);
    doneCompanies += 1;
  });
  console.log(`Companies inserted: ${doneCompanies}, failed: ${failedCompanies}`);

  let doneScores = 0;
  const failedScores = await runPool(limitedScores, async (s) => {
    const { error } = await supabase.from("game_scores").insert(s);
    if (error) throw new Error(error.message);
    doneScores += 1;
  });
  console.log(`Scores inserted: ${doneScores}, failed: ${failedScores}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
