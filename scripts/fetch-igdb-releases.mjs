// Fetches per-platform release dates from IGDB for games already linked via
// games_library.game_external_ids (provider='igdb'). No re-matching needed:
// the igdb id is already known per game_id.
//
// Output: reports/igdb-releases.ndjson, one record per igdb_id:
//   { igdb_id, releases: [{ platform_igdb_id, year, date }] }
//
// Requires IGDB_CLIENT_ID / IGDB_CLIENT_SECRET. Batches 500 ids per request,
// ~79 requests for the ~39.4k currently linked games (~25-35s).
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, appendFileSync } from "node:fs";

const OUT_FILE = new URL("../reports/igdb-releases.ndjson", import.meta.url);

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
const DELAY_MS = 260;
const BATCH_SIZE = 500;

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
      body: `fields id,release_dates.platform,release_dates.y,release_dates.date;
             where id = (${batch.join(",")});
             limit ${BATCH_SIZE};`,
    });
    if (!res.ok) throw new Error(`IGDB games ${res.status}: ${await res.text()}`);
    const rows = await res.json();

    const lines = rows
      .filter((g) => (g.release_dates ?? []).length > 0)
      .map((g) =>
        JSON.stringify({
          igdb_id: g.id,
          releases: g.release_dates
            .filter((r) => r.platform != null && r.y != null)
            .map((r) => ({
              platform_igdb_id: r.platform,
              year: r.y,
              date: r.date != null ? new Date(r.date * 1000).toISOString().slice(0, 10) : null,
            })),
        }),
      );
    appendFileSync(OUT_FILE, `${lines.join("\n")}\n`);

    total += rows.length;
    if (total % 5000 < BATCH_SIZE) console.log(`releases: ${total}/${igdbIds.length} fetched`);
    await sleep(DELAY_MS);
  }
  console.log(`Done. ${total} games processed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
