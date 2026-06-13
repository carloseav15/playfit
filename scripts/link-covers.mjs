import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY is required.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

const COVER_DIR = path.join(process.cwd(), "apps", "web", "public", "covers", "games");

// Must match slugifyTitle in backfill-covers.mjs for deterministic matching
function slugifyTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}

function filenameBase(file) {
  return file.replace(/\.(jpg|jpeg|png|webp|gif|avif)$/i, "").toLowerCase();
}

async function loadAllGames() {
  const all = [];
  let from = 0;
  const pageSize = 1000;
  let done = false;
  while (!done) {
    const { data } = await supabase
      .from("games")
      .select("game_id, title, cover_url, release_year")
      .range(from, from + pageSize - 1);
    all.push(...(data ?? []));
    from += pageSize;
    if ((data ?? []).length < pageSize) done = true;
  }
  return all;
}

async function main() {
  // Read all local cover files
  let coverFiles;
  try {
    coverFiles = fs.readdirSync(COVER_DIR).filter(f => /\.(jpg|jpeg|png|webp|gif|avif)$/i.test(f));
  } catch {
    console.error(`Cover directory not found: ${COVER_DIR}`);
    process.exit(1);
  }

  console.log(`Local cover files on disk: ${coverFiles.length}`);

  // Build map: slugified base name -> original filename
  const coverMap = new Map();
  for (const file of coverFiles) {
    const base = filenameBase(file);
    if (!coverMap.has(base)) {
      coverMap.set(base, file);
    }
  }
  console.log(`Unique slugified keys: ${coverMap.size}`);

  // Load all games
  console.log("Loading games from DB...");
  const games = await loadAllGames();
  console.log(`Total games in DB: ${games.length}`);

  // Categorize games
  const noCover = games.filter(g => !g.cover_url || g.cover_url === "");
  const extCover = games.filter(g => g.cover_url && g.cover_url.startsWith("http"));
  const localCover = games.filter(g => g.cover_url && g.cover_url.startsWith("covers/"));

  console.log(`\nCover URL breakdown:`);
  console.log(`  Empty:          ${noCover.length}`);
  console.log(`  External (URL): ${extCover.length}`);
  console.log(`  Local (covers/):${localCover.length}`);

  // Find matches
  const matches = [];
  const unmatchedFiles = new Set(coverMap.keys());

  for (const g of noCover) {
    const slug = slugifyTitle(g.title);
    if (coverMap.has(slug)) {
      matches.push({ game: g, file: coverMap.get(slug), type: "no_cover" });
      unmatchedFiles.delete(slug);
    }
  }

  for (const g of extCover) {
    const slug = slugifyTitle(g.title);
    if (coverMap.has(slug)) {
      matches.push({ game: g, file: coverMap.get(slug), type: "external_cover" });
      unmatchedFiles.delete(slug);
    }
  }

  console.log(`\n=== Match Results ===`);
  console.log(`No-cover games with local file:     ${matches.filter(m => m.type === "no_cover").length}`);
  console.log(`External-cover → local file:        ${matches.filter(m => m.type === "external_cover").length}`);
  console.log(`Total games linkable:               ${matches.length}`);
  console.log(`Unmatched local files (orphans?):    ${unmatchedFiles.size}`);

  // Show unmatched files (potential orphans)
  if (unmatchedFiles.size > 0) {
    console.log(`\nUnmatched local files (first 30):`);
    const sorted = [...unmatchedFiles].sort();
    for (const f of sorted.slice(0, 30)) {
      console.log(`  ${coverMap.get(f)}`);
    }
    if (sorted.length > 30) {
      console.log(`  ... and ${sorted.length - 30} more`);
    }
  }

  // ── Apply ──
  const apply = process.argv.includes("--apply");
  if (!apply) {
    console.log("\nDry run. Re-run with --apply to write to database.");
    return;
  }

  const BATCH = 100;
  let updated = 0;
  let errors = 0;

  for (let i = 0; i < matches.length; i += BATCH) {
    const batch = matches.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(m =>
        supabase
          .from("games")
          .update({ cover_url: `covers/games/${m.file}` })
          .eq("game_id", m.game.game_id)
      )
    );
    for (const r of results) {
      if (r.error) errors++;
    }
    updated += batch.length - results.filter(r => r.error).length;
    console.log(`  Batch ${Math.floor(i / BATCH) + 1}/${Math.ceil(matches.length / BATCH)}: +${batch.length - results.filter(r => r.error).length}`);
  }

  console.log(`\n=== Done ===`);
  console.log(`Updated: ${updated}, Errors: ${errors}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
