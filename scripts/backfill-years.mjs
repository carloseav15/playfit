import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY required.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWikipediaYear(title) {
  try {
    const searchUrl = "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" +
      encodeURIComponent(title + " video game") + "&format=json&srlimit=1";
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results = searchData.query?.search;
    if (!results || results.length === 0) return null;

    const pageTitle = results[0].title;
    const extractUrl = "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&exlimit=1&titles=" +
      encodeURIComponent(pageTitle) + "&format=json";
    const extractRes = await fetch(extractUrl);
    if (!extractRes.ok) return null;
    const extractData = await extractRes.json();
    const pages = extractData.query?.pages;
    if (!pages) return null;

    const page = Object.values(pages)[0];
    if (!page || page.pageid === -1 || !page.extract) return null;

    const extract = page.extract;
    const yr = extract.match(/(?:released|release date|releasedate|release)[^:]*:\s*(?:<[^>]+>)*.*?(?:19|20)\d{2}/i);
    if (yr) {
      const y = yr[0].match(/((?:19|20)\d{2})/);
      if (y) return y[1];
    }
    const anyYear = extract.match(/((?:19|20)\d{2})/);
    if (anyYear) return anyYear[1];
    return null;
  } catch {
    return null;
  }
}

async function main() {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  let done = false;
  while (!done) {
    const { data } = await supabase.from("games").select("game_id, title, release_year").range(from, from + pageSize - 1);
    all.push(...(data ?? []));
    from += pageSize;
    if ((data ?? []).length < pageSize) done = true;
  }

  const needsYear = all.filter(g =>
    (!g.release_year || g.release_year === "")
  );
  console.log(`Games needing year backfill: ${needsYear.length}`);

  const apply = process.argv.includes("--apply");
  if (!apply) {
    console.log("Dry run. Re-run with --apply to fetch from Wikipedia and write to DB.");
    return;
  }

  const BATCH_SIZE = 50;
  const API_DELAY = 1500;
  let hits = 0;

  for (let i = 0; i < needsYear.length; i += BATCH_SIZE) {
    const batch = needsYear.slice(i, i + BATCH_SIZE);
    await sleep(API_DELAY);

    const updates = [];
    for (const game of batch) {
      const year = await fetchWikipediaYear(game.title);
      if (year) {
        updates.push({ game_id: game.game_id, release_year: year });
        hits++;
      }
    }

    if (updates.length > 0) {
      await Promise.all(
        updates.map(u => supabase.from("games").update({ release_year: u.release_year }).eq("game_id", u.game_id))
      );
    }

    const pct = (((i + batch.length) / needsYear.length) * 100).toFixed(1);
    console.log(`  [${pct}%] batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(needsYear.length / BATCH_SIZE)}: +${updates.length} (total ${hits})`);
  }

  console.log(`\n=== Done ===`);
  console.log(`Total years backfilled: ${hits}/${needsYear.length}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
