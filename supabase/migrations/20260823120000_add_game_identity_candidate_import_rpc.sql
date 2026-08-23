-- Game Identity candidate import boundary.
--
-- Problem: scripts/generate-game-identity-candidates.ts --apply needs to
-- insert pending rows into games_library_private.game_identity_candidate
-- from CI (service_role), but games_library_private is deliberately NOT in
-- the Supabase Data API's exposed schemas (supabase/config.toml `schemas`),
-- matching production. supabase-js's `.schema('games_library_private')`
-- therefore fails with PGRST106 "Invalid schema: games_library_private" --
-- confirmed against both a fresh local reset and read-only against
-- production -- for ANY operation against that schema through PostgREST,
-- including calling a function that merely happens to live there: PostgREST
-- resolves the RPC path itself against the exposed-schema list, so an RPC
-- defined inside games_library_private is exactly as unreachable as a table
-- there would be. The fix is not to expose the schema -- it's a narrow
-- SECURITY DEFINER function living in games_library (already exposed,
-- already the established home for other service_role-only admin RPCs --
-- see get_cache/set_cache in 20260708000000_restrict_api_cache_access.sql
-- and upsert_profile/upsert_game_state in 20260707120000_baseline_schema.sql)
-- that reaches into games_library_private on the importer's behalf.
--
-- Scope of this migration -- ONLY:
--   - games_library.import_game_identity_candidates(jsonb)
--
-- This function does exactly one thing: INSERT new pending candidate rows,
-- skipping pairs that already exist. It cannot:
--   - overwrite status, confidence, evidence, reviewed_by, or reviewed_at on
--     an existing row (ON CONFLICT DO NOTHING -- an existing row, whatever
--     its status, is never touched, let alone re-read to decide anything);
--   - confirm or reject a candidate;
--   - create or modify a game_identity_group or game_identity_group_member;
--   - touch games_library.games or any scoring/recommendation path.
-- Row-level validation (confidence in high/medium/low, game_id_a < game_id_b,
-- no self-pairs, FK existence in games_library.games) is deliberately not
-- duplicated here -- it already lives in the CHECK/FK constraints on
-- games_library_private.game_identity_candidate itself (see
-- 20260822190000_create_game_identity_foundation.sql). A malformed batch
-- fails the whole INSERT (and the RPC call) with that constraint's error
-- rather than silently accepting bad rows.
--
-- Reversal: this migration creates one new, previously-nonexistent function
-- with no dependents. Rollback is a plain drop:
--   drop function if exists games_library.import_game_identity_candidates(jsonb);

begin;

CREATE OR REPLACE FUNCTION games_library.import_game_identity_candidates(p_candidates jsonb)
RETURNS integer
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_inserted integer;
begin
  if p_candidates is null or jsonb_typeof(p_candidates) <> 'array' then
    raise exception 'p_candidates must be a JSON array';
  end if;

  with incoming as (
    select
      rec ->> 'game_id_a' as game_id_a,
      rec ->> 'game_id_b' as game_id_b,
      rec ->> 'confidence' as confidence,
      coalesce(rec -> 'evidence', '{}'::jsonb) as evidence,
      coalesce(rec ->> 'source', 'heuristic') as source
    from jsonb_array_elements(p_candidates) as rec
  ),
  ins as (
    insert into games_library_private.game_identity_candidate
      (game_id_a, game_id_b, confidence, evidence, source, status)
    select game_id_a, game_id_b, confidence, evidence, source, 'pending'
    from incoming
    on conflict (game_id_a, game_id_b) do nothing
    returning 1
  )
  select count(*)::integer into v_inserted from ins;

  return v_inserted;
end;
$$;

COMMENT ON FUNCTION games_library.import_game_identity_candidates(jsonb) IS
    'Narrow import boundary for scripts/generate-game-identity-candidates.ts --apply, called via a games_library-scoped supabase-js client since games_library_private is not in the Data API exposed schemas. INSERT-only: on_conflict(game_id_a, game_id_b) do nothing, always status=pending, never reads or rewrites an existing row''s status/confidence/evidence/reviewed_by/reviewed_at. Does not confirm/reject candidates, create groups/memberships, or touch games_library.games. Row shape validation (confidence enum, pair ordering, no self-pairs, FK existence) is enforced by the constraints on games_library_private.game_identity_candidate itself, not duplicated here. Returns the count of newly inserted rows (existing pairs are silently skipped, not counted).';

-- Explicit deny-by-default, matching the confirm/reject functions in
-- games_library_private: both the named PUBLIC grant and Postgres's default
-- implicit PUBLIC EXECUTE grant on function creation need revoking, and
-- anon/authenticated get no grant at all -- this is an admin-only import
-- path, not something any client-side session should ever be able to call.
REVOKE ALL ON FUNCTION games_library.import_game_identity_candidates(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION games_library.import_game_identity_candidates(jsonb) TO service_role;

commit;
