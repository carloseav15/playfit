// Rescues games with zero tags (invisible to the recommendation engine's
// isScoredGame gate) by matching them to IGDB and mapping IGDB's fixed list
// of 22 themes to our existing 162-tag vocabulary. Only exact 1:1 theme->tag
// matches are used (10 of 22 themes have a clean equivalent); anything looser
// (e.g. "Kids", "Warfare", "Mystery") is intentionally left unmapped rather
// than guessed. Same conservative title+year matching used for every other
// external source this session: exact normalized title, ambiguous (multiple
// candidates) or year-gap>3 are excluded.
import { readFileSync, writeFileSync } from "node:fs";

const TAGLESS_FILE =
  "/private/tmp/claude-501/-Users-carancibia-Projects-playfit/1d7a580e-06e2-486a-bb08-4bee589bdee0/scratchpad/tagless_games.tsv";
const OUT_FILE = new URL("../reports/igdb-theme-tags.json", import.meta.url);

const THEME_TO_TAG = {
  Fantasy: "fantasy",
  "Science fiction": "sci_fi",
  Horror: "horror",
  Survival: "survival",
  Historical: "historical",
  Stealth: "stealth",
  Comedy: "comedy",
  Sandbox: "sandbox",
  "Open world": "open_world",
  Party: "party",
};

const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;
const DELAY_MS = 260; // stay under 4 req/sec

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTitle(t) {
  return t
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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

async function searchGame(token, title) {
  const res = await fetch("https://api.igdb.com/v4/games", {
    method: "POST",
    headers: {
      "Client-ID": IGDB_CLIENT_ID,
      Authorization: `Bearer ${token}`,
    },
    body: `search "${title.replace(/"/g, '\\"')}"; fields name,first_release_date,themes.name; limit 10;`,
  });
  if (!res.ok) throw new Error(`IGDB ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const rows = readFileSync(TAGLESS_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [game_id, title, release_year] = line.split("\t");
      return { game_id, title, release_year: release_year ? Number(release_year) : null };
    });

  console.log(`Targets: ${rows.length}`);
  const token = await getToken();

  const results = [];
  let processed = 0;
  let matched = 0;
  let ambiguous = 0;
  let yearExcluded = 0;
  let noResult = 0;
  let noThemeOverlap = 0;

  for (const row of rows) {
    processed += 1;
    try {
      const candidates = await searchGame(token, row.title);
      const normTarget = normalizeTitle(row.title);
      const exactMatches = candidates.filter((c) => normalizeTitle(c.name) === normTarget);

      if (exactMatches.length === 0) {
        noResult += 1;
      } else if (exactMatches.length > 1) {
        ambiguous += 1;
      } else {
        const cand = exactMatches[0];
        const candYear = cand.first_release_date
          ? new Date(cand.first_release_date * 1000).getUTCFullYear()
          : null;

        if (row.release_year && candYear && Math.abs(row.release_year - candYear) > 3) {
          yearExcluded += 1;
        } else {
          const themeNames = (cand.themes ?? []).map((t) => t.name);
          const mappedTags = [
            ...new Set(themeNames.map((n) => THEME_TO_TAG[n]).filter(Boolean)),
          ];

          if (mappedTags.length === 0) {
            noThemeOverlap += 1;
          } else {
            matched += 1;
            results.push({ game_id: row.game_id, title: row.title, tags: mappedTags });
          }
        }
      }
    } catch (e) {
      console.error(`Error on "${row.title}": ${e.message}`);
    }

    if (processed % 200 === 0) {
      console.log(
        `  ${processed}/${rows.length} | matched=${matched} ambiguous=${ambiguous} yearExcluded=${yearExcluded} noResult=${noResult} noThemeOverlap=${noThemeOverlap}`,
      );
      writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
    }

    await sleep(DELAY_MS);
  }

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nDone.`);
  console.log(`Processed: ${processed}`);
  console.log(`Rescued (got >=1 tag): ${matched}`);
  console.log(`Ambiguous: ${ambiguous}`);
  console.log(`Year excluded: ${yearExcluded}`);
  console.log(`No IGDB result: ${noResult}`);
  console.log(`Matched but no theme overlap: ${noThemeOverlap}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
