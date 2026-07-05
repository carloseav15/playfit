// Resolves reports/igdb-new-games-needs-review.json (candidates that
// apply-igdb-new-games.mjs found colliding with an EXISTING Playfit game_id,
// and therefore skipped instead of inserting) without requiring per-case
// manual review. IGDB is treated as the source of truth: a collision is
// resolved using platform + release-year overlap, the same signal
// match-igdb-covers.mjs already uses (YEAR_MAX_GAP=3) to decide "same game,
// another platform release" vs "different game, same name" (see the Tetris
// mobile vs Tetris NES/GB case from the 2026-07-04 coverage diagnostic - they
// share a title but are unrelated products).
//
// Three buckets per candidate:
//   link_same_platform  - candidate's platform(s) already listed for the
//     existing game_id -> just add it as another igdb source for that slot.
//   extend_new_platform - no platform overlap, but year is within
//     YEAR_MAX_GAP of the existing game's year (or an already-linked
//     sibling's year) -> same game, a platform Playfit was missing. Adds the
//     platform to game_platforms + a game_releases row + the igdb link.
//   insert_as_new        - no platform overlap and no compatible year ->
//     likely a different product sharing a title. Inserted as a brand-new
//     game_id (year-suffixed on collision), same logic as
//     apply-igdb-new-games.mjs's non-colliding path.
//
// No schema changes: game_external_ids already allows multiple igdb links
// per game_id (UNIQUE is game_id+provider+provider_game_key) and already has
// an unused source_platform_id column; game_releases/game_scores are already
// per-platform. See plan at ~/.claude/plans/hazy-booping-knuth.md.
//
// Usage:
//   SUPABASE_SERVICE_KEY=... node scripts/resolve-igdb-title-collisions.mjs [--dry-run] [--limit 500]
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

const GAMES_FILE = new URL("../reports/igdb-games.ndjson", import.meta.url);
const NEW_GAMES_FILE = new URL("../reports/igdb-new-games.ndjson", import.meta.url);
const NEEDS_REVIEW_FILE = new URL("../reports/igdb-new-games-needs-review.json", import.meta.url);
const REPORT_FILE = new URL("../reports/igdb-title-collisions-resolution.json", import.meta.url);

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
const YEAR_MAX_GAP = 3; // same constant already validated in match-igdb-covers.mjs

// Same map as apply-igdb-new-games.mjs, plus n64 (id 4) which that map and
// fetch-igdb-new-games.mjs's CONSOLE_IDS never included (found this session -
// see memory: igdb_n64_platform_gap). Candidates only reach n64 via
// alt-platform overlap here, doesn't change behavior for this script.
const IGDB_TO_PLAYFIT_PLATFORM = {
  37: "3ds", 137: "3ds",
  59: "atari_2600",
  23: "dreamcast",
  20: "ds", 159: "ds",
  35: "game_gear",
  21: "gamecube",
  33: "gb",
  24: "gba",
  22: "gbc",
  29: "genesis",
  79: "neo_geo", 80: "neo_geo", 136: "neo_geo",
  18: "nes", 99: "nes", 51: "nes",
  4: "n64",
  46: "ps_vita",
  7: "ps1",
  8: "ps2",
  9: "ps3",
  48: "ps4",
  167: "ps5",
  38: "psp",
  32: "saturn",
  64: "sega_master_system",
  19: "snes", 58: "snes",
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
  "3ds": "Nintendo 3DS", atari_2600: "Atari 2600", dreamcast: "Dreamcast", ds: "Nintendo DS",
  game_gear: "Game Gear", gamecube: "GameCube", gb: "Game Boy", gba: "Game Boy Advance",
  gbc: "Game Boy Color", genesis: "Genesis", n64: "Nintendo 64", neo_geo: "Neo Geo", nes: "NES",
  ps_vita: "PS Vita", ps1: "PlayStation", ps2: "PlayStation 2", ps3: "PlayStation 3",
  ps4: "PlayStation 4", ps5: "PlayStation 5", psp: "PSP", saturn: "Saturn",
  sega_master_system: "Sega Master System", snes: "SNES", switch_1: "Nintendo Switch",
  switch_2: "Nintendo Switch 2", wii: "Wii", wii_u: "Wii U", xbox_360: "Xbox 360",
  xbox_one: "Xbox One", xbox_original: "Xbox", xbox_series_xs: "Xbox Series X|S",
};

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

function igdbCoverUrl(imageId) {
  return `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
}

async function fetchInChunks(table, columns, column, values, extraFilter) {
  const rows = [];
  const CHUNK = 150;
  const uniq = [...new Set(values)];
  for (let i = 0; i < uniq.length; i += CHUNK) {
    const batch = uniq.slice(i, i + CHUNK);
    let q = supabase.from(table).select(columns).in(column, batch);
    if (extraFilter) q = extraFilter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
  }
  return rows;
}

async function fetchAllExistingGameIds() {
  const ids = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("games").select("game_id").order("game_id").range(from, from + PAGE - 1);
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
        console.error(`  ${JSON.stringify(item).slice(0, 120)}: ${e.message}`);
      }
    }
  });
  await Promise.all(lanes);
  return failed;
}

async function main() {
  const baseById = new Map();
  for (const l of readFileSync(GAMES_FILE, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(l);
    baseById.set(r.id, r);
  }
  const enrichById = new Map();
  for (const l of readFileSync(NEW_GAMES_FILE, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(l);
    enrichById.set(r.igdb_id, r);
  }
  const collisions = JSON.parse(readFileSync(NEEDS_REVIEW_FILE, "utf8")).filter(
    (r) => r.reason === "collides_with_existing_game",
  );
  console.log(`Title collisions to resolve: ${collisions.length}`);

  // Compute target game_id per collision.
  const withTarget = [];
  for (const c of collisions) {
    const base = baseById.get(c.igdb_id);
    if (!base) continue;
    const platforms = [
      ...new Set(base.platforms.map((p) => IGDB_TO_PLAYFIT_PLATFORM[p]).filter(Boolean)),
    ];
    if (platforms.length === 0) continue;
    withTarget.push({ ...c, base, platforms, targetGameId: slugifyUnaccent(base.name) });
  }

  const targetGameIds = withTarget.map((c) => c.targetGameId);
  console.log(`Fetching current state for ${new Set(targetGameIds).size} unique existing game_ids...`);

  const [gameRows, platformRows, linkRows, allExistingGameIds, platformRefRows] = await Promise.all([
    fetchInChunks("games", "game_id,release_year,pk", "game_id", targetGameIds),
    fetchInChunks("game_platforms", "game_id,platform_id", "game_id", targetGameIds),
    fetchInChunks("game_external_ids", "game_id,provider_game_key", "game_id", targetGameIds, (q) => q.eq("provider", "igdb")),
    fetchAllExistingGameIds(),
    supabase.from("platforms").select("id,pk").then(({ data, error }) => {
      if (error) throw new Error(`platforms: ${error.message}`);
      return data;
    }),
  ]);

  // game_ref/platform_ref (bigint FKs to games.pk / platforms.pk) are
  // required NOT NULL on game_platforms, game_releases, game_scores,
  // game_companies, game_external_ids as of the 2026-07-04 surrogate-key
  // migrations - nothing auto-populates them from the text game_id/
  // platform_id columns (verified: no BEFORE INSERT trigger on any of these
  // tables), so every insert below must resolve and set them explicitly.
  const platformRefById = new Map(platformRefRows.map((r) => [r.id, r.pk]));
  const gamePkByGameId = new Map(gameRows.map((r) => [r.game_id, r.pk]));

  const yearByGameId = new Map(gameRows.map((r) => [r.game_id, r.release_year]));
  const platformsByGameId = new Map();
  for (const r of platformRows) {
    if (!platformsByGameId.has(r.game_id)) platformsByGameId.set(r.game_id, new Set());
    platformsByGameId.get(r.game_id).add(r.platform_id);
  }
  const linksByGameId = new Map();
  for (const r of linkRows) {
    if (!linksByGameId.has(r.game_id)) linksByGameId.set(r.game_id, []);
    linksByGameId.get(r.game_id).push(Number(r.provider_game_key));
  }

  const buckets = { link_same_platform: [], extend_new_platform: [], insert_as_new: [] };

  for (const c of withTarget) {
    const existingPlatforms = platformsByGameId.get(c.targetGameId) ?? new Set();
    const overlap = c.platforms.filter((p) => existingPlatforms.has(p));
    if (overlap.length > 0) {
      buckets.link_same_platform.push({ ...c, matchedPlatforms: overlap });
      continue;
    }

    const siblingYears = (linksByGameId.get(c.targetGameId) ?? [])
      .map((id) => baseById.get(id)?.year)
      .filter((y) => y != null);
    const ownYear = yearByGameId.get(c.targetGameId);
    // release_year=0 is a placeholder for "unknown" on ~900 existing rows
    // (incomplete/stub entries), not a real year - treat it like null so it
    // doesn't produce a bogus multi-decade gap against every candidate.
    const referenceYears = [ownYear, ...siblingYears].filter((y) => y != null && y !== 0);

    if (c.base.year != null && referenceYears.length > 0) {
      const minGap = Math.min(...referenceYears.map((y) => Math.abs(y - c.base.year)));
      if (minGap <= YEAR_MAX_GAP) {
        buckets.extend_new_platform.push({ ...c, newPlatforms: c.platforms, referenceYears, minGap });
        continue;
      }
    }
    buckets.insert_as_new.push(c);
  }

  console.log(`\nBuckets:`);
  console.log(`  link_same_platform:  ${buckets.link_same_platform.length}`);
  console.log(`  extend_new_platform: ${buckets.extend_new_platform.length}`);
  console.log(`  insert_as_new:       ${buckets.insert_as_new.length}`);

  function sample(arr, n) {
    return arr.slice(0, n).map((c) => ({
      igdb_id: c.igdb_id,
      title: c.title,
      year: c.year,
      target_game_id: c.targetGameId,
      platforms: c.platforms,
    }));
  }
  console.log(`\nSample link_same_platform:`, JSON.stringify(sample(buckets.link_same_platform, 8), null, 2));
  console.log(`\nSample extend_new_platform:`, JSON.stringify(sample(buckets.extend_new_platform, 8), null, 2));
  console.log(`\nSample insert_as_new:`, JSON.stringify(sample(buckets.insert_as_new, 8), null, 2));

  writeFileSync(
    REPORT_FILE,
    JSON.stringify(
      {
        counts: {
          link_same_platform: buckets.link_same_platform.length,
          extend_new_platform: buckets.extend_new_platform.length,
          insert_as_new: buckets.insert_as_new.length,
        },
        link_same_platform: buckets.link_same_platform.map((c) => ({ igdb_id: c.igdb_id, title: c.title, year: c.year, target_game_id: c.targetGameId, matched_platforms: c.matchedPlatforms })),
        extend_new_platform: buckets.extend_new_platform.map((c) => ({ igdb_id: c.igdb_id, title: c.title, year: c.year, target_game_id: c.targetGameId, new_platforms: c.newPlatforms, reference_years: c.referenceYears, min_gap: c.minGap })),
        insert_as_new: buckets.insert_as_new.map((c) => ({ igdb_id: c.igdb_id, title: c.title, year: c.year, target_game_id: c.targetGameId })),
      },
      null,
      2,
    ),
  );
  console.log(`\nFull resolution written to reports/igdb-title-collisions-resolution.json`);

  if (DRY_RUN) {
    console.log("\nDry run, no changes written.");
    return;
  }

  // --- link_same_platform: add an additional igdb link, tagged to the platform ---
  let doneLinks = 0;
  const limitedLink = LIMIT ? buckets.link_same_platform.slice(0, LIMIT) : buckets.link_same_platform;
  const failedLinks = await runPool(limitedLink, async (c) => {
    const { error } = await supabase.from("game_external_ids").insert({
      game_id: c.targetGameId,
      game_ref: gamePkByGameId.get(c.targetGameId),
      provider: "igdb",
      provider_game_key: String(c.igdb_id),
      source_title: c.base.name,
      source_platform_id: c.matchedPlatforms[0],
      confidence_score: 85,
      metadata: { cover_image_id: c.base.image_id, matched_by: "title_collision_same_platform" },
    });
    if (error && error.code !== "23505") throw new Error(error.message);
    doneLinks += 1;
  });
  console.log(`link_same_platform inserted: ${doneLinks}, failed: ${failedLinks}`);

  // --- extend_new_platform: add platform(s) + release row + igdb link ---
  let doneExtend = 0;
  const limitedExtend = LIMIT ? buckets.extend_new_platform.slice(0, LIMIT) : buckets.extend_new_platform;
  const failedExtend = await runPool(limitedExtend, async (c) => {
    const gameRef = gamePkByGameId.get(c.targetGameId);
    for (const platform of c.newPlatforms) {
      const platformRef = platformRefById.get(platform);
      // Plain insert, not upsert: the service role has INSERT but not UPDATE
      // grant on game_platforms (upsert's ON CONFLICT DO UPDATE needs
      // UPDATE too and fails with "permission denied for table
      // game_platforms" - found via the --limit 3 smoke test). A duplicate
      // key here just means the platform was already there; treat as a
      // no-op instead of a failure.
      const { error: platErr } = await supabase
        .from("game_platforms")
        .insert({ game_id: c.targetGameId, platform_id: platform, game_ref: gameRef, platform_ref: platformRef });
      if (platErr && platErr.code !== "23505") throw new Error(`game_platforms: ${platErr.message}`);

      const { error: relErr } = await supabase.from("game_releases").insert({
        game_id: c.targetGameId,
        platform_id: platform,
        game_ref: gameRef,
        platform_ref: platformRef,
        release_year: c.base.year,
        source: "igdb",
        source_key: `igdb:${c.igdb_id}`,
      });
      if (relErr) throw new Error(`game_releases: ${relErr.message}`);
    }
    const { error: linkErr } = await supabase.from("game_external_ids").insert({
      game_id: c.targetGameId,
      game_ref: gameRef,
      provider: "igdb",
      provider_game_key: String(c.igdb_id),
      source_title: c.base.name,
      source_platform_id: c.newPlatforms[0],
      confidence_score: 80,
      metadata: { cover_image_id: c.base.image_id, matched_by: "title_collision_extend_platform" },
    });
    if (linkErr && linkErr.code !== "23505") throw new Error(`game_external_ids: ${linkErr.message}`);
    doneExtend += 1;
  });
  console.log(`extend_new_platform applied: ${doneExtend}, failed: ${failedExtend}`);

  // --- insert_as_new: brand-new game_id, same disambiguation as apply-igdb-new-games.mjs ---
  const usedIds = new Set();
  const newGames = [];
  for (const c of buckets.insert_as_new) {
    const enrich = enrichById.get(c.igdb_id);
    let gameId = c.targetGameId;
    if (allExistingGameIds.has(gameId) || usedIds.has(gameId)) {
      const withYear = c.base.year ? `${gameId}_${c.base.year}` : gameId;
      if (allExistingGameIds.has(withYear) || usedIds.has(withYear)) continue; // still colliding, skip rather than guess further
      gameId = withYear;
    }
    usedIds.add(gameId);
    newGames.push({
      game_id: gameId,
      title: c.base.name,
      aliases: c.base.alt_names ?? [],
      release_year: c.base.year,
      release_state: "released",
      source_type: "catalog",
      source_ref: "",
      cover_url: igdbCoverUrl(c.base.image_id),
      notes: enrich?.summary ? enrich.summary.trim() : "",
      genre_id: enrich ? resolveGenre(enrich.genres) : null,
      platforms: c.platforms,
      _igdb_id: c.igdb_id,
      _enrich: enrich,
    });
  }
  const limitedNew = LIMIT ? newGames.slice(0, LIMIT) : newGames;
  console.log(`insert_as_new candidates: ${newGames.length} (of ${buckets.insert_as_new.length}, some skipped on residual collision)`);

  let doneNew = 0;
  const failedNew = await runPool(limitedNew, async (g) => {
    const { _igdb_id, _enrich, platforms, ...row } = g;
    const { data: inserted, error } = await supabase.from("games").insert(row).select("pk").single();
    if (error) throw new Error(error.message);
    const gameRef = inserted.pk;

    // Platforms are load-bearing (a game with none is a broken orphan, as we
    // learned the hard way this session) - if this fails, roll back the
    // games row instead of leaving a stub.
    try {
      for (const platform of platforms) {
        const { error: platErr } = await supabase.from("game_platforms").insert({
          game_id: g.game_id,
          platform_id: platform,
          game_ref: gameRef,
          platform_ref: platformRefById.get(platform),
        });
        if (platErr) throw new Error(`game_platforms: ${platErr.message}`);
      }
    } catch (e) {
      await supabase.from("games").delete().eq("game_id", g.game_id);
      throw e;
    }

    const { error: linkErr } = await supabase.from("game_external_ids").insert({
      game_id: g.game_id,
      game_ref: gameRef,
      provider: "igdb",
      provider_game_key: String(_igdb_id),
      source_title: g.title,
      confidence_score: 100,
      metadata: { cover_image_id: baseById.get(_igdb_id)?.image_id, matched_by: "title_collision_insert_as_new" },
    });
    if (linkErr) throw new Error(`game_external_ids: ${linkErr.message}`);

    if (_enrich) {
      for (const name of _enrich.developers ?? []) {
        await supabase.from("game_companies").insert({ game_id: g.game_id, game_ref: gameRef, company_name: name, role: "developer", source: "igdb", source_key: `igdb:${_igdb_id}` });
      }
      for (const name of _enrich.publishers ?? []) {
        await supabase.from("game_companies").insert({ game_id: g.game_id, game_ref: gameRef, company_name: name, role: "publisher", source: "igdb", source_key: `igdb:${_igdb_id}` });
      }
      const critic_score = _enrich.critic_rating != null ? Math.round(_enrich.critic_rating) : null;
      const user_score = _enrich.user_rating != null ? Math.round((_enrich.user_rating / 10) * 10) / 10 : null;
      if (critic_score != null || user_score != null) {
        await supabase.from("game_scores").insert({
          game_id: g.game_id,
          game_ref: gameRef,
          score_source: "igdb",
          critic_score,
          critic_count: critic_score != null ? _enrich.critic_rating_count : null,
          user_score,
          user_count: user_score != null ? _enrich.user_rating_count : null,
          source_key: `igdb:${_igdb_id}`,
        });
      }
    }
    doneNew += 1;
  });
  console.log(`insert_as_new inserted: ${doneNew}, failed: ${failedNew}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
