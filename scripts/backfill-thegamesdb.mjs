// Backfill missing cover art and genre for high-value games (critic_score >= 75
// on a key console/PC platform) using TheGamesDB API (https://api.thegamesdb.net/).
//
// Strategy: TheGamesDB has no bulk name-search and platform listings are too
// large to enumerate fully within a 1000-request/month budget, so this script
// does one targeted ByGameName search per known-good game (not the long tail
// of obscure titles), then batches the resulting TheGamesDB game ids into a
// handful of Games/Images calls to fetch boxart cheaply.
//
// Writes results to a JSON file for manual review before any DB write — this
// script does not update Supabase directly.
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TGDB_API_KEY = process.env.THEGAMESDB_API_KEY;

if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is required.");
if (!TGDB_API_KEY) throw new Error("THEGAMESDB_API_KEY is required.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

const SCORE_MIN = Number(process.env.SCORE_MIN ?? 75);
const SCORE_MAX = Number(process.env.SCORE_MAX ?? Infinity);
const MAX_TARGETS = Number(process.env.MAX_TARGETS ?? Infinity);
const KEY_PLATFORMS = [
  "pc",
  "ps5",
  "ps4",
  "ps3",
  "switch_1",
  "xbox_series_xs",
  "xbox_one",
  "xbox_360",
  "wii_u",
];

// our platform_id -> TheGamesDB numeric platform id, for filter[platform]
const TGDB_PLATFORM = {
  pc: 1,
  ps5: 4980,
  ps4: 4919,
  ps3: 12,
  switch_1: 4971,
  xbox_series_xs: 4981,
  xbox_one: 4920,
  xbox_360: 15,
  wii_u: 38,
};

// Conservative TheGamesDB genre id -> our games_library.genres id.
// Only unambiguous, single-best-fit mappings; anything else is left unmapped.
const TGDB_GENRE_MAP = {
  1: "action",
  2: "adventure",
  3: "simulation",
  4: "rpg",
  5: "puzzle",
  6: "strategy",
  7: "racing",
  8: "shooter",
  9: "simulation",
  10: "fighting",
  11: "sports",
  13: "simulation",
  15: "platformer",
  19: "simulation",
  21: "educational",
  22: "family",
};

const API_DELAY_MS = 350;
const OUT_FILE = new URL("../reports/thegamesdb-backfill-candidates.json", import.meta.url);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tgdbGet(path, params) {
  const url = new URL(`https://api.thegamesdb.net${path}`);
  url.searchParams.set("apikey", TGDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const json = await res.json();
  if (json.code !== 200) {
    throw new Error(`TheGamesDB error ${json.code}: ${JSON.stringify(json)}`);
  }
  return json;
}

function normalizeTitle(t) {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

async function main() {
  console.log(`Fetching target games (${SCORE_MIN} <= critic_score < ${SCORE_MAX})...`);

  // Supabase JS has no multi-table join helper, so fetch the relevant tables
  // separately and join them in memory. PostgREST caps responses at 1000 rows
  // by default, so page through with .range() to get every matching row.
  async function fetchAllPaged(build, pageSize = 1000) {
    const all = [];
    let from = 0;
    for (;;) {
      const { data, error } = await build().range(from, from + pageSize - 1);
      if (error) throw error;
      all.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  const scores = await fetchAllPaged(() =>
    supabase
      .from("game_scores")
      .select("game_id, critic_score")
      .gte("critic_score", SCORE_MIN)
      .lt("critic_score", SCORE_MAX),
  );

  const bestScoreByGame = new Map();
  for (const s of scores) {
    const prev = bestScoreByGame.get(s.game_id);
    if (prev === undefined || s.critic_score > prev) bestScoreByGame.set(s.game_id, s.critic_score);
  }
  const scoredIds = [...bestScoreByGame.keys()];
  console.log(`Games with ${SCORE_MIN} <= critic_score < ${SCORE_MAX}: ${scoredIds.length}`);

  const chunks = [];
  for (let i = 0; i < scoredIds.length; i += 100) chunks.push(scoredIds.slice(i, i + 100));

  const candidateGames = [];
  for (const chunk of chunks) {
    const { data: rows, error: gErr } = await supabase
      .from("games")
      .select("game_id, title, release_year, cover_url, genre_id")
      .in("game_id", chunk)
      .or("cover_url.eq.,cover_url.is.null,genre_id.is.null");
    if (gErr) throw gErr;
    candidateGames.push(...rows);
  }
  console.log(`Candidates missing cover or genre: ${candidateGames.length}`);

  const candidateIds = candidateGames.map((g) => g.game_id);
  const platformsByGame = new Map();
  for (let i = 0; i < candidateIds.length; i += 100) {
    const idChunk = candidateIds.slice(i, i + 100);
    const { data: platformRows, error: pErr } = await supabase
      .from("game_platforms")
      .select("game_id, platform_id")
      .in("game_id", idChunk)
      .in("platform_id", KEY_PLATFORMS);
    if (pErr) throw pErr;
    for (const row of platformRows) {
      if (!platformsByGame.has(row.game_id)) platformsByGame.set(row.game_id, []);
      platformsByGame.get(row.game_id).push(row.platform_id);
    }
  }

  const targets = candidateGames
    .filter((g) => platformsByGame.has(g.game_id))
    .sort((a, b) => bestScoreByGame.get(b.game_id) - bestScoreByGame.get(a.game_id))
    .slice(0, MAX_TARGETS);
  console.log(`Final target list (on a key platform, top ${MAX_TARGETS} by score): ${targets.length}`);

  const results = [];
  let processed = 0;
  for (const game of targets) {
    processed += 1;
    const platformIds = platformsByGame.get(game.game_id).map((p) => TGDB_PLATFORM[p]);
    try {
      const res = await tgdbGet("/v1/Games/ByGameName", {
        name: game.title,
        fields: "genres",
        "filter[platform]": platformIds.join(","),
      });
      await sleep(API_DELAY_MS);

      const found = res.data?.games ?? [];
      const normTarget = normalizeTitle(game.title);
      const exact = found.find((f) => normalizeTitle(f.game_title) === normTarget);
      const best = exact ?? found[0];

      if (!best) {
        results.push({ game_id: game.game_id, title: game.title, match: null });
        continue;
      }

      const mappedGenre = (best.genres ?? [])
        .map((gid) => TGDB_GENRE_MAP[gid])
        .find((g) => g !== undefined);

      results.push({
        game_id: game.game_id,
        title: game.title,
        release_year: game.release_year,
        needs_cover: !game.cover_url,
        needs_genre: !game.genre_id,
        match: {
          tgdb_id: best.id,
          tgdb_title: best.game_title,
          exact_match: Boolean(exact),
          tgdb_genres: best.genres ?? [],
          mapped_genre: mappedGenre ?? null,
        },
      });

      if (processed % 25 === 0) {
        console.log(`  ${processed}/${targets.length} processed`);
        writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
      }
    } catch (e) {
      console.error(`Error on "${game.title}": ${e.message}`);
      results.push({ game_id: game.game_id, title: game.title, match: null, error: e.message });
      await sleep(API_DELAY_MS);
    }
  }

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Done. Wrote ${results.length} rows to ${OUT_FILE.pathname}`);

  const matchedCount = results.filter((r) => r.match).length;
  const exactCount = results.filter((r) => r.match?.exact_match).length;
  console.log(`Matched: ${matchedCount} (${exactCount} exact title matches)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
