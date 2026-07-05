// Matches Playfit games to IGDB games (from reports/igdb-games.ndjson +
// reports/igdb-steam.ndjson, produced by fetch-igdb-catalog.mjs) and emits
// the cover assignments to reports/igdb-covers-apply.json.
//
// Tiered matching, most to least reliable:
//   steam (100): our game_external_ids steam appid <-> IGDB external_games uid
//   title_platform (92): exact normalized title/alias + platform overlap,
//     single candidate after year filter
//   title (80): exact normalized title/alias, single candidate, no platform
//     signal required
// Same conservative conventions as every other external source: exact
// normalized title only, ambiguous (multiple surviving candidates) and
// year-gap>3 are excluded.
import { createClient } from "@supabase/supabase-js";
import { createInterface } from "node:readline";
import { createReadStream, writeFileSync } from "node:fs";

const GAMES_FILE = new URL("../reports/igdb-games.ndjson", import.meta.url);
const STEAM_FILE = new URL("../reports/igdb-steam.ndjson", import.meta.url);
const OUT_FILE = new URL("../reports/igdb-covers-apply.json", import.meta.url);

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY is required to run match-igdb-covers.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

// IGDB numeric platform id -> Playfit platform id. Unmapped IGDB platforms
// (Amiga, C64, Stadia, ...) simply contribute no overlap signal; the matcher
// reports their frequency so the map can be extended if it matters.
const IGDB_PLATFORMS = {
  3: "linux",
  4: "n64",
  5: "wii",
  6: "pc", // PC (Microsoft Windows)
  7: "ps1",
  8: "ps2",
  9: "ps3",
  11: "xbox_original",
  12: "xbox_360",
  13: "pc", // DOS
  14: "macos",
  18: "nes",
  19: "snes",
  20: "ds",
  21: "gamecube",
  22: "gbc",
  23: "dreamcast",
  24: "gba",
  29: "genesis",
  32: "saturn",
  33: "gb",
  34: "android",
  35: "game_gear",
  37: "3ds",
  38: "psp",
  39: "ios",
  41: "wii_u",
  46: "ps_vita",
  48: "ps4",
  49: "xbox_one",
  59: "atari_2600",
  64: "sega_master_system",
  79: "neo_geo", // Neo Geo MVS
  80: "neo_geo", // Neo Geo AES
  130: "switch_1",
  136: "neo_geo", // Neo Geo CD
  137: "3ds", // New Nintendo 3DS
  167: "ps5",
  169: "xbox_series_xs",
};

const YEAR_MAX_GAP = 3;

function normalizeTitle(t) {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function readNdjson(fileUrl, onRecord) {
  const rl = createInterface({ input: createReadStream(fileUrl), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line) onRecord(JSON.parse(line));
  }
}

async function fetchAllRows(table, columns, filter) {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1).order("game_id");
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

function yearCompatible(gameYear, igdbYear) {
  if (!gameYear || !igdbYear) return true;
  return Math.abs(gameYear - igdbYear) <= YEAR_MAX_GAP;
}

function platformOverlap(gamePlatforms, igdbEntry) {
  if (!gamePlatforms || gamePlatforms.length === 0) return false;
  const mapped = igdbEntry.platforms.map((p) => IGDB_PLATFORMS[p]).filter(Boolean);
  return mapped.some((p) => gamePlatforms.includes(p));
}

async function main() {
  // --- IGDB catalog ---
  const igdbById = new Map();
  const igdbByNorm = new Map();
  await readNdjson(GAMES_FILE, (g) => {
    if (!g.image_id) return;
    igdbById.set(g.id, g);
    const keys = new Set([normalizeTitle(g.name), ...g.alt_names.map(normalizeTitle)]);
    for (const key of keys) {
      if (!key) continue;
      if (!igdbByNorm.has(key)) igdbByNorm.set(key, []);
      igdbByNorm.get(key).push(g);
    }
  });
  console.log(`IGDB games with cover: ${igdbById.size}`);

  const steamToIgdb = new Map();
  await readNdjson(STEAM_FILE, (r) => {
    if (r.steam_appid) steamToIgdb.set(String(r.steam_appid), r.igdb_game_id);
  });
  console.log(`IGDB steam mappings: ${steamToIgdb.size}`);

  // --- Playfit catalog ---
  const games = await fetchAllRows("games", "game_id,title,aliases,release_year,platforms,cover_url");
  console.log(`Playfit games: ${games.length}`);

  const steamRows = await fetchAllRows(
    "game_external_ids",
    "game_id,provider_game_key",
    (q) => q.eq("provider", "steam"),
  );
  const gameToSteam = new Map(steamRows.map((r) => [r.game_id, r.provider_game_key]));
  console.log(`Playfit games with steam id: ${gameToSteam.size}`);

  // --- Matching ---
  const results = [];
  const stats = { steam: 0, title_platform: 0, title: 0, ambiguous: 0, no_match: 0 };
  const unmappedIgdbPlatforms = new Map();

  for (const game of games) {
    // Tier A: steam appid
    const steamKey = gameToSteam.get(game.game_id);
    if (steamKey && steamToIgdb.has(steamKey)) {
      const igdb = igdbById.get(steamToIgdb.get(steamKey));
      if (igdb) {
        stats.steam += 1;
        results.push(toResult(game, igdb, "steam", 100));
        continue;
      }
    }

    // Tier B/C: exact normalized title or alias
    const keys = new Set([
      normalizeTitle(game.title),
      ...(game.aliases ?? []).map(normalizeTitle),
    ]);
    const seen = new Set();
    const candidates = [];
    for (const key of keys) {
      for (const igdb of igdbByNorm.get(key) ?? []) {
        if (seen.has(igdb.id)) continue;
        seen.add(igdb.id);
        if (yearCompatible(game.release_year, igdb.year)) candidates.push(igdb);
      }
    }

    if (candidates.length === 0) {
      stats.no_match += 1;
      continue;
    }

    for (const c of candidates) {
      for (const p of c.platforms) {
        if (!IGDB_PLATFORMS[p]) {
          unmappedIgdbPlatforms.set(p, (unmappedIgdbPlatforms.get(p) ?? 0) + 1);
        }
      }
    }

    const withPlatform = candidates.filter((c) => platformOverlap(game.platforms, c));
    if (withPlatform.length === 1) {
      stats.title_platform += 1;
      results.push(toResult(game, withPlatform[0], "title_platform", 92));
    } else if (withPlatform.length === 0 && candidates.length === 1) {
      stats.title += 1;
      results.push(toResult(game, candidates[0], "title", 80));
    } else if (withPlatform.length > 1) {
      // Multiple candidates on the right platform: exact year as tiebreaker.
      const exactYear = withPlatform.filter(
        (c) => game.release_year && c.year === game.release_year,
      );
      if (exactYear.length === 1) {
        stats.title_platform += 1;
        results.push(toResult(game, exactYear[0], "title_platform", 92));
      } else {
        stats.ambiguous += 1;
      }
    } else {
      stats.ambiguous += 1;
    }
  }

  function toResult(game, igdb, tier, confidence) {
    return {
      game_id: game.game_id,
      title: game.title,
      current_cover_url: game.cover_url,
      platforms: game.platforms ?? [],
      igdb_id: igdb.id,
      igdb_name: igdb.name,
      igdb_slug: igdb.slug,
      image_id: igdb.image_id,
      tier,
      confidence,
    };
  }

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));

  console.log(`\nMatched: ${results.length}/${games.length}`);
  console.log(`  steam:          ${stats.steam}`);
  console.log(`  title_platform: ${stats.title_platform}`);
  console.log(`  title:          ${stats.title}`);
  console.log(`Ambiguous (skipped): ${stats.ambiguous}`);
  console.log(`No match: ${stats.no_match}`);
  console.log(
    `Gaining a cover (currently empty): ${results.filter((r) => !r.current_cover_url).length}`,
  );

  if (unmappedIgdbPlatforms.size > 0) {
    const top = [...unmappedIgdbPlatforms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    console.log(`\nUnmapped IGDB platform ids seen in candidates (id: count):`);
    for (const [id, count] of top) console.log(`  ${id}: ${count}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
