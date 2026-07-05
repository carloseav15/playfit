// Fetches age ratings from IGDB for games already linked via
// games_library.game_external_ids (provider='igdb'). Local game_age_ratings
// currently only has ESRB data (from rawg/metacritic/vgsales, all US-centric
// sources); IGDB adds PEGI/CERO/USK/GRAC/CLASS_IND/ACB for the first time.
//
// IGDB's age_rating_organizations (7 rows) and age_rating_categories (40
// rows) are small and stable, verified live and hardcoded below rather than
// fetched per run.
//
// Output: reports/igdb-age-ratings.ndjson, one record per igdb_id:
//   { igdb_id, ratings: [{ board, rating }] }
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, appendFileSync } from "node:fs";

const OUT_FILE = new URL("../reports/igdb-age-ratings.ndjson", import.meta.url);

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

// Verified live against IGDB /age_rating_organizations and
// /age_rating_categories (2026-07-04) - both endpoints are small/stable.
const ORG_NAMES = { 1: "ESRB", 2: "PEGI", 3: "CERO", 4: "USK", 5: "GRAC", 6: "CLASS_IND", 7: "ACB" };
const RATING_LABELS = {
  1: "RP", 2: "EC", 3: "E", 4: "E10+", 5: "T", 6: "M", 7: "AO", // ESRB
  8: "3", 9: "7", 10: "12", 11: "16", 12: "18", // PEGI
  13: "A", 14: "B", 15: "C", 16: "D", 17: "Z", // CERO
  18: "0", 19: "6", 20: "12", 21: "16", 22: "18", // USK
  23: "ALL", 24: "12+", 25: "15+", 26: "19+", 27: "TESTING", 40: "18+", // GRAC
  28: "L", 29: "10", 30: "12", 31: "14", 32: "16", 33: "18", // CLASS_IND
  34: "G", 35: "PG", 36: "M", 37: "MA 15+", 38: "R 18+", 39: "RC", // ACB
};
const CATEGORY_ORG = {
  1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1,
  8: 2, 9: 2, 10: 2, 11: 2, 12: 2,
  13: 3, 14: 3, 15: 3, 16: 3, 17: 3,
  18: 4, 19: 4, 20: 4, 21: 4, 22: 4,
  23: 5, 24: 5, 25: 5, 26: 5, 27: 5, 40: 5,
  28: 6, 29: 6, 30: 6, 31: 6, 32: 6, 33: 6,
  34: 7, 35: 7, 36: 7, 37: 7, 38: 7, 39: 7,
};

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
      body: `fields id,age_ratings.organization,age_ratings.rating_category;
             where id = (${batch.join(",")});
             limit ${BATCH_SIZE};`,
    });
    if (!res.ok) throw new Error(`IGDB games ${res.status}: ${await res.text()}`);
    const rows = await res.json();

    const lines = rows
      .filter((g) => (g.age_ratings ?? []).length > 0)
      .map((g) => {
        const ratings = g.age_ratings
          .map((ar) => {
            const orgId = ar.organization ?? CATEGORY_ORG[ar.rating_category];
            const board = ORG_NAMES[orgId];
            const rating = RATING_LABELS[ar.rating_category];
            if (!board || !rating) return null;
            return { board, rating };
          })
          .filter(Boolean);
        return { igdb_id: g.id, ratings };
      })
      .filter((r) => r.ratings.length > 0)
      .map((r) => JSON.stringify(r));
    appendFileSync(OUT_FILE, `${lines.join("\n")}\n`);

    total += rows.length;
    if (total % 5000 < BATCH_SIZE) console.log(`age_ratings: ${total}/${igdbIds.length} fetched`);
    await sleep(DELAY_MS);
  }
  console.log(`Done. ${total} games processed.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
