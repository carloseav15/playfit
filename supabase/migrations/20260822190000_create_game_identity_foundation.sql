-- Game Identity v1 foundation: confirmed equivalence groups + candidate
-- review workflow, fully isolated from every existing table/function.
--
-- Scope of this migration -- ONLY:
--   - games_library_private.game_identity_group
--   - games_library_private.game_identity_group_member
--   - games_library_private.game_identity_candidate
--   - games_library_private.confirm_game_identity_candidate(bigint, text)
--   - games_library_private.reject_game_identity_candidate(bigint, text, text)
--   - games_library_private.game_identity_group_members(text)  -- read helper
--
-- Explicitly NOT in this migration (see Game Identity Design report):
--   - no ALTER TABLE on games_library.games (no canonical_game_id column)
--   - no change to games_library.score_today_recommendations
--   - no change to any existing RPC, index, or grant
--   - no collection_contains / dlc_of relation (out of v1 scope entirely)
--   - no auto-confirmation path: the only way a row reaches
--     game_identity_group_member is through confirm_game_identity_candidate(),
--     which requires an explicit, non-empty reviewer identity and a
--     candidate already in 'pending' status.
--
-- These tables live in games_library_private, documented as "Private
-- maintenance helpers for games_library. Not exposed through Supabase Data
-- API." -- the same place staging tables and other admin-only maintenance
-- data are documented to live. No RLS policies are created because these
-- tables are not reachable from the client at all; grants below are scoped
-- to service_role only, matching the existing convention for private-schema
-- tables (see staging_metacritic_games_*).
--
-- CORRECTION (found during real-Postgres validation, not present in the
-- original version of this migration): games_library_private is described
-- in supabase/migrations/20260707120000_baseline_schema.sql as already
-- existing, but a live-Postgres check (both a fresh local `supabase
-- migration up` and a read-only check against production) showed the
-- schema does not actually exist in either -- none of the
-- games_library_private.* functions that baseline_schema.sql documents
-- (apply_approved_game_duplicate_merges, refresh_game_duplicate_candidates,
-- etc.) exist live either. The baseline migration file does not reflect
-- what was actually ever applied to a real database, for reasons outside
-- this migration's scope (see product/docs/MIGRATIONS_SQUASH_GUIDE.md).
-- This migration must not silently depend on that assumption, so it now
-- creates the schema itself, defensively (IF NOT EXISTS -- safe to run
-- even in an environment where some future migration did legitimately
-- create it first).
--
-- Reversal: this migration only creates new, previously-nonexistent
-- objects with no data dependencies from any other table (nothing here is
-- referenced by any existing function, view, or FK). Rollback is a plain
-- drop in reverse dependency order:
--   drop function if exists games_library_private.game_identity_group_members(text);
--   drop function if exists games_library_private.reject_game_identity_candidate(bigint, text, text);
--   drop function if exists games_library_private.confirm_game_identity_candidate(bigint, text);
--   drop table if exists games_library_private.game_identity_candidate;
--   drop table if exists games_library_private.game_identity_group_member;
--   drop table if exists games_library_private.game_identity_group;
--   -- games_library_private schema itself is deliberately NOT dropped by
--   -- this rollback: it is shared, general-purpose namespace (per its own
--   -- documented intent), other work may come to depend on it existing,
--   -- and an empty schema is inert -- dropping it is a strictly bigger,
--   -- riskier action than anything else this rollback does.

begin;

-- Defensive: see CORRECTION note above. Real-Postgres validation found
-- this schema does not actually exist yet in either local or production,
-- despite being documented as already existing.
CREATE SCHEMA IF NOT EXISTS games_library_private;
COMMENT ON SCHEMA games_library_private IS
    'Private maintenance helpers for games_library. Not exposed through Supabase Data API.';

-- =========================================================================
-- Confirmed: game_identity_group / game_identity_group_member
-- =========================================================================
-- All members of a group represent the same experience for recommendation-
-- exclusion purposes (edition_of, remaster_of, and same-release regional
-- retitles -- see the rubric in the design report). Deliberately NOT a
-- directed edge table: edition_of is an equivalence relation (symmetric,
-- transitive), and a group models that directly -- "who else is equivalent
-- to X" is two indexed lookups, never a recursive traversal.

CREATE TABLE games_library_private.game_identity_group (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by text NOT NULL,
    note text,
    CONSTRAINT game_identity_group_created_by_not_blank CHECK (btrim(created_by) <> ''::text)
);

COMMENT ON TABLE games_library_private.game_identity_group IS
    'Confirmed equivalence class: every game_id listed in game_identity_group_member for a given group_id represents the same experience for Play Next exclusion purposes. Written to only by confirm_game_identity_candidate() -- never by candidate generation.';
COMMENT ON COLUMN games_library_private.game_identity_group.created_by IS
    'Reviewer identity (or a named system process) that first created this group. Not a foreign key -- reviewer identity is not a user account in this schema.';

CREATE TABLE games_library_private.game_identity_group_member (
    game_id text NOT NULL,
    group_id bigint NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    added_by text NOT NULL,
    CONSTRAINT game_identity_group_member_pkey PRIMARY KEY (game_id),
    CONSTRAINT game_identity_group_member_group_id_fkey FOREIGN KEY (group_id)
        REFERENCES games_library_private.game_identity_group(id) ON DELETE CASCADE,
    CONSTRAINT game_identity_group_member_game_id_fkey FOREIGN KEY (game_id)
        REFERENCES games_library.games(game_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT game_identity_group_member_added_by_not_blank CHECK (btrim(added_by) <> ''::text)
);

COMMENT ON TABLE games_library_private.game_identity_group_member IS
    'Membership rows for game_identity_group. game_id is the primary key (not a composite key) precisely to enforce "a game_id belongs to at most one group" at the schema level, not just by convention.';
COMMENT ON CONSTRAINT game_identity_group_member_game_id_fkey ON games_library_private.game_identity_group_member IS
    'ON DELETE RESTRICT: a catalog row cannot be deleted while it is still part of a confirmed identity group -- forces an explicit decision (remove the membership first) rather than silently orphaning the group.';

CREATE INDEX game_identity_group_member_group_id_idx
    ON games_library_private.game_identity_group_member (group_id);

-- =========================================================================
-- Candidate / review: game_identity_candidate
-- =========================================================================
-- Fully separate from the confirmed tables above. Never read by anything
-- outside the review workflow itself -- in particular, never read by Play
-- Next, which only ever reads game_identity_group_member (in a future,
-- explicitly separate phase -- not part of this migration).

CREATE TABLE games_library_private.game_identity_candidate (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    game_id_a text NOT NULL,
    game_id_b text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    confidence text NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    source text DEFAULT 'heuristic'::text NOT NULL,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT game_identity_candidate_game_id_a_fkey FOREIGN KEY (game_id_a)
        REFERENCES games_library.games(game_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT game_identity_candidate_game_id_b_fkey FOREIGN KEY (game_id_b)
        REFERENCES games_library.games(game_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT game_identity_candidate_no_self_pair CHECK (game_id_a <> game_id_b),
    -- Enforces pair normalization at the schema level (not just in the
    -- generation script): an attempt to insert the pair in reversed order
    -- fails this check rather than silently creating a second row for the
    -- same comparison. Combined with the UNIQUE constraint below, A-B and
    -- B-A can never coexist as different rows.
    CONSTRAINT game_identity_candidate_pair_ordered CHECK (game_id_a < game_id_b),
    CONSTRAINT game_identity_candidate_status_check
        CHECK (status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])),
    CONSTRAINT game_identity_candidate_confidence_check
        CHECK (confidence = ANY (ARRAY['high'::text, 'medium'::text, 'low'::text])),
    CONSTRAINT game_identity_candidate_pair_key UNIQUE (game_id_a, game_id_b)
);

COMMENT ON TABLE games_library_private.game_identity_candidate IS
    'Heuristic-generated review queue for the edition_of equivalence relation. A row here is never itself a confirmed relationship -- see confirm_game_identity_candidate(). A rejected row is kept (status=rejected), never deleted, so repeated catalog imports do not re-surface the same false positive.';
COMMENT ON COLUMN games_library_private.game_identity_candidate.confidence IS
    'Heuristic priority signal for reviewers only -- never a substitute for review. Derived from title similarity, exact-match-after-suffix-stripping, series_id agreement (boost only, never penalized on mismatch), and release-year ordering. genre_id is deliberately never used: ~68% disagreement rate on confirmed real edition/base pairs would make it actively misleading.';
COMMENT ON COLUMN games_library_private.game_identity_candidate.evidence IS
    'Structured evidence shown to a reviewer (matched keyword, stripped title, similarity score, series/year comparison) -- see GameIdentityCandidateEvidence in packages/core/src/domain/game-identity-candidates.ts for the exact shape.';

CREATE INDEX game_identity_candidate_status_idx
    ON games_library_private.game_identity_candidate (status);

-- =========================================================================
-- Workflow functions
-- =========================================================================

CREATE OR REPLACE FUNCTION games_library_private.confirm_game_identity_candidate(
    p_candidate_id bigint,
    p_reviewed_by text
) RETURNS games_library_private.game_identity_group
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_candidate games_library_private.game_identity_candidate;
  v_group_a bigint;
  v_group_b bigint;
  v_survivor_id bigint;
  v_loser_id bigint;
  v_result games_library_private.game_identity_group;
begin
  if p_reviewed_by is null or btrim(p_reviewed_by) = '' then
    raise exception 'p_reviewed_by is required';
  end if;

  select * into v_candidate
  from games_library_private.game_identity_candidate
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'game_identity_candidate % not found', p_candidate_id;
  end if;

  if v_candidate.status <> 'pending' then
    raise exception 'candidate % is not pending (status=%)', p_candidate_id, v_candidate.status;
  end if;

  -- Lock any existing membership rows for both sides before branching, so a
  -- concurrent confirm touching an overlapping game_id can't interleave.
  -- Two independent, non-overlapping confirms proceed concurrently as
  -- normal; the game_id_a=<pkey> PRIMARY KEY on game_identity_group_member
  -- is the hard backstop against overlap: worst case under a genuine race
  -- is a unique_violation on one of the two INSERTs, not silent corruption.
  select group_id into v_group_a
  from games_library_private.game_identity_group_member
  where game_id = v_candidate.game_id_a
  for update;

  select group_id into v_group_b
  from games_library_private.game_identity_group_member
  where game_id = v_candidate.game_id_b
  for update;

  if v_group_a is null and v_group_b is null then
    -- Case 1: neither game belongs to a group -- create one with both.
    insert into games_library_private.game_identity_group (created_by)
    values (p_reviewed_by)
    returning id into v_survivor_id;

    insert into games_library_private.game_identity_group_member (game_id, group_id, added_by)
    values
      (v_candidate.game_id_a, v_survivor_id, p_reviewed_by),
      (v_candidate.game_id_b, v_survivor_id, p_reviewed_by);

  elsif v_group_a is not null and v_group_b is null then
    -- Case 2: A is already grouped, B joins A's group.
    v_survivor_id := v_group_a;
    insert into games_library_private.game_identity_group_member (game_id, group_id, added_by)
    values (v_candidate.game_id_b, v_survivor_id, p_reviewed_by);

  elsif v_group_a is null and v_group_b is not null then
    -- Case 2, mirrored: B is already grouped, A joins B's group.
    v_survivor_id := v_group_b;
    insert into games_library_private.game_identity_group_member (game_id, group_id, added_by)
    values (v_candidate.game_id_a, v_survivor_id, p_reviewed_by);

  elsif v_group_a = v_group_b then
    -- Case 3: both already in the same group -- idempotent, nothing to merge.
    v_survivor_id := v_group_a;

  else
    -- Case 4: both exist in two different groups -- merge atomically.
    -- Deterministic survivor rule: the lower group id wins (== the older
    -- group, since id is an identity column allocated in creation order).
    if v_group_a < v_group_b then
      v_survivor_id := v_group_a;
      v_loser_id := v_group_b;
    else
      v_survivor_id := v_group_b;
      v_loser_id := v_group_a;
    end if;

    update games_library_private.game_identity_group_member
    set group_id = v_survivor_id, added_by = p_reviewed_by, added_at = now()
    where group_id = v_loser_id;

    delete from games_library_private.game_identity_group
    where id = v_loser_id;
  end if;

  update games_library_private.game_identity_candidate
  set status = 'accepted',
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      updated_at = now()
  where id = p_candidate_id;

  select * into v_result
  from games_library_private.game_identity_group
  where id = v_survivor_id;

  return v_result;
end;
$$;

COMMENT ON FUNCTION games_library_private.confirm_game_identity_candidate(bigint, text) IS
    'Explicit human confirmation only -- no caller path accepts a candidate without a non-empty p_reviewed_by. Runs as a single transaction (implicit in the function call), so a merge (two pre-existing groups combined) never leaves an intermediate state where a game_id points at a deleted group. See packages/core/src/domain/game-identity-confirmation.ts confirmCandidate() for the identical, unit-tested branching logic this function is a literal transliteration of.';

CREATE OR REPLACE FUNCTION games_library_private.reject_game_identity_candidate(
    p_candidate_id bigint,
    p_reviewed_by text,
    p_note text DEFAULT NULL
) RETURNS games_library_private.game_identity_candidate
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_row games_library_private.game_identity_candidate;
begin
  if p_reviewed_by is null or btrim(p_reviewed_by) = '' then
    raise exception 'p_reviewed_by is required';
  end if;

  select * into v_row
  from games_library_private.game_identity_candidate
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'game_identity_candidate % not found', p_candidate_id;
  end if;

  if v_row.status <> 'pending' then
    raise exception 'candidate % is not pending (status=%)', p_candidate_id, v_row.status;
  end if;

  update games_library_private.game_identity_candidate
  set status = 'rejected',
      reviewed_by = p_reviewed_by,
      reviewed_at = now(),
      evidence = evidence || jsonb_build_object('review_note', p_note),
      updated_at = now()
  where id = p_candidate_id
  returning * into v_row;

  return v_row;
end;
$$;

COMMENT ON FUNCTION games_library_private.reject_game_identity_candidate(bigint, text, text) IS
    'Rejection keeps the row (status=rejected) so a future catalog import never re-surfaces the same false positive as a new pending candidate. Never touches game_identity_group or game_identity_group_member.';

CREATE OR REPLACE FUNCTION games_library_private.game_identity_group_members(p_game_id text)
RETURNS TABLE(game_id text)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  select m2.game_id
  from games_library_private.game_identity_group_member m1
  join games_library_private.game_identity_group_member m2 on m2.group_id = m1.group_id
  where m1.game_id = p_game_id;
$$;

COMMENT ON FUNCTION games_library_private.game_identity_group_members(text) IS
    'Read helper: every game_id equivalent to p_game_id (including itself), via two indexed lookups -- no recursion. Returns zero rows if p_game_id has no confirmed group. NOT called from any API/RPC path in this migration -- provided for testing and for the future, separately-scoped Play Next integration phase.';

-- =========================================================================
-- Grants -- service_role only. games_library_private is already documented
-- as not exposed through the Supabase Data API; these grants are defense
-- in depth, matching the existing convention for every other function and
-- table in this schema (see staging_metacritic_games_archived_20260704,
-- apply_approved_game_duplicate_merges, etc.).
-- =========================================================================

-- USAGE on the schema itself is required for any of the grants below to
-- have effect -- see CORRECTION note above (this can no longer be assumed
-- to already exist from baseline_schema.sql).
GRANT USAGE ON SCHEMA games_library_private TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE games_library_private.game_identity_group TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE games_library_private.game_identity_group_member TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE games_library_private.game_identity_candidate TO service_role;
GRANT SELECT, USAGE ON SEQUENCE games_library_private.game_identity_group_id_seq TO service_role;
GRANT SELECT, USAGE ON SEQUENCE games_library_private.game_identity_candidate_id_seq TO service_role;

REVOKE ALL ON FUNCTION games_library_private.confirm_game_identity_candidate(bigint, text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.confirm_game_identity_candidate(bigint, text) TO service_role;

REVOKE ALL ON FUNCTION games_library_private.reject_game_identity_candidate(bigint, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.reject_game_identity_candidate(bigint, text, text) TO service_role;

REVOKE ALL ON FUNCTION games_library_private.game_identity_group_members(text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.game_identity_group_members(text) TO service_role;

commit;
