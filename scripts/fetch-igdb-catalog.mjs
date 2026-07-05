// Downloads the full IGDB catalog (games that have a cover) plus the
// Steam external-id mapping, for the IGDB cover backfill pipeline:
//   fetch-igdb-catalog.mjs -> match-igdb-covers.mjs -> apply-igdb-covers.mjs
//
// Output (NDJSON, one record per line, resumable by last id):
//   reports/igdb-games.ndjson  { id, name, slug, year, platforms, image_id, alt_names }
//   reports/igdb-steam.ndjson  { igdb_game_id, steam_appid }
//
// Requires IGDB_CLIENT_ID / IGDB_CLIENT_SECRET (Twitch developer app, same
// credentials as backfill-tags-from-igdb-themes.mjs). Stays under the
// 4 req/sec IGDB rate limit; a full run is ~600-900 requests (~5 min).
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const GAMES_FILE = new URL("../reports/igdb-games.ndjson", import.meta.url);
const STEAM_FILE = new URL("../reports/igdb-steam.ndjson", import.meta.url);

const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
const DELAY_MS = 260; // stay under 4 req/sec
const PAGE_SIZE = 500;

if (!IGDB_CLIENT_ID || !IGDB_CLIENT_SECRET) {
  console.error("IGDB_CLIENT_ID and IGDB_CLIENT_SECRET are required.");
  process.exit(1);
}

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
  if (!res.ok) throw new Error(`Twitch token ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return json.access_token;
}

async function igdbQuery(token, endpoint, body, attempt = 1) {
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: {
      "Client-ID": IGDB_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
    body,
  });
  if (res.status === 429 || res.status >= 500) {
    if (attempt > 5) throw new Error(`IGDB ${endpoint} ${res.status} after 5 retries`);
    await sleep(1000 * attempt);
    return igdbQuery(token, endpoint, body, attempt + 1);
  }
  if (!res.ok) throw new Error(`IGDB ${endpoint} ${res.status}: ${await res.text()}`);
  return res.json();
}

function lastIdInFile(fileUrl) {
  if (!existsSync(fileUrl)) return 0;
  const lines = readFileSync(fileUrl, "utf8").trimEnd().split("\n").filter(Boolean);
  if (lines.length === 0) return 0;
  return JSON.parse(lines[lines.length - 1])._page_id;
}

async function fetchAllGames(token) {
  let lastId = lastIdInFile(GAMES_FILE);
  if (lastId > 0) console.log(`igdb-games: resuming after id ${lastId}`);
  let total = 0;

  for (;;) {
    const rows = await igdbQuery(
      token,
      "games",
      `fields id,name,slug,first_release_date,platforms,cover.image_id,alternative_names.name;
       where cover != null & id > ${lastId};
       sort id asc; limit ${PAGE_SIZE};`,
    );
    if (rows.length === 0) break;

    const lines = rows.map((g) => {
      const record = {
        _page_id: g.id,
        id: g.id,
        name: g.name,
        slug: g.slug,
        year: g.first_release_date
          ? new Date(g.first_release_date * 1000).getUTCFullYear()
          : null,
        platforms: g.platforms ?? [],
        image_id: g.cover?.image_id ?? null,
        alt_names: (g.alternative_names ?? []).map((a) => a.name).filter(Boolean),
      };
      return JSON.stringify(record);
    });
    appendFileSync(GAMES_FILE, `${lines.join("\n")}\n`);

    lastId = rows[rows.length - 1].id;
    total += rows.length;
    if (total % 10000 < PAGE_SIZE) console.log(`igdb-games: ${total} fetched (id ${lastId})`);
    await sleep(DELAY_MS);
  }
  console.log(`igdb-games: done, ${total} fetched this run`);
}

async function fetchSteamIds(token) {
  let lastId = lastIdInFile(STEAM_FILE);
  if (lastId > 0) console.log(`igdb-steam: resuming after id ${lastId}`);
  let total = 0;

  for (;;) {
    // external_games.category is deprecated/unreliable in the current IGDB
    // schema (most rows omit it entirely); match on the Steam store URL
    // instead. uid is already the Steam appid as a string.
    const rows = await igdbQuery(
      token,
      "external_games",
      `fields id,game,uid;
       where url ~ *"store.steampowered.com"* & game != null & id > ${lastId};
       sort id asc; limit ${PAGE_SIZE};`,
    );
    if (rows.length === 0) break;

    const lines = rows.map((r) =>
      JSON.stringify({ _page_id: r.id, igdb_game_id: r.game, steam_appid: r.uid }),
    );
    appendFileSync(STEAM_FILE, `${lines.join("\n")}\n`);

    lastId = rows[rows.length - 1].id;
    total += rows.length;
    if (total % 25000 < PAGE_SIZE) console.log(`igdb-steam: ${total} fetched (id ${lastId})`);
    await sleep(DELAY_MS);
  }
  console.log(`igdb-steam: done, ${total} fetched this run`);
}

async function main() {
  const token = await getToken();
  await fetchAllGames(token);
  await fetchSteamIds(token);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
