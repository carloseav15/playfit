// Applies reports/igdb-quality-check.ndjson (from fetch-igdb-quality-check.mjs)
// to games_library.game_companies and games_library.game_scores.
//
// Gap-fill only, decided from a real coverage/agreement comparison (see
// session notes): IGDB's developer/publisher agree with existing sources
// only ~68-74% of the time where both have data, and neither source is
// systematically more accurate (each has real errors). So this never
// overwrites or duplicates alongside existing data for a game - it only
// adds an 'igdb' row where that specific signal (developer rows, publisher
// rows, critic score, user score) is completely absent for that game_id.
//
// Usage:
//   SUPABASE_SERVICE_KEY=... node scripts/apply-igdb-quality-check.mjs [--dry-run]
//     [--only companies,scores] [--limit 500]
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const QUALITY_FILE = new URL("../reports/igdb-quality-check.ndjson", import.meta.url);

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY is required.");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  return idx === -1 ? null : process.argv[idx + 1];
}

const DRY_RUN = process.argv.includes("--dry-run");
const ONLY = argValue("--only") ? new Set(argValue("--only").split(",")) : new Set(["companies", "scores"]);
const LIMIT = argValue("--limit") ? Number(argValue("--limit")) : null;
const CONCURRENCY = 20;

async function fetchAllRows(table, columns, filter, orderColumn = "game_id") {
  const rows = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).range(from, from + PAGE - 1).order(orderColumn);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
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
        console.error(`  ${JSON.stringify(item)}: ${e.message}`);
      }
    }
  });
  await Promise.all(lanes);
  return failed;
}

async function main() {
  const lines = readFileSync(QUALITY_FILE, "utf8").split("\n").filter(Boolean);
  const igdbById = new Map();
  for (const l of lines) {
    const r = JSON.parse(l);
    igdbById.set(r.igdb_id, r);
  }
  console.log(`IGDB quality-check records: ${igdbById.size}`);

  const links = await fetchAllRows("game_external_ids", "game_id,provider_game_key", (q) => q.eq("provider", "igdb"));
  const igdbIdByGame = new Map(links.map((l) => [l.game_id, Number(l.provider_game_key)]));

  const companyInserts = [];
  const scoreInserts = [];

  if (ONLY.has("companies")) {
    const compRows = await fetchAllRows("game_companies", "game_id,role");
    const hasDev = new Set(compRows.filter((r) => r.role === "developer").map((r) => r.game_id));
    const hasPub = new Set(compRows.filter((r) => r.role === "publisher").map((r) => r.game_id));

    for (const [gameId, igdbId] of igdbIdByGame) {
      const igdb = igdbById.get(igdbId);
      if (!igdb) continue;

      if (!hasDev.has(gameId)) {
        for (const name of igdb.developers) {
          companyInserts.push({
            game_id: gameId,
            company_name: name,
            role: "developer",
            source: "igdb",
            source_key: `igdb:${igdbId}`,
          });
        }
      }
      if (!hasPub.has(gameId)) {
        for (const name of igdb.publishers) {
          companyInserts.push({
            game_id: gameId,
            company_name: name,
            role: "publisher",
            source: "igdb",
            source_key: `igdb:${igdbId}`,
          });
        }
      }
    }
  }

  if (ONLY.has("scores")) {
    const scoreRows = await fetchAllRows("game_scores", "game_id,critic_score,user_score");
    const hasCritic = new Set(scoreRows.filter((r) => r.critic_score != null).map((r) => r.game_id));
    const hasUser = new Set(scoreRows.filter((r) => r.user_score != null).map((r) => r.game_id));

    for (const [gameId, igdbId] of igdbIdByGame) {
      const igdb = igdbById.get(igdbId);
      if (!igdb) continue;

      const critic_score =
        !hasCritic.has(gameId) && igdb.critic_rating != null ? Math.round(igdb.critic_rating) : null;
      const critic_count = critic_score != null ? igdb.critic_rating_count : null;
      const user_score =
        !hasUser.has(gameId) && igdb.user_rating != null ? Math.round((igdb.user_rating / 10) * 10) / 10 : null;
      const user_count = user_score != null ? igdb.user_rating_count : null;

      if (critic_score != null || user_score != null) {
        scoreInserts.push({
          game_id: gameId,
          score_source: "igdb",
          critic_score,
          critic_count,
          user_score,
          user_count,
          source_key: `igdb:${igdbId}`,
        });
      }
    }
  }

  const limitedCompanies = LIMIT ? companyInserts.slice(0, LIMIT) : companyInserts;
  const limitedScores = LIMIT ? scoreInserts.slice(0, LIMIT) : scoreInserts;

  console.log(`Company rows to insert: ${limitedCompanies.length} (of ${companyInserts.length})`);
  console.log(`Score rows to insert: ${limitedScores.length} (of ${scoreInserts.length})`);

  if (DRY_RUN) {
    for (const c of limitedCompanies.slice(0, 8)) console.log("  company:", JSON.stringify(c));
    for (const s of limitedScores.slice(0, 8)) console.log("  score:", JSON.stringify(s));
    console.log("Dry run, no changes written.");
    return;
  }

  let doneCompanies = 0;
  const failedCompanies = await runPool(limitedCompanies, async (c) => {
    const { error } = await supabase.from("game_companies").upsert(c, { onConflict: "game_id,company_name,role,source" });
    if (error) throw new Error(error.message);
    doneCompanies += 1;
    if (doneCompanies % 5000 === 0) console.log(`  companies: ${doneCompanies}/${limitedCompanies.length}`);
  });
  console.log(`Companies inserted: ${doneCompanies}, failed: ${failedCompanies}`);

  let doneScores = 0;
  const failedScores = await runPool(limitedScores, async (s) => {
    const { error } = await supabase
      .from("game_scores")
      .upsert(s, { onConflict: "game_id,platform_id,score_source,source_key" });
    if (error) throw new Error(error.message);
    doneScores += 1;
    if (doneScores % 5000 === 0) console.log(`  scores: ${doneScores}/${limitedScores.length}`);
  });
  console.log(`Scores inserted: ${doneScores}, failed: ${failedScores}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
