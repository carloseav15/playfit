-- Propose source-agnostic duplicate merge actions without moving catalog data.
-- This migration only fills review fields on the existing duplicate queue.
-- It deliberately avoids:
-- - groups with user references
-- - groups with multiple known release years
-- - groups containing remaster/HD/edition keywords
-- - hard deletes, redirects, or join rewrites
begin;

create schema if not exists games_library_private;

comment on schema games_library_private is
  'Private maintenance helpers for games_library. Not exposed through Supabase Data API.';

revoke all on schema games_library_private from public, anon, authenticated;
grant usage on schema games_library_private to service_role;

create or replace view games_library.game_duplicate_review_plan
with (security_invoker = true)
as
with user_refs as (
  select game_id, count(*)::int as ref_count
  from games_library.user_game_states
  group by game_id
  union all
  select key as game_id, count(*)::int as ref_count
  from games_library.profiles p
  cross join lateral jsonb_object_keys(p.game_states) as key
  group by key
),
refs as (
  select game_id, sum(ref_count)::int as ref_count
  from user_refs
  group by game_id
),
ranked as (
  select
    c.group_key,
    c.game_id,
    c.title,
    c.source_type,
    c.source_ref,
    c.release_year,
    c.has_edition_keyword,
    c.platform_count,
    c.tag_count,
    c.alias_count,
    c.has_cover,
    c.proposed_action,
    c.winner_game_id,
    g.candidate_count,
    g.known_year_count,
    g.source_type_count,
    g.has_edition_keyword as group_has_edition_keyword,
    g.suggested_review,
    g.status as group_status,
    coalesce(r.ref_count, 0) as user_ref_count,
    sum(coalesce(r.ref_count, 0)) over (partition by c.group_key) as group_user_ref_count,
    (c.game_id !~ '^(rawg|steam|wiki)_') as has_stable_catalog_id,
    row_number() over (
      partition by c.group_key
      order by
        coalesce(r.ref_count, 0) desc,
        (c.game_id !~ '^(rawg|steam|wiki)_') desc,
        (c.source_type = 'catalog') desc,
        (c.release_year <> 0) desc,
        c.platform_count desc,
        c.tag_count desc,
        c.alias_count desc,
        c.has_cover desc,
        c.game_id asc
    ) as candidate_rank
  from games_library.game_duplicate_candidates c
  join games_library.game_duplicate_groups g using (group_key)
  left join refs r on r.game_id = c.game_id
),
winners as (
  select
    group_key,
    game_id as recommended_winner_game_id,
    title as recommended_winner_title
  from ranked
  where candidate_rank = 1
)
select
  r.group_key,
  r.game_id,
  r.title,
  r.source_type,
  r.source_ref,
  r.release_year,
  r.has_edition_keyword,
  r.platform_count,
  r.tag_count,
  r.alias_count,
  r.has_cover,
  r.user_ref_count,
  r.group_user_ref_count,
  r.has_stable_catalog_id,
  r.candidate_rank,
  r.candidate_count,
  r.known_year_count,
  r.source_type_count,
  r.group_has_edition_keyword,
  r.suggested_review,
  r.group_status,
  r.proposed_action,
  r.winner_game_id,
  w.recommended_winner_game_id,
  w.recommended_winner_title,
  case
    when r.suggested_review <> 'merge_candidate' then 'manual_review'
    when r.group_status <> 'needs_review' then 'manual_review'
    when r.group_user_ref_count > 0 then 'manual_user_references'
    when r.group_has_edition_keyword then 'manual_edition_or_remaster'
    when r.known_year_count > 1 then 'manual_multiple_known_years'
    else 'auto_proposable_same_title_year'
  end as review_bucket,
  case
    when r.suggested_review = 'merge_candidate'
     and r.group_status = 'needs_review'
     and r.group_user_ref_count = 0
     and not r.group_has_edition_keyword
     and r.known_year_count <= 1
     and r.candidate_rank = 1
    then 'keep'
    when r.suggested_review = 'merge_candidate'
     and r.group_status = 'needs_review'
     and r.group_user_ref_count = 0
     and not r.group_has_edition_keyword
     and r.known_year_count <= 1
    then 'merge_into_winner'
    else 'needs_review'
  end as recommended_action
from ranked r
join winners w using (group_key);

comment on view games_library.game_duplicate_review_plan is
  'Read-only duplicate review plan. It proposes source-agnostic merges only for same normalized-title groups without user refs, multiple known years, or edition/remaster signals.';
comment on column games_library.game_duplicate_review_plan.review_bucket is
  'Why a row can be auto-proposed or why it must stay manual review.';
comment on column games_library.game_duplicate_review_plan.recommended_winner_game_id is
  'Recommended stable winner. Ranking prioritizes user references, stable non-source-prefixed IDs, catalog rows, known years, and metadata richness.';

revoke all on table games_library.game_duplicate_review_plan from public, anon, authenticated;
grant select on table games_library.game_duplicate_review_plan to service_role;

create or replace function games_library_private.propose_game_duplicate_actions()
returns table(groups_proposed int, keep_rows int, merge_rows int)
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_groups int := 0;
  v_keep int := 0;
  v_merge int := 0;
begin
  perform * from games_library_private.refresh_game_duplicate_candidates();

  with proposed as (
    update games_library.game_duplicate_candidates c
    set
      proposed_action = p.recommended_action,
      winner_game_id = case
        when p.recommended_action = 'merge_into_winner'
        then p.recommended_winner_game_id
        else null
      end,
      updated_at = now()
    from games_library.game_duplicate_review_plan p
    where p.group_key = c.group_key
      and p.game_id = c.game_id
      and p.review_bucket = 'auto_proposable_same_title_year'
      and p.recommended_action in ('keep', 'merge_into_winner')
      and c.proposed_action = 'needs_review'
      and c.winner_game_id is null
    returning c.group_key, c.proposed_action
  )
  select
    count(distinct group_key)::int,
    count(*) filter (where proposed_action = 'keep')::int,
    count(*) filter (where proposed_action = 'merge_into_winner')::int
  into v_groups, v_keep, v_merge
  from proposed;

  return query select v_groups, v_keep, v_merge;
end;
$$;

comment on function games_library_private.propose_game_duplicate_actions() is
  'Fills duplicate review proposed_action and winner_game_id for conservative same-title/year groups. It does not merge, delete, or redirect games.';

revoke all on function games_library_private.propose_game_duplicate_actions()
  from public, anon, authenticated;
grant execute on function games_library_private.propose_game_duplicate_actions()
  to service_role;

select * from games_library_private.propose_game_duplicate_actions();

commit;

-- Down:
-- begin;
-- update games_library.game_duplicate_candidates
-- set proposed_action = 'needs_review',
--     winner_game_id = null
-- where proposed_action in ('keep', 'merge_into_winner');
-- drop function if exists games_library_private.propose_game_duplicate_actions();
-- drop view if exists games_library.game_duplicate_review_plan;
-- commit;
