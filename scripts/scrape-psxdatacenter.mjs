// Scrapes psxdatacenter.com's PS2 NTSC-U game list + per-game INFO pages.
// The site is a legacy frameset (windows-1252 encoded); the actual list lives
// in psx2/ulist2.html and each INFO button links to psx2/games2/{SERIAL}.html.
//
// Read-only, polite scrape (one request at a time, delayed) — writes raw
// results to a JSON report for later matching against our catalog. Does not
// touch Supabase.
import { load } from "cheerio";
import { writeFileSync } from "node:fs";

const BASE = "https://psxdatacenter.com/psx2/";
const LIST_URL = `${BASE}ulist2.html`;
const DELAY_MS = 400;
const OUT_FILE = new URL("../reports/psxdatacenter-ntscu.json", import.meta.url);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDecoded(url) {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
  const buf = await res.arrayBuffer();
  return new TextDecoder("windows-1252").decode(buf);
}

function cleanText(t) {
  return t.replace(/ /g, " ").replace(/\s+/g, " ").trim();
}

async function parseList() {
  const html = await fetchDecoded(LIST_URL);
  const $ = load(html);
  const games = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (!href || !href.startsWith("games2/")) return;
    const row = $(el).closest("tr");
    const cells = row.find("td");
    const serial = cleanText(cells.eq(1).text());
    const title = cleanText(cells.eq(2).text());
    games.push({ serial, title, infoUrl: BASE + href });
  });
  return games;
}

function parseInfoPage(html) {
  const $ = load(html);
  const rows = {};
  $("tr").each((_, tr) => {
    const cells = $(tr).find("td");
    if (cells.length < 2) return;
    const label = cleanText(cells.eq(0).text()).toUpperCase();
    const value = cleanText(cells.eq(1).text());
    if (label && value) rows[label] = value;
  });

  const officialTitle = rows["OFFICIAL TITLE"] ?? null;
  const genre = rows["GENRE / STYLE"] ?? null;
  const developer = rows["DEVELOPER"] ?? null;
  const publisher = rows["PUBLISHER"] ?? null;
  const dateReleased = rows["DATE RELEASED"] ?? null;
  const players = rows["NUMBER OF PLAYERS"] ?? null;

  // Description is free text in a plain <p>/<td> block after the language
  // section, not a labeled row — grab the longest paragraph-like text block.
  let description = null;
  let longest = "";
  $("td").each((_, td) => {
    const txt = cleanText($(td).text());
    if (txt.length > longest.length && txt.length > 200 && !txt.includes("MANUFACTURER'S DESCRIPTION")) {
      longest = txt;
    }
  });
  if (longest) description = longest;

  return { officialTitle, genre, developer, publisher, dateReleased, players, description };
}

async function main() {
  console.log("Fetching game list...");
  const games = await parseList();
  console.log(`Found ${games.length} games with an INFO page.`);

  const results = [];
  let processed = 0;
  for (const game of games) {
    processed += 1;
    try {
      const html = await fetchDecoded(game.infoUrl);
      const info = parseInfoPage(html);
      results.push({ ...game, ...info });
    } catch (e) {
      console.error(`Error on ${game.serial} (${game.title}): ${e.message}`);
      results.push({ ...game, error: e.message });
    }
    await sleep(DELAY_MS);
    if (processed % 50 === 0) {
      console.log(`  ${processed}/${games.length} processed`);
      writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
    }
  }

  writeFileSync(OUT_FILE, JSON.stringify(results, null, 2));
  console.log(`Done. Wrote ${results.length} rows to ${OUT_FILE.pathname}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
