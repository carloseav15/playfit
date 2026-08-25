-- Game Identity -> Play Next exclusion boundary.
--
-- Problem: Play Next (apps/web/src/app/api/recommendations/shared.ts,
-- buildPlayNextModel) needs to know, for a batch of game_ids the user
-- already has a decision/state about, which OTHER game_ids are confirmed
-- equivalent editions -- so those editions can also be excluded from new
-- "next up" recommendations (e.g. user completed The Witcher 3: Complete
-- Edition -> the base edition and GOTY edition should not be suggested as
-- a new recommendation). games_library_private.game_identity_group_members
-- already answers this for one game_id at a time (see
-- 20260822190000_create_game_identity_foundation.sql, which explicitly
-- left it unwired -- "provided for testing and for the future,
-- separately-scoped Play Next integration phase"). This is that phase.
--
-- Two reasons a new function is added here rather than just granting
-- EXECUTE on the existing one:
--   1. games_library_private is deliberately not in the Supabase Data
--      API's exposed schemas (supabase/config.toml `schemas`) -- exactly
--      as documented in 20260823120000_add_game_identity_candidate_import_rpc.sql,
--      an RPC defined inside games_library_private is unreachable through
--      PostgREST regardless of grants. The fix is the same narrow
--      SECURITY DEFINER bridge pattern used there, living in the already-
--      exposed games_library schema.
--   2. A Play Next request may have several known game_ids (any status
--      the user has recorded, onboarding anchors, etc). Looking each one
--      up individually would mean one PostgREST round trip per game_id.
--      This function accepts the whole batch as a text[] and resolves it
--      in one indexed self-join, so the API layer makes exactly one call
--      per Play Next request regardless of how many known ids there are.
--
-- Scope of this migration -- ONLY:
--   - games_library.confirmed_identity_equivalents(text[])
--
-- This function is read-only (a plain SQL SELECT, STABLE, no writes) and
-- only ever reads games_library_private.game_identity_group_member -- the
-- confirmed-membership table. It never reads game_identity_candidate
-- (pending/rejected rows are never visible through this path), and it does
-- not touch games_library.games, score_today_recommendations, or any
-- scoring/taste table. It cannot be used to write, confirm, or reject
-- anything.
--
-- Reversal: this migration creates one new, previously-nonexistent
-- function with no dependents. Rollback is a plain drop:
--   drop function if exists games_library.confirmed_identity_equivalents(text[]);

begin;

CREATE OR REPLACE FUNCTION games_library.confirmed_identity_equivalents(p_game_ids text[])
RETURNS TABLE(source_game_id text, equivalent_game_id text)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  select m1.game_id as source_game_id, m2.game_id as equivalent_game_id
  from games_library_private.game_identity_group_member m1
  join games_library_private.game_identity_group_member m2 on m2.group_id = m1.group_id
  where p_game_ids is not null
    and m1.game_id = any(p_game_ids);
$$;

COMMENT ON FUNCTION games_library.confirmed_identity_equivalents(text[]) IS
    'Batch equivalence lookup for Play Next candidate exclusion. For every game_id in p_game_ids that belongs to a confirmed Game Identity group, returns one row per (source_game_id, equivalent_game_id) pair -- equivalent_game_id includes source_game_id itself, matching games_library_private.game_identity_group_members. game_ids with no confirmed group produce no rows. Reads only game_identity_group_member (never game_identity_candidate), so only confirmed relationships are ever returned. One indexed self-join over a small confirmed-membership table (group_id and game_id are both indexed; game_id is the table''s primary key) -- no join against games_library.games, no recursion (game_id belongs to at most one group by construction). Called from apps/web/src/app/api/recommendations before score_today_recommendations; does not itself call or alter that function.';

-- Same exposure as score_today_recommendations (20260707120000_baseline_schema.sql):
-- both anon and authenticated call this directly via a games_library-scoped
-- supabase-js client (apps/web/src/lib/supabase/server.ts createAnonClient),
-- matching every other read-only scoring/state RPC on that path.
REVOKE ALL ON FUNCTION games_library.confirmed_identity_equivalents(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION games_library.confirmed_identity_equivalents(text[]) TO anon;
GRANT EXECUTE ON FUNCTION games_library.confirmed_identity_equivalents(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION games_library.confirmed_identity_equivalents(text[]) TO service_role;

commit;
