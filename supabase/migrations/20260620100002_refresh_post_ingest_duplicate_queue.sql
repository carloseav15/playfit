-- Refresh duplicate review queue after post-cleanup RAWG ingestion.
-- Keeps the process non-destructive: no games are merged or deleted here.
begin;

create table if not exists games_library_private.duplicate_queue_refresh_runs (
  run_id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  groups_upserted int not null default 0,
  candidates_upserted int not null default 0,
  groups_reactivated int not null default 0,
  stale_candidates_deleted int not null default 0,
  stale_groups_ignored int not null default 0,
  groups_proposed int not null default 0,
  keep_rows int not null default 0,
  merge_rows int not null default 0,
  active_live_group_misses int not null default 0,
  notes text not null default ''
);

alter table games_library_private.duplicate_queue_refresh_runs enable row level security;

drop policy if exists service_role_manage_duplicate_queue_refresh_runs
  on games_library_private.duplicate_queue_refresh_runs;
create policy service_role_manage_duplicate_queue_refresh_runs
  on games_library_private.duplicate_queue_refresh_runs
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library_private.duplicate_queue_refresh_runs
  from public, anon, authenticated;
grant select, insert, update, delete on table games_library_private.duplicate_queue_refresh_runs
  to service_role;

create or replace view games_library.game_duplicate_candidate_source
with (security_invoker = true)
as
with norm as (
  select
    g.game_id,
    g.title,
    g.source_type,
    g.source_ref,
    coalesce(g.release_year, 0) as release_year,
    regexp_replace(lower(g.title), '[^a-z0-9]+', '', 'g') as group_key,
    (
      lower(g.title) ~ '(^|[^a-z0-9])(remaster|remastered|remake|definitive|collection|trilogy|anniversary|special|deluxe|complete|enhanced|goty)([^a-z0-9]|$)'
      or lower(g.title) ~ '(^|[^a-z0-9])(director.?s cut|final cut|game of the year)([^a-z0-9]|$)'
      or lower(g.title) ~ '(^|[^a-z0-9])hd([^a-z0-9]|$)'
    ) as has_edition_keyword,
    coalesce(pc.platform_count, 0) as platform_count,
    coalesce(tc.tag_count, 0) as tag_count,
    coalesce(ac.alias_count, 0) + cardinality(g.aliases) as alias_count,
    coalesce(g.cover_url, '') <> '' as has_cover
  from games_library.games g
  left join (
    select game_id, count(*)::int as platform_count
    from games_library.game_platforms
    group by game_id
  ) pc using (game_id)
  left join (
    select game_id, count(*)::int as tag_count
    from games_library.game_tags
    group by game_id
  ) tc using (game_id)
  left join (
    select game_id, count(*)::int as alias_count
    from games_library.game_aliases
    group by game_id
  ) ac using (game_id)
),
groups as (
  select
    group_key,
    count(*)::int as candidate_count,
    count(distinct nullif(release_year, 0))::int as known_year_count,
    count(distinct source_type)::int as source_type_count,
    bool_or(has_edition_keyword) as group_has_edition_keyword
  from norm
  group by group_key
  having count(*) > 1
)
select
  n.group_key,
  n.game_id,
  n.title,
  n.source_type,
  n.source_ref,
  n.release_year,
  n.has_edition_keyword,
  n.platform_count,
  n.tag_count,
  n.alias_count,
  n.has_cover,
  g.candidate_count,
  g.known_year_count,
  g.source_type_count,
  g.group_has_edition_keyword as has_group_edition_keyword,
  case
    when g.group_has_edition_keyword then 'preserve_edition_review'
    when g.known_year_count > 1 then 'manual_year_review'
    else 'merge_candidate'
  end as suggested_review
from norm n
join groups g using (group_key);

comment on view games_library.game_duplicate_candidate_source is
  'Live source query for duplicate review candidates. Uses normalized title keys and maps null release_year to unknown sentinel 0; review required before merge/delete.';

revoke all on table games_library.game_duplicate_candidate_source
  from public, anon, authenticated;
grant select on table games_library.game_duplicate_candidate_source
  to service_role;

do $$
declare
  v_run_id uuid;
  v_existing_status text;
  v_groups_upserted int := 0;
  v_candidates_upserted int := 0;
  v_groups_reactivated int := 0;
  v_stale_candidates_deleted int := 0;
  v_stale_groups_ignored int := 0;
  v_groups_proposed int := 0;
  v_keep_rows int := 0;
  v_merge_rows int := 0;
  v_active_live_group_misses int := 0;
  v_approved_groups int := 0;
begin
  select status
  into v_existing_status
  from games_library_private.duplicate_queue_refresh_runs
  where run_key = '20260620_refresh_post_ingest_duplicate_queue';

  if v_existing_status = 'completed' then
    raise notice 'Post-ingest duplicate queue refresh already completed; skipping.';
    return;
  elsif v_existing_status is not null then
    raise exception 'Previous post-ingest duplicate queue refresh run is %, refusing to continue', v_existing_status;
  end if;

  select count(*)::int
  into v_approved_groups
  from games_library.game_duplicate_groups
  where status = 'approved';

  if v_approved_groups <> 0 then
    raise exception 'Refusing duplicate queue refresh with % approved groups pending execution', v_approved_groups;
  end if;

  insert into games_library_private.duplicate_queue_refresh_runs (run_key, notes)
  values (
    '20260620_refresh_post_ingest_duplicate_queue',
    'Refresh duplicate review queue after post-cleanup RAWG ingestion; no automatic merges.'
  )
  returning run_id into v_run_id;

  select groups_upserted, candidates_upserted
  into v_groups_upserted, v_candidates_upserted
  from games_library_private.refresh_game_duplicate_candidates();

  create temp table duplicate_refresh_live_groups on commit drop as
  select distinct group_key
  from games_library.game_duplicate_candidate_source;

  create temp table duplicate_refresh_reactivated_groups (
    group_key text primary key
  ) on commit drop;

  with reactivated as (
    update games_library.game_duplicate_groups g
    set
      status = 'needs_review',
      reviewed_by = null,
      reviewed_at = null,
      review_notes = case
        when btrim(coalesce(g.review_notes, '')) = '' then 'Reactivated by post-ingest duplicate queue refresh because the normalized title is duplicated again.'
        else g.review_notes || E'\nReactivated by post-ingest duplicate queue refresh because the normalized title is duplicated again.'
      end,
      updated_at = now()
    from duplicate_refresh_live_groups live
    where g.group_key = live.group_key
      and g.status in ('reviewed', 'merged', 'rejected', 'ignored')
    returning g.group_key
  )
  insert into duplicate_refresh_reactivated_groups (group_key)
  select group_key
  from reactivated;

  select count(*)::int
  into v_groups_reactivated
  from duplicate_refresh_reactivated_groups;

  update games_library.game_duplicate_candidates c
  set
    proposed_action = 'needs_review',
    winner_game_id = null,
    review_notes = case
      when btrim(coalesce(c.review_notes, '')) = '' then 'Reset after post-ingest duplicate group reactivation.'
      else c.review_notes || E'\nReset after post-ingest duplicate group reactivation.'
    end,
    updated_at = now()
  where exists (
    select 1
    from duplicate_refresh_reactivated_groups r
    where r.group_key = c.group_key
  );

  delete from games_library.game_duplicate_candidates c
  using games_library.game_duplicate_groups g
  where g.group_key = c.group_key
    and g.status <> 'approved'
    and not exists (
      select 1
      from games_library.game_duplicate_candidate_source s
      where s.group_key = c.group_key
        and s.game_id = c.game_id
    );
  get diagnostics v_stale_candidates_deleted = row_count;

  update games_library.game_duplicate_groups g
  set
    status = 'ignored',
    reviewed_by = 'migration_20260620100002',
    reviewed_at = now(),
    review_notes = case
      when btrim(coalesce(g.review_notes, '')) = '' then 'Ignored by post-ingest refresh because this group is no longer duplicated in the live catalog.'
      else g.review_notes || E'\nIgnored by post-ingest refresh because this group is no longer duplicated in the live catalog.'
    end,
    updated_at = now()
  where g.status = 'needs_review'
    and not exists (
      select 1
      from duplicate_refresh_live_groups live
      where live.group_key = g.group_key
    );
  get diagnostics v_stale_groups_ignored = row_count;

  select groups_proposed, keep_rows, merge_rows
  into v_groups_proposed, v_keep_rows, v_merge_rows
  from games_library_private.propose_game_duplicate_actions();

  with live_groups as (
    select distinct group_key
    from games_library.game_duplicate_candidate_source
  )
  select count(*)::int
  into v_active_live_group_misses
  from live_groups live
  left join games_library.game_duplicate_groups g
    on g.group_key = live.group_key
   and g.status = 'needs_review'
  where g.group_key is null;

  if v_active_live_group_misses <> 0 then
    raise exception 'Duplicate queue refresh left % live duplicate groups outside active needs_review queue', v_active_live_group_misses;
  end if;

  update games_library_private.duplicate_queue_refresh_runs
  set
    completed_at = now(),
    status = 'completed',
    groups_upserted = v_groups_upserted,
    candidates_upserted = v_candidates_upserted,
    groups_reactivated = v_groups_reactivated,
    stale_candidates_deleted = v_stale_candidates_deleted,
    stale_groups_ignored = v_stale_groups_ignored,
    groups_proposed = v_groups_proposed,
    keep_rows = v_keep_rows,
    merge_rows = v_merge_rows,
    active_live_group_misses = v_active_live_group_misses
  where run_id = v_run_id;
end;
$$;

commit;

-- Down:
-- Intentionally not auto-reversed. This refresh only updates non-catalog review
-- metadata and does not merge, delete, or redirect games.
