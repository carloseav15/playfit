// Pure, DB-free shaping for the Game Identity candidate import boundary.
//
// scripts/generate-game-identity-candidates.ts --apply calls the
// games_library.import_game_identity_candidates(jsonb) RPC (see
// supabase/migrations/20260823120000_add_game_identity_candidate_import_rpc.sql)
// instead of writing to games_library_private directly, because that schema
// is not in the Data API's exposed schemas. This module only shapes the
// payload for that call -- it never touches the network itself, so it's
// testable without mocking supabase-js.

import type { GameIdentityCandidateDraft } from "./game-identity-candidates";

export interface CandidateImportRow {
  game_id_a: string;
  game_id_b: string;
  confidence: string;
  evidence: unknown;
  source: string;
}

// Row shape the RPC expects -- deliberately excludes `status`: the RPC
// always inserts as 'pending' itself (see the migration), so there is no
// client-controlled way to insert anything else.
export function buildCandidateImportRows(
  candidates: readonly GameIdentityCandidateDraft[],
): CandidateImportRow[] {
  return candidates.map((c) => ({
    game_id_a: c.gameIdA,
    game_id_b: c.gameIdB,
    confidence: c.confidence,
    evidence: c.evidence,
    source: c.source,
  }));
}

// Splits rows into fixed-size batches for the RPC call, preserving order and
// never dropping or duplicating a row. batchSize <= 0 is treated as
// "everything in one batch" rather than looping forever.
export function chunkCandidateImportRows<T>(rows: readonly T[], batchSize: number): T[][] {
  if (rows.length === 0) return [];
  if (batchSize <= 0) return [[...rows]];
  const batches: T[][] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    batches.push(rows.slice(i, i + batchSize));
  }
  return batches;
}
