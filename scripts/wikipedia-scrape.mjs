import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY is required to run wikipedia-scrape.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

const RAWG_API_KEY = process.env.RAWG_API_KEY;

const WIKIPEDIA_PAGES = {
  atari_2600: "List_of_Atari_2600_games",
  sega_master_system: "List_of_Master_System_games",
  game_gear: "List_of_Game_Gear_games",
  genesis: "List_of_Sega_Genesis_games",
  gb: "List_of_Game_Boy_games",
  gbc: "List_of_Game_Boy_Color_games",
  neo_geo: "List_of_Neo_Geo_games",
  ps3: "List_of_PlayStation_3_games",
  // ps_vita uses SPLIT_PAGES below
  gamecube: "List_of_GameCube_games",
  n64: "List_of_Nintendo_64_games",
  dreamcast: "List_of_Dreamcast_games",
  saturn: "List_of_Sega_Saturn_games",
  gba: "List_of_Game_Boy_Advance_games",
  ps1: "List_of_PlayStation_(console)_games_(A–L)",
  psp: "List_of_PlayStation_Portable_games",
  nes: "List_of_Nintendo_Entertainment_System_games",
  snes: "List_of_Super_Nintendo_Entertainment_System_games",
  ds: "List_of_Nintendo_DS_games",
  "3ds": "List_of_Nintendo_3DS_games",
  wii: "List_of_Wii_games",
  wii_u: "List_of_Wii_U_games",
  ps5: "List_of_PlayStation_5_games",
  xbox_series_xs: "List_of_Xbox_Series_X_and_Series_S_games",
};

const SPLIT_PAGES = {
  ps1: ["List_of_PlayStation_(console)_games_(A–L)", "List_of_PlayStation_(console)_games_(M–Z)"],
  ps2: ["List_of_PlayStation_2_games_(A–K)", "List_of_PlayStation_2_games_(L–Z)"],
  ps3: [
    "List_of_PlayStation_3_games_(A–C)",
    "List_of_PlayStation_3_games_(D–I)",
    "List_of_PlayStation_3_games_(J–P)",
    "List_of_PlayStation_3_games_(Q–Z)",
  ],
  ds: [
    "List_of_Nintendo_DS_games_(0–C)",
    "List_of_Nintendo_DS_games_(D–I)",
    "List_of_Nintendo_DS_games_(J–P)",
    "List_of_Nintendo_DS_games_(Q–Z)",
  ],
  ps_vita: [
    "List_of_PlayStation_Vita_games_(A–D)",
    "List_of_PlayStation_Vita_games_(E–H)",
    "List_of_PlayStation_Vita_games_(I–L)",
    "List_of_PlayStation_Vita_games_(M–O)",
    "List_of_PlayStation_Vita_games_(P–R)",
    "List_of_PlayStation_Vita_games_(S)",
    "List_of_PlayStation_Vita_games_(T–V)",
    "List_of_PlayStation_Vita_games_(W–Z)",
  ],
  // NEW: remaining platforms
  ps4: ["List_of_PlayStation_4_games_(A–L)", "List_of_PlayStation_4_games_(M–Z)"],
  xbox_one: ["List_of_Xbox_One_games_(A–L)", "List_of_Xbox_One_games_(M–Z)"],
  xbox_360: ["List_of_Xbox_360_games_(A–L)", "List_of_Xbox_360_games_(M–Z)"],
  switch_1: [
    "List_of_Nintendo_Switch_games_(0–9)",
    "List_of_Nintendo_Switch_games_(A–Am)",
    "List_of_Nintendo_Switch_games_(An–Az)",
    "List_of_Nintendo_Switch_games_(B)",
    "List_of_Nintendo_Switch_games_(C–G)",
    "List_of_Nintendo_Switch_games_(H–P)",
    "List_of_Nintendo_Switch_games_(Q–Z)",
  ],
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function makeGameId(title, prefix = "wiki") {
  const safe = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return `${prefix}_${safe}`;
}

async function fetchWikipediaTable(pageTitle) {
  // Use direct HTML fetch (avoids MediaWiki API size limits & rate limits)
  const url = `https://en.wikipedia.org/wiki/${pageTitle}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; GameDBScraper/1.0)" },
  });
  if (!res.ok) {
    console.error(`  HTTP ${res.status} for ${pageTitle}`);
    return null;
  }
  return await res.text();
}

function parseGameTables(html) {
  const $ = cheerio.load(html);
  const games = [];

  $("table.wikitable").each((ti, table) => {
    const rows = $(table).find("tr");
    if (rows.length < 2) return;

    const headerCells = $(rows[0]).find("th");
    const headers = headerCells.map((i, th) => $(th).text().trim().toLowerCase()).get();

    // Detect column indices
    const titleIdx = headers.findIndex((h) => /^title/.test(h) || h.includes("title"));
    const yearColIdx = headers.findIndex((h) => /^year/.test(h) || h === "year[4]");
    const dateCols = headers
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => /release|date|^jp$|^na$|^pal$|^year/.test(h));

    if (titleIdx === -1 && dateCols.length === 0) return;

    $(rows)
      .slice(1)
      .each((ri, row) => {
        const cells = $(row).find("td, th");
        if (cells.length < 2) return;

        // Extract title from first cell
        let rawTitle = "";
        const firstCell = $(cells[titleIdx !== -1 ? titleIdx : 0]);
        const link = firstCell.find("a").first();
        rawTitle = link.length > 0 ? link.text().trim() : firstCell.text().trim();

        // Clean up title
        rawTitle = rawTitle.replace(/\[.*?\]/g, "").trim();
        if (!rawTitle || rawTitle.length < 2) return;

        // Skip section headers (like "Top", "0-9", "A", "B", etc.)
        if (/^(top|\d|games published|see also|notes|references|external links)/i.test(rawTitle))
          return;
        if (/^[a-z]$/i.test(rawTitle)) return;
        if (rawTitle.includes("Title") && headers.includes("title")) return;

        // Extract year from date columns
        let year = "";
        for (const { i: ci } of dateCols) {
          let dateText = $(cells[ci]).text().trim();
          dateText = dateText.replace(/\[.*?\]/g, "").trim();
          if (dateText && dateText !== "Unreleased" && !dateText.startsWith("TBA")) {
            const yearMatch = dateText.match(/(\d{4})/);
            if (yearMatch) {
              const y = yearMatch[1];
              if (!year || y < year) year = y; // Take earliest non-TBA release year
            }
          }
        }

        // Fallback: scan all cells for year
        if (!year) {
          for (let ci = 0; ci < cells.length; ci++) {
            if (ci === titleIdx) continue;
            const text = $(cells[ci])
              .text()
              .trim()
              .replace(/\[.*?\]/g, "")
              .trim();
            if (text && text !== "Unreleased") {
              const m = text.match(/(\d{4})/);
              if (m) {
                year = m[1];
                break;
              }
            }
          }
        }

        games.push({ title: rawTitle, year });
      });
  });

  return games;
}

function removeDuplicates(games) {
  const seen = new Set();
  return games.filter((g) => {
    const key = normalizeTitle(g.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function lookupRawg(title, year, platformId) {
  if (!RAWG_API_KEY) return null;

  const params = new URLSearchParams({
    key: RAWG_API_KEY,
    search: title,
    platforms: String(platformId),
    page_size: "5",
  });
  if (year) params.set("dates", `${year}-01-01,${year}-12-31`);

  const url = `https://api.rawg.io/api/games?${params}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    return data.results?.[0] || null;
  } catch {
    return null;
  }
}

async function loadExistingGames() {
  const byTitle = new Map(); // normalized title -> { game_id, title, platforms }
  let offset = 0;
  const pageSize = 1000;
  let done = false;

  while (!done) {
    const { data, error } = await supabase
      .from("games")
      .select("game_id, title, platforms")
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Error loading existing games:", error.message);
      return byTitle;
    }

    const batch = data ?? [];
    for (const g of batch) {
      if (g.title) {
        const key = normalizeTitle(g.title);
        if (!byTitle.has(key)) {
          byTitle.set(key, g);
        }
      }
    }

    offset += pageSize;
    if (batch.length < pageSize) done = true;
  }

  return byTitle;
}

async function main() {
  const platformSlug = process.argv[2];
  const skipRawg = process.argv.includes("--skip-rawg");

  if (!platformSlug) {
    console.error("Usage: node wikipedia-scrape.mjs <platform_slug> [--skip-rawg]");
    console.error("Platforms:", Object.keys(WIKIPEDIA_PAGES).join(", "));
    process.exit(1);
  }

  // Get platform from DB
  const { data: platform, error: pe } = await supabase
    .from("platforms")
    .select("id, name, rawg_id")
    .eq("id", platformSlug)
    .single();

  if (pe || !platform) {
    console.error(`Platform not found: ${platformSlug}`);
    process.exit(1);
  }

  const rawgId = platform.rawg_id;
  if (!rawgId) {
    console.error(`No RAWG ID for ${platform.name}`);
    process.exit(1);
  }

  console.error(`\n=== ${platform.name} (${platformSlug}, rawg_id: ${rawgId}) ===`);

  // Get Wikipedia page(s)
  const pages = SPLIT_PAGES[platformSlug] || [WIKIPEDIA_PAGES[platformSlug]];
  if (!pages || (Array.isArray(pages) && pages.length === 0)) {
    console.error(`No Wikipedia page mapped for ${platformSlug}`);
    process.exit(1);
  }

  console.error("Loading existing games for dedup...");
  const existingGames = await loadExistingGames();
  console.error(`  ${existingGames.size} existing games loaded`);

  let allWikiGames = [];

  for (const pageTitle of pages) {
    console.error(`\nFetching Wikipedia: ${pageTitle}...`);
    const html = await fetchWikipediaTable(pageTitle);
    if (!html) continue;

    const games = parseGameTables(html);
    const unique = removeDuplicates(games);
    console.error(`  Parsed ${games.length} rows, ${unique.length} unique`);
    allWikiGames.push(...unique);

    await sleep(500); // Be polite to Wikipedia
  }

  allWikiGames = removeDuplicates(allWikiGames);
  console.error(`\n${allWikiGames.length} total unique games from Wikipedia`);

  // Cross-reference with existing DB
  let missing = 0;
  let existing = 0;
  let platformLinked = 0;
  let rawgFound = 0;
  let rawgNotFound = 0;
  const newRows = [];
  const platformUpdateRows = [];

  for (let i = 0; i < allWikiGames.length; i++) {
    const g = allWikiGames[i];
    const nt = normalizeTitle(g.title);

    const existingGame = existingGames.get(nt);

    if (existingGame) {
      existing++;

      // Check if game already has this platform
      const platforms = existingGame.platforms || [];
      if (!platforms.includes(platformSlug)) {
        platformUpdateRows.push({
          game_id: existingGame.game_id,
          title: existingGame.title,
          platforms: [...platforms, platformSlug],
        });
        platformLinked++;
      }

      continue;
    }

    missing++;

    if (!skipRawg && RAWG_API_KEY) {
      const rawgGame = await lookupRawg(g.title, g.year, rawgId);
      await sleep(200);

      if (rawgGame) {
        rawgFound++;

        const rawgKey = normalizeTitle(rawgGame.name);
        const existingRawg = existingGames.get(rawgKey);
        if (existingRawg) {
          existing++;
          const platforms = existingRawg.platforms || [];
          if (!platforms.includes(platformSlug)) {
            platformUpdateRows.push({
              game_id: existingRawg.game_id,
              title: existingRawg.title,
              platforms: [...platforms, platformSlug],
            });
            platformLinked++;
          }
          existingGames.set(nt, existingRawg);
          continue;
        }

        const gameId = makeGameId(rawgGame.name, "rawg");
        const releaseYear = rawgGame.released ? rawgGame.released.slice(0, 4) : g.year;
        const coverUrl = rawgGame.background_image || "";

        newRows.push({
          game_id: gameId,
          title: rawgGame.name,
          aliases: [g.title],
          series: "",
          primary_genre: (rawgGame.genres || []).map((ge) => ge.slug).join(";"),
          platforms: [platformSlug],
          platform_names: [platform.name],
          release_year: releaseYear,
          release_state: "released",
          source_type: "finder",
          source_ref: `rawg:${rawgGame.id}`,
          cover_url: coverUrl,
          tags: [],
          notes: `From Wikipedia: ${g.title}`,
          sort_date: "",
          release_label: "",
        });

        existingGames.set(nt, { game_id: gameId, title: rawgGame.name, platforms: [platformSlug] });
        existingGames.set(normalizeTitle(rawgGame.name), {
          game_id: gameId,
          title: rawgGame.name,
          platforms: [platformSlug],
        });
        if ((i + 1) % 25 === 0) process.stdout.write(".");
        continue;
      } else {
        rawgNotFound++;
      }
    } else {
      rawgNotFound++;
    }

    // Insert as minimal entry
    const gameId = makeGameId(g.title, "wiki");
    newRows.push({
      game_id: gameId,
      title: g.title,
      aliases: [],
      series: "",
      primary_genre: "",
      platforms: [platformSlug],
      platform_names: [platform.name],
      release_year: g.year,
      release_state: "released",
      source_type: "finder",
      source_ref: `wikipedia:${g.title}`,
      cover_url: "",
      tags: ["retro_revival"],
      notes: "Added from Wikipedia",
      sort_date: "",
      release_label: "",
    });

    existingGames.set(nt, { game_id: gameId, title: g.title, platforms: [platformSlug] });

    if ((i + 1) % 100 === 0) {
      process.stdout.write(".");
    }
  }

  console.error(`\n\nResults for ${platform.name}:`);
  console.error(`  Already in DB: ${existing}`);
  console.error(`    - Platform linked: ${platformLinked}`);
  console.error(`  Missing: ${missing}`);
  console.error(`    - Found on RAWG: ${rawgFound}`);
  console.error(`    - Not on RAWG: ${rawgNotFound}`);
  console.error(`  New games to insert: ${newRows.length}`);
  console.error(`  Platform updates: ${platformUpdateRows.length}`);

  // Batch upsert new games
  if (newRows.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < newRows.length; i += BATCH) {
      const batch = newRows.slice(i, i + BATCH);
      const { error } = await supabase.from("games").upsert(batch, { onConflict: "game_id" });

      if (error) {
        console.error(`  Error upserting batch ${i / BATCH + 1}: ${error.message}`);
      } else {
        console.error(`  Inserted batch ${i / BATCH + 1}/${Math.ceil(newRows.length / BATCH)}`);
      }
    }
  }

  // Batch update platform links on existing games
  if (platformUpdateRows.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < platformUpdateRows.length; i += BATCH) {
      const batch = platformUpdateRows.slice(i, i + BATCH);
      const { error } = await supabase.from("games").upsert(batch, { onConflict: "game_id" });

      if (error) {
        console.error(`  Error updating batch ${i / BATCH + 1}: ${error.message}`);
      } else {
        console.error(
          `  Updated batch ${i / BATCH + 1}/${Math.ceil(platformUpdateRows.length / BATCH)}`,
        );
      }
    }
  }

  console.error(
    `\n=== Done: ${newRows.length} new + ${platformUpdateRows.length} linked for ${platform.name} ===`,
  );
}

main().catch(console.error);
