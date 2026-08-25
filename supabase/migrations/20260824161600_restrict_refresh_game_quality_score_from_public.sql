-- Postgres grants EXECUTE to PUBLIC by default on CREATE FUNCTION; the
-- migration that created games_library.refresh_game_quality_score()
-- (20260824151500) stated a service_role-only intent in its own comment but
-- omitted the explicit REVOKE, leaving PUBLIC (which includes anon/authenticated)
-- able to call it. Not a data-exposure issue (it only refreshes an
-- already-computed materialized view, no rows returned), but it doesn't
-- match the stated intent or the access-control pattern already used
-- elsewhere in this schema (e.g. confirmed_identity_equivalents' REVOKE ALL
-- ... FROM PUBLIC). Fixing the grant only; the function body itself is
-- unchanged.
--
-- Found and fixed during production deployment verification (confirmed via
-- aclexplode(proacl) showing a PUBLIC:EXECUTE entry immediately after
-- 20260824151500 applied); applied to production ahead of this file being
-- added locally, matching the established pattern for this migration set.
begin;

revoke execute on function games_library.refresh_game_quality_score() from public;

commit;
