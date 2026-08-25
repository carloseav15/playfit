-- Lifecycle fix for 20260824145027 (materialize games_library.game_quality_score):
-- that migration turned game_quality_score into a snapshot, byte-equivalent to
-- the original live view only until games_library.game_scores changes. This
-- migration adds the refresh mechanism; the actual catalog-import call sites
-- are wired up separately (shell scripts + scripts/lib/refresh-game-quality-score.mjs),
-- not here -- this migration only adds the single, reusable, SQL-level
-- refresh primitive those call sites invoke.
--
-- games_library.game_scores has exactly two kinds of writers (confirmed by
-- grepping the codebase for game_scores read/write sites):
--   1. The reviewed candidate-application pipeline: games_library_private
--      .apply_approved_external_enrichment() and
--      .apply_approved_metacritic_review_sentiment(), invoked from
--      scripts/import-external-catalog-data.sh and
--      scripts/import-metacritic-review-sentiment.sh (only when run with
--      --apply-auto-approved -- the only branch that writes scores).
--   2. Standalone Node scripts that upsert/insert games_library.game_scores
--      directly: scripts/apply-igdb-quality-check.mjs,
--      scripts/resolve-igdb-title-collisions.mjs, scripts/scrape-rawg.mjs,
--      scripts/apply-igdb-new-games.mjs. (scripts/backfill-thegamesdb.mjs
--      only reads game_scores -- confirmed, not a writer.)
--
-- This function is deliberately NOT called from inside
-- apply_approved_external_enrichment/apply_approved_metacritic_review_sentiment
-- themselves: those are large (350+ line), loop-based, already-validated
-- functions, and reproducing their bodies verbatim in a new migration just to
-- append one statement would be a much larger, riskier diff than calling this
-- once from the shell script that already wraps each of them -- same
-- lifecycle guarantee (one refresh per apply-run, immediately after the write
-- that could have changed scores), much smaller and safer change.
--
-- REFRESH MATERIALIZED VIEW CONCURRENTLY is used (not a plain REFRESH) so
-- concurrent reads of game_quality_score -- including score_today_recommendations
-- itself, mid-refresh -- are never blocked; this relies on the unique
-- game_id index already created by 20260824145027.
--
-- Explicitly unchanged: score_today_recommendations, its scoring weights,
-- predicates, ordering, eligibility, and output contract; the protected
-- migration 20260820155601; every catalog-import script's own write logic
-- (only a completion-point call is added, not touched here).
begin;

create or replace function games_library.refresh_game_quality_score()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
begin
  refresh materialized view concurrently games_library.game_quality_score;
end;
$$;

comment on function games_library.refresh_game_quality_score() is
  'Refreshes the game_quality_score materialized view (20260824145027) after '
  'games_library.game_scores changes. Called from the catalog-import '
  'completion points that write game_scores (see scripts/import-external-catalog-data.sh, '
  'scripts/import-metacritic-review-sentiment.sh, and '
  'scripts/lib/refresh-game-quality-score.mjs) -- never from request-time '
  'code, and never from score_today_recommendations itself. Raises on '
  'failure (no internal try/catch) so a failed refresh surfaces as a failed '
  'import step rather than silently leaving stale quality scores in place.';

-- service_role only, matching the invoking scripts' auth (SUPABASE_SERVICE_KEY)
-- and the access-control choice already made for game_quality_score itself in
-- 20260824145027 (no anon/authenticated grant).
grant execute on function games_library.refresh_game_quality_score() to service_role;

commit;
