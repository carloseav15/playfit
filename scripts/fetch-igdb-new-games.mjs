// Fetches full details from IGDB for candidate NEW games to add to Playfit's
// catalog: console/handheld games (matching Playfit's existing platform set,
// i.e. excluding pc/mac/linux/android/ios) that have no corresponding Playfit
// game yet, filtered to a minimum review count (quality floor agreed on after
// comparing rating_count distribution - see session notes) to exclude
// unreviewed indie/mobile noise and cosmetic DLC while keeping substantial
// narrative DLC/expansions/remakes that people actually reviewed.
//
// Input: reports/igdb-games.ndjson (already downloaded catalog) +
//        games_library.game_external_ids (already-linked igdb ids, to exclude)
// Output: reports/igdb-new-games.ndjson, one record per candidate igdb_id:
//   { igdb_id, name, slug, year, platforms (igdb ids), image_id, alt_names,
//     genres, summary, developers, publishers, critic_rating,
//     critic_rating_count, user_rating, user_rating_count }
//
// Usage: SUPABASE_SERVICE_KEY=... IGDB_CLIENT_ID=... IGDB_CLIENT_SECRET=...
//   node scripts/fetch-igdb-new-games.mjs [--min-reviews 5]
import { createClient } from "@supabase/supabase-js";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";

const GAMES_FILE = new URL("../reports/igdb-games.ndjson", import.meta.url);
const OUT_FILE = new URL("../reports/igdb-new-games.ndjson", import.meta.url);

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
const DELAY_MS = 260;
const BATCH_SIZE = 500;

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? null : process.argv[idx + 1];
}
const MIN_REVIEWS = argValue("--min-reviews") ? Number(argValue("--min-reviews")) : 5;

// Console/handheld IGDB platform ids matching Playfit's existing platform
// table (games_library.platforms), i.e. every Playfit platform except
// pc/mac/linux/android/ios - the platforms where IGDB's unreviewed indie/
// mobile/web noise concentrates. Includes id 508 (Nintendo Switch 2).
const CONSOLE_IDS = new Set([
  37, 137, 59, 23, 20, 159, 35, 21, 33, 24, 22, 29, 79, 80, 136, 18, 99, 51, 46, 7, 8, 9, 48, 167,
  38, 32, 64, 19, 58, 130, 508, 5, 41, 12, 49, 11, 169,
]);

const LINE_SEPARATOR = new RegExp(" ", "g");
const PARAGRAPH_SEPARATOR = new RegExp(" ", "g");
function toNdjsonLine(record) {
  return JSON.stringify(record).replace(LINE_SEPARATOR, "\\u2028").replace(PARAGRAPH_SEPARATOR, "\\u2029");
}

if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is required.");
if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) throw new Error("IGDB_CLIENT_ID/SECRET are required.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getToken() {
  const res = await fetch("https://id.twitch.tv/oauth2/token", {
    method: "POST",
    body: new URLSearchParams({
      client_id: IGDB_CLIENT_ID,
      client_secret: IGDB_CLIENT_SECRET,
      grant_type: "client_credentials",
    }),
  });
  const json = await res.json();
  return json.access_token;
}

async function fetchAllLinkedIgdbIds() {
  const ids = new Set();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("game_external_ids")
      .select("provider_game_key")
      .eq("provider", "igdb")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    for (const r of data) ids.add(Number(r.provider_game_key));
    if (data.length < PAGE) break;
  }
  return ids;
}

async function main() {
  const linkedIds = await fetchAllLinkedIgdbIds();
  console.log(`Already-linked IGDB ids: ${linkedIds.size}`);

  const catalog = readFileSync(GAMES_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));

  const candidateIds = catalog
    .filter((g) => !linkedIds.has(g.id) && g.platforms.some((p) => CONSOLE_IDS.has(p)))
    .map((g) => g.id);
  console.log(`Unmatched console games (with cover): ${candidateIds.length}`);

  const token = await getToken();
  writeFileSync(OUT_FILE, "");
  let kept = 0;
  let checked = 0;

  for (let i = 0; i < candidateIds.length; i += BATCH_SIZE) {
    const batch = candidateIds.slice(i, i + BATCH_SIZE);
    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": IGDB_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
      body: `fields id,genres.name,summary,rating,rating_count,aggregated_rating,
             aggregated_rating_count,involved_companies.company.name,
             involved_companies.developer,involved_companies.publisher;
             where id = (${batch.join(",")});
             limit ${BATCH_SIZE};`,
    });
    if (!res.ok) throw new Error(`IGDB games ${res.status}: ${await res.text()}`);
    const rows = await res.json();

    const lines = [];
    for (const g of rows) {
      checked += 1;
      const reviewCount = Math.max(g.rating_count ?? 0, g.aggregated_rating_count ?? 0);
      if (reviewCount < MIN_REVIEWS) continue;

      const involved = g.involved_companies ?? [];
      kept += 1;
      lines.push(
        toNdjsonLine({
          igdb_id: g.id,
          genres: (g.genres ?? []).map((x) => x.name),
          summary: g.summary ?? null,
          developers: involved.filter((c) => c.developer).map((c) => c.company?.name).filter(Boolean),
          publishers: involved.filter((c) => c.publisher).map((c) => c.company?.name).filter(Boolean),
          critic_rating: g.aggregated_rating ?? null,
          critic_rating_count: g.aggregated_rating_count ?? null,
          user_rating: g.rating ?? null,
          user_rating_count: g.rating_count ?? null,
        }),
      );
    }
    if (lines.length > 0) appendFileSync(OUT_FILE, `${lines.join("\n")}\n`);

    if (checked % 5000 < BATCH_SIZE) console.log(`  checked ${checked}/${candidateIds.length}, kept ${kept}`);
    await sleep(DELAY_MS);
  }
  console.log(`Done. Checked ${checked}, kept ${kept} at >= ${MIN_REVIEWS} reviews.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
