#!/usr/bin/env node
// Enrich genre_id from RAWG in two phases:
//   Phase 1 — direct ID lookup for games with a rawg: source_ref
//   Phase 2 — title search for remaining games without a RAWG ref
//
// Usage: RAWG_API_KEY=xxx node scripts/enrich-genres.mjs
// Progress saved to /tmp/enrich-genres-progress.json (reanudable)

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SUPABASE_URL =
  process.env.SUPABASE_URL ??
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RAWG_API_KEY = process.env.RAWG_API_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_KEY env var required");
  process.exit(1);
}
if (!RAWG_API_KEY) {
  console.error("RAWG_API_KEY env var required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

const PROGRESS_FILE = "/tmp/enrich-genres-progress.json";

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
    } catch {
      // ignore
    }
  }
  return { processed: [], noData: [] };
}

function saveProgress(processed, noData) {
  writeFileSync(PROGRESS_FILE, JSON.stringify({ processed, noData }, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stripParenthetical(title) {
  return title.replace(/\s*\([^)]*\)\s*$/, "").trim();
}

async function loadCandidates(table, column, clause, processed, noData) {
  const blocked = new Set([...processed, ...noData]);
  const all = [];
  const pageSize = 1000;
  let from = 0;
  let done = false;

  while (!done) {
    const query = supabase
      .from(table)
      .select("game_id, title, release_year, source_ref");

    query.is("genre_id", null);

    const { data, error } = await query.range(from, from + pageSize - 1);

    if (error) {
      console.error("  Load error:", error.message);
      return all;
    }

    for (const g of data ?? []) {
      if (!blocked.has(g.game_id) && clause(g)) {
        all.push(g);
      }
    }

    from += pageSize;
    if ((data ?? []).length < pageSize) done = true;
  }

  return all;
}

// ── Phase 1: direct RAWG ID lookup ──────────────────────────────────

async function phase1ById(games) {
  console.log(`\nPhase 1: direct ID lookup (${games.length} games)`);
  const { processed, noData } = loadProgress();
  let updated = 0;
  let errors = 0;
  let batch = [];

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const rawgId = game.source_ref.replace("rawg:", "");

    const url = `https://api.rawg.io/api/games/${rawgId}?key=${RAWG_API_KEY}`;
    const res = await fetch(url);

    if (res.ok) {
      const data = await res.json();
      if (data.genres && data.genres.length > 0) {
        const genreSlugs = data.genres.map((g) => g.slug);
        batch.push({
          game_id: game.game_id,
          genre_id: genreSlugs[0] ?? null,
        });
      } else {
        noData.push(game.game_id);
      }
    } else {
      errors++;
      noData.push(game.game_id);
    }

    processed.push(game.game_id);

    if (batch.length >= 50 || i === games.length - 1) {
      if (batch.length > 0) {
        await ensureGenres(batch);
        const { error } = await supabase.from("games").upsert(batch, {
          onConflict: "game_id",
        });
        if (error) {
          console.error(`  Upsert error at ${i}: ${error.message}`);
          errors += batch.length;
        } else {
          updated += batch.length;
        }
      }
      saveProgress(processed, noData);
      batch = [];
    }

    if ((i + 1) % 100 === 0 || i === games.length - 1) {
      console.log(`  [${i + 1}/${games.length}] updated=${updated} errors=${errors}`);
    }

    await sleep(260);
  }

  return { updated, errors, noData };
}

async function ensureGenres(rows) {
  const genreSet = new Set();
  for (const row of rows) {
    if (row.genre_id) genreSet.add(row.genre_id);
  }
  if (genreSet.size === 0) return;
  const genreRows = [...genreSet].map((slug) => ({ id: slug, name: slug }));
  const { error } = await supabase.from("genres").upsert(genreRows, {
    onConflict: "id",
    ignoreDuplicates: true,
  });
  if (error) console.error("  Error ensuring genres:", error.message);
}

// ── Phase 2: title search ───────────────────────────────────────────

async function phase2BySearch(games) {
  console.log(`\nPhase 2: title search (${games.length} games)`);
  const { processed, noData } = loadProgress();
  let updated = 0;
  let errors = 0;
  let batch = [];

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const normalized = normalizeTitle(stripParenthetical(game.title));

    const url = `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(normalized)}&page_size=5`;
    const res = await fetch(url);

    let foundGenre = null;
    let batchGenreId = null;

    if (res.ok) {
      const data = await res.json();
      for (const candidate of data.results ?? []) {
        if (!candidate.genres || candidate.genres.length === 0) continue;

        const candidateNorm = normalizeTitle(stripParenthetical(candidate.name));
        const gameNorm = normalizeTitle(stripParenthetical(game.title));

        // Strong match: normalized title contains each other
        if (candidateNorm === gameNorm ||
            candidateNorm.includes(gameNorm) ||
            gameNorm.includes(candidateNorm)) {

          // Year sanity-check if we have it
          if (game.release_year && candidate.released) {
            const candidateYear = parseInt(candidate.released.slice(0, 4), 10);
            if (Math.abs(candidateYear - game.release_year) > 2) continue;
          }

          const slugs = candidate.genres.map((g) => g.slug);
          foundGenre = slugs.join(";");
          batchGenreId = slugs[0] ?? null;
          break;
        }
      }
    } else {
      errors++;
    }

    processed.push(game.game_id);

    if (foundGenre) {
      batch.push({ game_id: game.game_id, genre_id: batchGenreId });
      batchGenreId = null;
    } else {
      noData.push(game.game_id);
    }

    if (batch.length >= 50 || i === games.length - 1) {
      if (batch.length > 0) {
        await ensureGenres(batch);
        const { error } = await supabase.from("games").upsert(batch, {
          onConflict: "game_id",
        });
        if (error) {
          console.error(`  Upsert error at ${i}: ${error.message}`);
          errors += batch.length;
        } else {
          updated += batch.length;
        }
      }
      saveProgress(processed, noData);
      batch = [];
    }

    if ((i + 1) % 100 === 0 || i === games.length - 1) {
      console.log(`  [${i + 1}/${games.length}] updated=${updated} errors=${errors}`);
    }

    await sleep(260);
  }

  return updated;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const { processed, noData } = loadProgress();
  console.log(`Progress: ${processed.length} processed, ${noData.length} no-data`);

  // Phase 1: games with RAWG ref + null genre
  const refGames = await loadCandidates(
    "games", "genre_id", (g) => (g.source_ref || "").startsWith("rawg:"),
    processed, noData
  );
  console.log(`  ${refGames.length} remaining for phase 1`);

  let totalUpdated = 0;
  let totalErrors = 0;

  if (refGames.length > 0) {
    const result = await phase1ById(refGames);
    totalUpdated += result.updated;
    totalErrors += result.errors;
  } else {
    console.log("  (none left)");
  }

  // Phase 2: remaining games without RAWG ref + null genre
  const searchGames = await loadCandidates(
    "games", "genre_id", (g) => !(g.source_ref || "").startsWith("rawg:"),
    processed, noData
  );
  console.log(`  ${searchGames.length} remaining for phase 2`);

  if (searchGames.length > 0) {
    const updated = await phase2BySearch(searchGames);
    totalUpdated += updated;
  } else {
    console.log("  (none left)");
  }

  console.log(`\nDone. ${totalUpdated} genres enriched, ${totalErrors} errors.`);
}

main().catch(console.error);
