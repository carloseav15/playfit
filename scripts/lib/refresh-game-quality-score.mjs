// Shared completion-point call for every script that writes to
// games_library.game_scores. game_quality_score (20260824145027) is a
// materialized view for query performance; it only stays byte-equivalent to
// what the original live view would have exposed if it's refreshed after
// game_scores changes. Call this once, after a script's score writes are
// done -- not per batch/row, and never from request-time code.
//
// Throws on failure rather than swallowing it, so a caller's own top-level
// `main().catch(...)` reports the run as failed (matching the other error
// paths already in these scripts) instead of silently leaving stale quality
// scores in place after an apparently-successful import.
export async function refreshGameQualityScore(supabase) {
  const { error } = await supabase.rpc("refresh_game_quality_score");
  if (error) {
    throw new Error(`Failed to refresh game_quality_score: ${error.message}`);
  }
}
