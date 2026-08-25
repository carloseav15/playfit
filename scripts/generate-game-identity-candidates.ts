// Game Identity v1 -- candidate generation.
//
// Read-only against games_library.games by default. Computes edition_of
// review candidates via the pure logic in
// packages/core/src/domain/game-identity-candidates.ts and writes a JSON
// report under reports/. Never writes to the database unless --apply is
// passed explicitly, in which case it inserts `pending` rows via the
// games_library.import_game_identity_candidates(jsonb) RPC -- and even
// then, only INSERTs new pairs (the RPC does ON CONFLICT (game_id_a,
// game_id_b) DO NOTHING), so an already-reviewed pair (accepted or
// rejected) is never touched again by a later import.
//
// Why an RPC instead of writing to games_library_private directly: that
// schema is deliberately not in the Supabase Data API's exposed schemas
// (supabase/config.toml `schemas`), matching production, so
// `.schema('games_library_private')` fails with PGRST106 "Invalid schema"
// for ANY operation there, including calling a function that merely lives
// in that schema. import_game_identity_candidates lives in games_library
// (already exposed) and reaches into games_library_private on this
// script's behalf -- see
// supabase/migrations/20260823120000_add_game_identity_candidate_import_rpc.sql.
//
// This script never confirms anything. It has no code path that writes to
// game_identity_group or game_identity_group_member.
//
// Auth boundary: the dry run only reads games_library.games, so it only
// needs the anon key. SUPABASE_SERVICE_KEY is required solely to call the
// import RPC, so it's only checked once --apply is passed -- a
// missing/empty service key can never block the dry run, and dry run
// output never depends on write privileges being available.
//
// Usage:
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=... npx tsx scripts/generate-game-identity-candidates.ts
//   NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SERVICE_KEY=... npx tsx scripts/generate-game-identity-candidates.ts --apply

import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  buildCandidateImportRows,
  chunkCandidateImportRows,
} from "../packages/core/src/domain/game-identity-candidate-import";
import {
  type CatalogGameForIdentity,
  generateGameIdentityCandidates,
} from "../packages/core/src/domain/game-identity-candidates";

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_ANON_KEY) throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY required.");

const APPLY = process.argv.includes("--apply");

const catalogClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: "games_library" },
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

  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_SERVICE_KEY) throw new Error("SUPABASE_SERVICE_KEY required for --apply.");
  const importClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    db: { schema: "games_library" },
  });

  console.log(
    `\nApplying ${candidates.length} candidates as 'pending' (existing pairs left untouched)...`,
  );
  const rows = buildCandidateImportRows(candidates);

  const BATCH = 200;
  let inserted = 0;
  for (const batch of chunkCandidateImportRows(rows, BATCH)) {
    const { data, error } = await importClient.rpc("import_game_identity_candidates", {
      p_candidates: batch,
    });
    if (error) throw new Error(error.message);
    inserted += data ?? 0;
  }
  console.log(`Done. New pending candidates inserted (existing pairs skipped): ${inserted}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
