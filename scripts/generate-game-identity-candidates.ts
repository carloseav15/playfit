// Game Identity v1 -- candidate generation.
//
// Read-only against games_library.games by default. Computes edition_of
// review candidates via the pure logic in
// packages/core/src/domain/game-identity-candidates.ts and writes a JSON
// report under reports/. Never writes to the database unless --apply is
// passed explicitly, in which case it upserts `pending` rows into
// games_library_private.game_identity_candidate -- and even then, only
// INSERTs new pairs (onConflict: game_id_a,game_id_b -> ignoreDuplicates),
// so an already-reviewed pair (accepted or rejected) is never touched
// again by a later import.
//
// This script never confirms anything. It has no code path that writes to
// game_identity_group or game_identity_group_member.
//
// Usage:
//   SUPABASE_SERVICE_KEY=... npx tsx scripts/generate-game-identity-candidates.ts
//   SUPABASE_SERVICE_KEY=... npx tsx scripts/generate-game-identity-candidates.ts --apply

import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  type CatalogGameForIdentity,
  generateGameIdentityCandidates,
} from "../packages/core/src/domain/game-identity-candidates";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY required.");

const APPLY = process.argv.includes("--apply");

const catalogClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library" },
});
const privateClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  db: { schema: "games_library_private" },
});

async function fetchCatalog(): Promise<CatalogGameForIdentity[]> {
  const all: CatalogGameForIdentity[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await catalogClient
      .from("games")
      .select("game_id, title, release_year, series_id")
      .order("game_id")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      all.push({
        gameId: row.game_id,
        title: row.title,
        releaseYear: row.release_year,
        seriesId: row.series_id,
      });
    }
    if ((data ?? []).length < pageSize) break;
  }
  return all;
}

async function main() {
  console.log(`Fetching catalog from ${SUPABASE_URL} ...`);
  const catalog = await fetchCatalog();
  console.log(`Catalog rows: ${catalog.length}`);

  const candidates = generateGameIdentityCandidates(catalog);
  console.log(`Candidates generated: ${candidates.length}`);

  const byConfidence: Record<string, number> = {};
  const byKeyword: Record<string, number> = {};
  const byMatchType: Record<string, number> = {};
  for (const c of candidates) {
    byConfidence[c.confidence] = (byConfidence[c.confidence] ?? 0) + 1;
    byKeyword[c.evidence.matchedKeyword] = (byKeyword[c.evidence.matchedKeyword] ?? 0) + 1;
    byMatchType[c.evidence.matchType] = (byMatchType[c.evidence.matchType] ?? 0) + 1;
  }

  console.log("\nBy confidence:");
  for (const [tier, count] of Object.entries(byConfidence).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tier.padEnd(8)} ${count}`);
  }
  console.log("\nBy matched keyword:");
  for (const [kw, count] of Object.entries(byKeyword).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(4)}  ${kw}`);
  }
  console.log("\nBy match type:");
  for (const [type, count] of Object.entries(byMatchType).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${count.toString().padStart(4)}  ${type}`);
  }

  mkdirSync(new URL("../reports/", import.meta.url), { recursive: true });
  const output = new URL("../reports/game-identity-candidates.json", import.meta.url);
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        catalogRows: catalog.length,
        candidateCount: candidates.length,
        byConfidence,
        byKeyword,
        byMatchType,
        candidates,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nReport: ${output.pathname}`);

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write pending candidates to the database.");
    return;
  }

  console.log(
    `\nApplying ${candidates.length} candidates as 'pending' (existing pairs left untouched)...`,
  );
  const rows = candidates.map((c) => ({
    game_id_a: c.gameIdA,
    game_id_b: c.gameIdB,
    confidence: c.confidence,
    evidence: c.evidence,
    source: c.source,
    status: "pending",
  }));

  const BATCH = 200;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error, count } = await privateClient
      .from("game_identity_candidate")
      .upsert(batch, { onConflict: "game_id_a,game_id_b", ignoreDuplicates: true, count: "exact" });
    if (error) throw new Error(error.message);
    inserted += count ?? 0;
  }
  console.log(`Done. New pending candidates inserted (existing pairs skipped): ${inserted}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
