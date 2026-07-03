// Second pass: given reports/thegamesdb-backfill-candidates.json (produced by
// backfill-thegamesdb.mjs), fetch boxart for every EXACT title match only
// (fuzzy matches are excluded — spot review showed several were wrong, e.g.
// "Lemnis Gate" matching "Lemmings 3D"), batching TheGamesDB game ids into
// Games/Images calls, and writes the final apply-ready dataset.
import { readFileSync, writeFileSync } from "node:fs";

const TGDB_API_KEY = process.env.THEGAMESDB_API_KEY;
if (!TGDB_API_KEY) throw new Error("THEGAMESDB_API_KEY is required.");

const IN_FILE = new URL("../reports/thegamesdb-backfill-candidates.json", import.meta.url);
const OUT_FILE = new URL("../reports/thegamesdb-backfill-apply.json", import.meta.url);
const BATCH_SIZE = 40;
const API_DELAY_MS = 350;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tgdbGet(path, params) {
  const url = new URL(`https://api.thegamesdb.net${path}`);
  url.searchParams.set("apikey", TGDB_API_KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const json = await res.json();
  if (json.code !== 200) throw new Error(`TheGamesDB error ${json.code}: ${JSON.stringify(json)}`);
  return json;
}

async function main() {
  const candidates = JSON.parse(readFileSync(IN_FILE, "utf8"));
  const exactMatches = candidates.filter((c) => c.match?.exact_match);
  console.log(`Exact matches: ${exactMatches.length}`);

  const needingCover = exactMatches.filter((c) => c.needs_cover);
  console.log(`Exact matches needing cover: ${needingCover.length}`);

  const idToRecord = new Map(needingCover.map((c) => [String(c.match.tgdb_id), c]));
  const ids = [...idToRecord.keys()];

  const coverByGameId = new Map();
  let baseUrl = null;

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const res = await tgdbGet("/v1/Games/Images", {
      games_id: batch.join(","),
      "filter[type]": "boxart",
    });
    baseUrl ??= res.data.base_url;
    for (const [tgdbId, images] of Object.entries(res.data.images ?? {})) {
      const front = images.find((im) => im.side === "front") ?? images[0];
      if (front) coverByGameId.set(tgdbId, front.filename);
    }
    console.log(`  images batch ${i / BATCH_SIZE + 1}/${Math.ceil(ids.length / BATCH_SIZE)}`);
    await sleep(API_DELAY_MS);
  }

  const applyList = exactMatches.map((c) => {
    const tgdbId = String(c.match.tgdb_id);
    const filename = coverByGameId.get(tgdbId);
    return {
      game_id: c.game_id,
      title: c.title,
      tgdb_title: c.match.tgdb_title,
      apply_genre: c.needs_genre ? c.match.mapped_genre : null,
      apply_cover_url: c.needs_cover && filename ? `${baseUrl.large}${filename}` : null,
    };
  });

  writeFileSync(OUT_FILE, JSON.stringify({ base_url: baseUrl, games: applyList }, null, 2));

  const withGenre = applyList.filter((a) => a.apply_genre).length;
  const withCover = applyList.filter((a) => a.apply_cover_url).length;
  console.log(`Wrote ${applyList.length} rows to ${OUT_FILE.pathname}`);
  console.log(`  will backfill genre for ${withGenre}, cover for ${withCover}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
