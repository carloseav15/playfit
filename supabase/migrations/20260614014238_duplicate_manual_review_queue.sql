-- Manual duplicate-review queue and approval helper.
-- Non-destructive: this does not merge or delete games.
begin;

create schema if not exists games_library_private;

comment on schema games_library_private is
  'Private maintenance helpers for games_library. Not exposed through Supabase Data API.';

revoke all on schema games_library_private from public, anon, authenticated;
grant usage on schema games_library_private to service_role;

create or replace view games_library.game_duplicate_manual_review_queue
with (security_invoker = true)
as
with group_rows as (
  select
    p.group_key,
    max(p.candidate_count)::int as candidate_count,
    max(p.known_year_count)::int as known_year_count,
    max(p.source_type_count)::int as source_type_count,
    bool_or(p.group_has_edition_keyword) as group_has_edition_keyword,
    max(p.group_user_ref_count)::int as group_user_ref_count,
    max(p.suggested_review) as suggested_review,
    max(p.review_bucket) as review_bucket,
    max(p.recommended_winner_game_id) as recommended_winner_game_id,
    max(p.recommended_winner_title) as recommended_winner_title,
    count(*) filter (where p.recommended_action = 'keep')::int as recommended_keep_rows,
    count(*) filter (where p.recommended_action = 'merge_into_winner')::int as recommended_merge_rows,
    count(*) filter (
      where p.proposed_action = p.recommended_action
        and p.recommended_action in ('keep', 'merge_into_winner')
    )::int as prefilled_action_rows,
    bool_or(
      p.recommended_action = 'keep'
      and p.game_id ~ '^(rawg|steam|wiki)_'
    ) as recommended_winner_is_source_prefixed,
    bool_or(
      p.recommended_action = 'merge_into_winner'
      and p.game_id !~ '^(rawg|steam|wiki)_'
    ) as has_stable_loser,
    coalesce(
      array_agg(distinct nullif(p.release_year, 0) order by nullif(p.release_year, 0))
        filter (where nullif(p.release_year, 0) is not null),
      '{}'::int[]
    ) as release_years,
    array_agg(distinct p.source_type order by p.source_type) as source_types,
    array_agg(p.game_id order by p.candidate_rank, p.game_id) as candidate_game_ids,
    jsonb_agg(
      jsonb_build_object(
        'game_id', p.game_id,
        'title', p.title,
        'source_type', p.source_type,
        'source_ref', p.source_ref,
        'release_year', p.release_year,
        'platform_count', p.platform_count,
        'tag_count', p.tag_count,
        'alias_count', p.alias_count,
        'has_cover', p.has_cover,
        'has_edition_keyword', p.has_edition_keyword,
        'has_stable_catalog_id', p.has_stable_catalog_id,
        'candidate_rank', p.candidate_rank,
        'proposed_action', p.proposed_action,
        'recommended_action', p.recommended_action,
        'winner_game_id', p.winner_game_id
      )
      order by p.candidate_rank, p.game_id
    ) as candidates
  from games_library.game_duplicate_review_plan p
  where p.group_status = 'needs_review'
  group by p.group_key
)
select
  group_key,
  case
    when group_user_ref_count > 0 then 'manual_user_references'
    when group_has_edition_keyword or suggested_review = 'preserve_edition_review' then 'preserve_edition_review'
    when known_year_count > 1 or suggested_review = 'manual_year_review' then 'manual_year_review'
    when has_stable_loser then 'review_stable_id_collision'
    when candidate_count > 2 then 'review_multi_candidate_merge'
    when recommended_winner_is_source_prefixed then 'choose_canonical_id'
    when review_bucket = 'auto_proposable_same_title_year' then 'approve_merge_candidate'
    else 'manual_review'
  end as review_lane,
  case
    when group_user_ref_count > 0 then 10
    when group_has_edition_keyword or suggested_review = 'preserve_edition_review' then 20
    when known_year_count > 1 or suggested_review = 'manual_year_review' then 30
    when has_stable_loser then 40
    when candidate_count > 2 then 50
    when recommended_winner_is_source_prefixed then 60
    when review_bucket = 'auto_proposable_same_title_year' then 70
    else 90
  end as review_priority,
  case
    when group_user_ref_count > 0 then 'Review user references before approval; the merge executor can move state, but the identity decision affects saved users.'
    when group_has_edition_keyword or suggested_review = 'preserve_edition_review' then 'Preserve by default. Only approve a merge if the rows are proven source duplicates of the same playable edition.'
    when known_year_count > 1 or suggested_review = 'manual_year_review' then 'Different known release years. Compare title, edition, platforms, and source notes before merging.'
    when has_stable_loser then 'At least one merge candidate has a stable-looking catalog ID. Confirm the winner before approving.'
    when candidate_count > 2 then 'More than two rows. Pick exactly one winner and confirm every other row is the same playable entry.'
    when recommended_winner_is_source_prefixed then 'Recommended winner is source-prefixed. Decide whether to accept that ID or create a stable catalog ID before approving.'
    when review_bucket = 'auto_proposable_same_title_year' then 'Ready for human approval; same normalized title/year with no edition or user-reference blockers.'
    else 'Manual review required.'
  end as review_instruction,
  candidate_count,
  known_year_count,
  source_type_count,
  group_has_edition_keyword,
  group_user_ref_count,
  suggested_review,
  review_bucket,
  recommended_winner_game_id,
  recommended_winner_title,
  recommended_keep_rows,
  recommended_merge_rows,
  prefilled_action_rows,
  recommended_winner_is_source_prefixed,
  has_stable_loser,
  release_years,
  source_types,
  candidate_game_ids,
  candidates
from group_rows;

comment on view games_library.game_duplicate_manual_review_queue is
  'One row per remaining duplicate group, with review lane, priority, instructions, and candidate evidence. Non-destructive.';
comment on column games_library.game_duplicate_manual_review_queue.review_lane is
  'Actionable reason this duplicate group still needs human review.';
comment on column games_library.game_duplicate_manual_review_queue.review_priority is
  'Lower numbers should be reviewed first because the decision has higher risk.';
comment on column games_library.game_duplicate_manual_review_queue.candidates is
  'Candidate evidence as compact JSON for reviewer tooling or CSV export.';

revoke all on table games_library.game_duplicate_manual_review_queue from public, anon, authenticated;
grant select on table games_library.game_duplicate_manual_review_queue to service_role;

create or replace function games_library_private.approve_duplicate_group_full_merge(
  p_group_key text,
  p_winner_game_id text,
  p_reviewed_by text default 'manual_review',
  p_review_notes text default ''
) returns table(
  group_key text,
  winner_game_id text,
  loser_count int
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate_count int := 0;
  v_loser_count int := 0;
  v_status text;
  v_reviewed_by text := coalesce(nullif(btrim(p_reviewed_by), ''), 'manual_review');
  v_note text := 'Approved full duplicate group merge to winner ' || p_winner_game_id;
begin
  if p_group_key is null or btrim(p_group_key) = '' then
    raise exception 'p_group_key is required';
  end if;

  if p_winner_game_id is null or btrim(p_winner_game_id) = '' then
    raise exception 'p_winner_game_id is required';
  end if;

  if btrim(coalesce(p_review_notes, '')) <> '' then
    v_note := v_note || ': ' || btrim(p_review_notes);
  end if;

  select g.status, g.candidate_count
  into v_status, v_candidate_count
  from games_library.game_duplicate_groups g
  where g.group_key = p_group_key
  for update;

  if not found then
    raise exception 'Duplicate group % does not exist', p_group_key;
  end if;

  if v_status <> 'needs_review' then
    raise exception 'Expected duplicate group % to be needs_review, found %', p_group_key, v_status;
  end if;

  if not exists (
    select 1
    from games_library.game_duplicate_candidates c
    where c.group_key = p_group_key
      and c.game_id = p_winner_game_id
  ) then
    raise exception 'Winner % is not a candidate in group %', p_winner_game_id, p_group_key;
  end if;

  select count(*)::int
  into v_loser_count
  from games_library.game_duplicate_candidates c
  where c.group_key = p_group_key
    and c.game_id <> p_winner_game_id;

  if v_candidate_count < 2 or v_loser_count < 1 then
    raise exception 'Duplicate group % does not have enough candidates to merge', p_group_key;
  end if;

  update games_library.game_duplicate_candidates c
  set
    proposed_action = case
      when c.game_id = p_winner_game_id then 'keep'
      else 'merge_into_winner'
    end,
    winner_game_id = case
      when c.game_id = p_winner_game_id then null
      else p_winner_game_id
    end,
    review_notes = case
      when btrim(c.review_notes) = '' then v_note
      else c.review_notes || E'\n' || v_note
    end,
    updated_at = now()
  where c.group_key = p_group_key;

  update games_library.game_duplicate_groups g
  set
    status = 'approved',
    reviewed_by = v_reviewed_by,
    reviewed_at = now(),
    review_notes = case
      when btrim(g.review_notes) = '' then v_note
      else g.review_notes || E'\n' || v_note
    end,
    updated_at = now()
  where g.group_key = p_group_key;

  return query select p_group_key, p_winner_game_id, v_loser_count;
end;
$$;

comment on function games_library_private.approve_duplicate_group_full_merge(text, text, text, text) is
  'Marks a reviewed duplicate group as approved for a full merge into one winner. It does not execute the merge; run apply_approved_game_duplicate_merges after review.';

revoke all on function games_library_private.approve_duplicate_group_full_merge(text, text, text, text)
  from public, anon, authenticated;
grant execute on function games_library_private.approve_duplicate_group_full_merge(text, text, text, text)
  to service_role;

commit;

-- Down:
-- begin;
-- drop function if exists games_library_private.approve_duplicate_group_full_merge(text, text, text, text);
-- drop view if exists games_library.game_duplicate_manual_review_queue;
-- commit;
