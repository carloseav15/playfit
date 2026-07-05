// Applies reports/igdb-covers-apply.json (from match-igdb-covers.mjs) to the
// database: replaces games.cover_url with the IGDB CDN URL and records the
// match in game_external_ids (provider 'igdb', cover image id in metadata).
//
// The original cover_url is preserved in previous_cover_url (only if that is
// still empty, so re-runs never overwrite the true pre-IGDB cover).
// Idempotent: rows whose cover_url already is the target URL are skipped.
//
// Usage:
//   SUPABASE_SERVICE_KEY=... node scripts/apply-igdb-covers.mjs [--dry-run]
//     [--min-confidence 80] [--tier steam,title_platform] [--platform psp]
//     [--limit 500]
// Defaults to the local Supabase stack (http://127.0.0.1:54321).
//
// --tier, --platform and --limit let this run in small, checkable batches
// instead of one all-at-once write (e.g. do --tier steam first since it's
// 100% confidence, spot-check, then widen to title_platform, then title;
// or go one platform at a time, matching how this repo's other backfills
// are already split per-platform).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const APPLY_FILE = new URL("../reports/igdb-covers-apply.json", import.meta.url);

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? null : process.argv[idx + 1];
}

const DRY_RUN = process.argv.includes("--dry-run");
const MIN_CONFIDENCE = argValue("--min-confidence") ? Number(argValue("--min-confidence")) : 80;
const TIERS = argValue("--tier") ? new Set(argValue("--tier").split(",")) : null;
const PLATFORM = argValue("--platform");
const LIMIT = argValue("--limit") ? Number(argValue("--limit")) : null;
const CONCURRENCY = 20;

if (!SUPABASE_SERVICE_KEY) {
  throw new Error("SUPABASE_SERVICE_KEY is required to run apply-igdb-covers.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

function igdbCoverUrl(imageId) {
  return `https://images.igdb.com/igdb/image/upload/t_cover_big/${imageId}.jpg`;
}

async function fetchCoverState(gameIds) {
  const state = new Map();
  const PAGE = 100; // game_id is a long slug; .in() with 500 overflows the GET URL length limit
  for (let i = 0; i < gameIds.length; i += PAGE) {
    const { data, error } = await supabase
      .from("games")
      .select("game_id,cover_url,previous_cover_url")
      .in("game_id", gameIds.slice(i, i + PAGE));
    if (error) throw new Error(`fetch games: ${error.message}`);
    for (const row of data) state.set(row.game_id, row);
  }
  return state;
}

async function runPool(items, worker) {
  let next = 0;
  let failed = 0;
  const lanes = Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await worker(item);
      } catch (e) {
        failed += 1;
        console.error(`  ${item.game_id}: ${e.message}`);
      }
    }
  });
  await Promise.all(lanes);
  return failed;
}

async function main() {
  const all = JSON.parse(readFileSync(APPLY_FILE, "utf8"));
  let matches = all.filter((m) => m.confidence >= MIN_CONFIDENCE);
  console.log(`Matches in file: ${all.length}, at confidence >= ${MIN_CONFIDENCE}: ${matches.length}`);

  if (TIERS) {
    matches = matches.filter((m) => TIERS.has(m.tier));
    console.log(`After --tier ${[...TIERS].join(",")}: ${matches.length}`);
  }
  if (PLATFORM) {
    matches = matches.filter((m) => (m.platforms ?? []).includes(PLATFORM));
    console.log(`After --platform ${PLATFORM}: ${matches.length}`);
  }
  if (LIMIT) {
    matches = matches.slice(0, LIMIT);
    console.log(`After --limit ${LIMIT}: ${matches.length}`);
  }

  const state = await fetchCoverState(matches.map((m) => m.game_id));

  const updates = [];
  let missing = 0;
  let alreadyApplied = 0;
  for (const m of matches) {
    const row = state.get(m.game_id);
    if (!row) {
      missing += 1;
      continue;
    }
    const target = igdbCoverUrl(m.image_id);
    if (row.cover_url === target) {
      alreadyApplied += 1;
      continue;
    }
    updates.push({
      ...m,
      new_cover_url: target,
      new_previous_cover_url: row.previous_cover_url || row.cover_url || "",
    });
  }
  console.log(`To update: ${updates.length} (already applied: ${alreadyApplied}, missing game_id: ${missing})`);

  if (DRY_RUN) {
    for (const u of updates.slice(0, 10)) {
      console.log(`  [${u.tier}/${u.confidence}] ${u.game_id} -> ${u.new_cover_url}`);
    }
    console.log("Dry run, no changes written.");
    return;
  }

  let done = 0;
  const failedCovers = await runPool(updates, async (u) => {
    const { error } = await supabase
      .from("games")
      .update({ cover_url: u.new_cover_url, previous_cover_url: u.new_previous_cover_url })
      .eq("game_id", u.game_id);
    if (error) throw new Error(error.message);
    done += 1;
    if (done % 2000 === 0) console.log(`  covers: ${done}/${updates.length}`);
  });
  console.log(`Covers updated: ${done}, failed: ${failedCovers}`);

  let linked = 0;
  const failedIds = await runPool(matches, async (m) => {
    const { error } = await supabase.from("game_external_ids").upsert(
      {
        game_id: m.game_id,
        provider: "igdb",
        provider_game_key: String(m.igdb_id),
        source_title: m.igdb_name,
        confidence_score: m.confidence,
        metadata: { cover_image_id: m.image_id, igdb_slug: m.igdb_slug, matched_by: m.tier },
      },
      { onConflict: "game_id,provider,provider_game_key" },
    );
    if (error) throw new Error(error.message);
    linked += 1;
    if (linked % 5000 === 0) console.log(`  external_ids: ${linked}/${matches.length}`);
  });
  console.log(`External ids upserted: ${linked}, failed: ${failedIds}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
