#!/usr/bin/env node
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

const PROGRESS_FILE = "/tmp/enrich-platforms-progress.json";

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    try {
      return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
    } catch {}
  }
  return { processed: [], noData: [], skipped: [] };
}

function saveProgress(processed, noData, skipped) {
  writeFileSync(PROGRESS_FILE, JSON.stringify({ processed, noData, skipped }, null, 2));
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

async function loadAll(table, columns, opts = {}) {
  const all = [];
  const pageSize = 1000;
  let from = 0;
  let done = false;

  while (!done) {
    let query = supabase.from(table).select(columns);
    if (opts.order) {
      query = query.order(opts.order);
    }
    if (opts.notNull) {
      for (const col of opts.notNull) {
        query = query.not(col, "is", null);
      }
    }
    const { data, error } = await query.range(from, from + pageSize - 1);

    if (error) {
      console.error(`  Error loading ${table}: ${error.message}`);
      return all;
    }

    all.push(...(data ?? []));
    from += pageSize;
    if ((data ?? []).length < pageSize) done = true;
  }

  return all;
}

async function loadGamesWithoutPlatforms() {
  const { processed, noData, skipped } = loadProgress();
  const blocked = new Set([...processed, ...noData, ...skipped]);

  const games = await loadAll("games", "game_id, title, release_year, source_type, source_ref", { order: "game_id" });
  const gpRows = await loadAll("game_platforms", "game_id", { order: "game_id" });

  const hasPlatform = new Set(gpRows.map((r) => r.game_id));

  return games.filter((g) => !blocked.has(g.game_id) && !hasPlatform.has(g.game_id));
}

async function main() {
  const { processed, noData, skipped } = loadProgress();
  console.log(`Progress: ${processed.length} processed, ${noData.length} no-data, ${skipped.length} skipped`);

  const games = await loadGamesWithoutPlatforms();
  console.log(`${games.length} games to process`);

  if (games.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  const platformRows = await loadAll("platforms", "id, rawg_id", { notNull: ["rawg_id"], order: "id" });
  const rawgToLocal = {};
  for (const p of platformRows) {
    rawgToLocal[p.rawg_id] = p.id;
  }
  console.log(`Loaded ${Object.keys(rawgToLocal).length} platform rawg_id mappings`);

  let inserted = 0;
  let errors = 0;
  let newNoData = [...noData];
  let newProcessed = [...processed];
  let newSkipped = [...skipped];
  let batch = [];

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const normalized = normalizeTitle(stripParenthetical(game.title));

    const url = `https://api.rawg.io/api/games?key=${RAWG_API_KEY}&search=${encodeURIComponent(normalized)}&page_size=5`;
    const res = await fetch(url);

    let matchedPlatformIds = null;

    if (res.ok) {
      const data = await res.json();
      for (const candidate of data.results ?? []) {
        if (!candidate.platforms || candidate.platforms.length === 0) continue;

        const candidateNorm = normalizeTitle(stripParenthetical(candidate.name));
        const gameNorm = normalizeTitle(stripParenthetical(game.title));

        if (
          candidateNorm === gameNorm ||
          candidateNorm.includes(gameNorm) ||
          gameNorm.includes(candidateNorm)
        ) {
          if (game.release_year && game.release_year > 0 && candidate.released) {
            const candidateYear = parseInt(candidate.released.slice(0, 4), 10);
            if (Math.abs(candidateYear - game.release_year) > 2) continue;
          }

          const rawgPlatformIds = candidate.platforms
            .map((p) => p.platform?.id)
            .filter(Boolean);

          matchedPlatformIds = [...new Set(
            rawgPlatformIds
              .map((rid) => rawgToLocal[rid])
              .filter(Boolean)
          )];

          if (matchedPlatformIds.length > 0) break;
        }
      }
    } else {
      errors++;
    }

    newProcessed.push(game.game_id);

    if (matchedPlatformIds && matchedPlatformIds.length > 0) {
      for (const platformId of matchedPlatformIds) {
        batch.push({ game_id: game.game_id, platform_id: platformId });
      }
    } else if (res.ok) {
      newNoData.push(game.game_id);
    } else {
      newSkipped.push(game.game_id);
    }

    if (batch.length >= 100 || i === games.length - 1) {
      if (batch.length > 0) {
        const { error } = await supabase.from("game_platforms").upsert(batch, {
          onConflict: "game_id, platform_id",
          ignoreDuplicates: true,
        });
        if (error) {
          console.error(`  Upsert error at ${i}: ${error.message}`);
        } else {
          inserted += batch.length;
        }
      }
      saveProgress(newProcessed, newNoData, newSkipped);
      batch = [];
    }

    if ((i + 1) % 25 === 0 || i === games.length - 1) {
      console.log(`  [${i + 1}/${games.length}] platforms_inserted=${inserted} errors=${errors} no_match=${newNoData.length}`);
    }

    await sleep(260);
  }

  console.log(`\nDone. ${inserted} platform entries inserted, ${errors} API errors, ${newNoData.length} games with no RAWG match.`);
}

main().catch(console.error);
