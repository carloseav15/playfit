// Fetches genres, franchise/collection names and summary text from IGDB for
// games already linked via games_library.game_external_ids (provider='igdb'),
// produced by apply-igdb-covers.mjs. No re-matching needed: the igdb id is
// already known per game_id.
//
// Output: reports/igdb-enrichment.ndjson, one record per igdb_id:
//   { igdb_id, genres: [name,...], collections: [name,...], summary }
//
// Requires IGDB_CLIENT_ID / IGDB_CLIENT_SECRET. Batches 500 ids per request,
// ~76 requests for the current ~37.7k linked games (~20-30s).
import { createClient } from "@supabase/supabase-js";
import { appendFileSync, writeFileSync } from "node:fs";

const OUT_FILE = new URL("../reports/igdb-enrichment.ndjson", import.meta.url);

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
const DELAY_MS = 260;
const BATCH_SIZE = 500;

// JSON.stringify leaves U+2028/U+2029 (common in scraped summary text)
// unescaped; some line-based readers (including Node's readline) treat them
// as line breaks, splitting one JSON record across two physical lines.
// Escaping them (via string-escape regexes, not raw literals - raw U+2028/29
// are themselves JS source line terminators) keeps every record on one line.
const LINE_SEPARATOR = new RegExp("\u2028", "g");
const PARAGRAPH_SEPARATOR = new RegExp("\u2029", "g");

if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is required.");
if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
  throw new Error("IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are required.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNdjsonLine(record) {
  return JSON.stringify(record).replace(LINE_SEPARATOR, "\\u2028").replace(PARAGRAPH_SEPARATOR, "\\u2029");
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
  const ids = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("game_external_ids")
      .select("provider_game_key")
      .eq("provider", "igdb")
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    ids.push(...data.map((r) => Number(r.provider_game_key)));
    if (data.length < PAGE) break;
  }
  return ids;
}

async function main() {
  const igdbIds = await fetchAllLinkedIgdbIds();
  console.log(`IGDB ids already linked: ${igdbIds.length}`);

  const token = await getToken();
  writeFileSync(OUT_FILE, "");
  let total = 0;

  for (let i = 0; i < igdbIds.length; i += BATCH_SIZE) {
    const batch = igdbIds.slice(i, i + BATCH_SIZE);
    const res = await fetch("https://api.igdb.com/v4/games", {
      method: "POST",
      headers: {
        "Client-ID": IGDB_CLIENT_ID,
        Authorization: `Bearer ${token}`,
      },
      body: `fields id,genres.name,collections.name,summary;
             where id = (${batch.join(",")});
             limit ${BATCH_SIZE};`,
    });
    if (!res.ok) throw new Error(`IGDB games ${res.status}: ${await res.text()}`);
    const rows = await res.json();

    const lines = rows.map((g) =>
      toNdjsonLine({
        igdb_id: g.id,
        genres: (g.genres ?? []).map((x) => x.name),
        collections: (g.collections ?? []).map((x) => x.name),
        summary: g.summary ?? null,
      }),
    );
    appendFileSync(OUT_FILE, `${lines.join("\n")}\n`);

    total += rows.length;
    if (total % 5000 < BATCH_SIZE) console.log(`enrichment: ${total}/${igdbIds.length} fetched`);
    await sleep(DELAY_MS);
  }
  console.log(`Done. ${total} enrichment records fetched.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
