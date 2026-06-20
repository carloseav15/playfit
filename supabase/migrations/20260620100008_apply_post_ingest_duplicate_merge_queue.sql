-- Apply the post-ingest duplicate queue conservatively.
-- Executes reviewed auto-merge rows first, canonicalizes clean Playfit-owned
-- winners where the queue kept both a clean and dated ID, then auto-merges only
-- strict manual-review rows with a clean winner and identical known-year title.
begin;

create table if not exists games_library_private.post_ingest_duplicate_processing_runs (
  run_id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  clear_merge_groups int not null default 0,
  clear_merge_retirees int not null default 0,
  canonical_clean_groups int not null default 0,
  canonical_clean_retirees int not null default 0,
  manual_safe_groups int not null default 0,
  manual_safe_retirees int not null default 0,
  groups_approved int not null default 0,
  merge_pairs int not null default 0,
  redirects_retargeted int not null default 0,
  redirect_self_edges_deleted int not null default 0,
  audit_winner_refs_retargeted int not null default 0,
  groups_merged int not null default 0,
  games_retired int not null default 0,
  redirects_created int not null default 0,
  title_aliases_deleted int not null default 0,
  alias_cache_synced int not null default 0,
  tag_cache_synced int not null default 0,
  remaining_manual_groups int not null default 0,
  remaining_manual_rows int not null default 0,
  notes text not null default ''
);

alter table games_library_private.post_ingest_duplicate_processing_runs enable row level security;

drop policy if exists service_role_manage_post_ingest_duplicate_processing_runs
  on games_library_private.post_ingest_duplicate_processing_runs;
create policy service_role_manage_post_ingest_duplicate_processing_runs
  on games_library_private.post_ingest_duplicate_processing_runs
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library_private.post_ingest_duplicate_processing_runs
  from public, anon, authenticated;
grant select, insert, update, delete
  on table games_library_private.post_ingest_duplicate_processing_runs
  to service_role;

do $$
declare
  v_run_id uuid;
  v_existing_status text;
  v_existing_approved int := 0;
  v_clear_groups int := 0;
  v_clear_retirees int := 0;
  v_canonical_groups int := 0;
  v_canonical_retirees int := 0;
  v_manual_safe_groups int := 0;
  v_manual_safe_retirees int := 0;
  v_groups_approved int := 0;
  v_merge_pairs int := 0;
  v_redirects_retargeted int := 0;
  v_self_edges_deleted int := 0;
  v_audit_winner_refs_retargeted int := 0;
  v_remaining_loser_redirects int := 0;
  v_title_aliases_deleted int := 0;
  v_alias_cache_synced int := 0;
  v_tag_cache_synced int := 0;
  v_remaining_manual_groups int := 0;
  v_remaining_manual_rows int := 0;
  v_result record;
begin
  select status
  into v_existing_status
  from games_library_private.post_ingest_duplicate_processing_runs
  where run_key = '20260620_apply_post_ingest_duplicate_merge_queue';

  if v_existing_status = 'completed' then
    raise notice 'Post-ingest duplicate processing already completed; skipping.';
    return;
  elsif v_existing_status is not null then
    raise exception 'Previous post-ingest duplicate processing run is %, refusing to continue', v_existing_status;
  end if;

  insert into games_library_private.post_ingest_duplicate_processing_runs (run_key, notes)
  values (
    '20260620_apply_post_ingest_duplicate_merge_queue',
    'Apply safe merge_into_winner rows, canonicalize clean Playfit-owned winners, and triage remaining manual-review duplicates.'
  )
  returning run_id into v_run_id;

  select count(*)::int
  into v_existing_approved
  from games_library.game_duplicate_groups
  where status = 'approved';

  if v_existing_approved <> 0 then
    raise exception 'Expected 0 pre-existing approved duplicate groups, found %', v_existing_approved;
  end if;

  create temp table clear_merge_groups on commit drop as
  with group_shape as (
    select
      c.group_key,
      count(*) filter (where c.proposed_action = 'keep') as keep_rows,
      count(*) filter (where c.proposed_action = 'merge_into_winner') as merge_rows,
      count(*) filter (where c.proposed_action = 'needs_review') as needs_review_rows,
      count(distinct c.winner_game_id) filter (where c.proposed_action = 'merge_into_winner') as winner_count,
      max(coalesce(p.group_user_ref_count, 0)) as group_user_ref_count
    from games_library.game_duplicate_candidates c
    join games_library.game_duplicate_groups g using (group_key)
    left join games_library.game_duplicate_review_plan p
      on p.group_key = c.group_key
     and p.game_id = c.game_id
    where g.status = 'needs_review'
    group by c.group_key
  )
  select group_key
  from group_shape
  where keep_rows = 1
    and merge_rows > 0
    and needs_review_rows = 0
    and winner_count = 1;

  select
    count(*)::int,
    coalesce(sum((
      select count(*)
      from games_library.game_duplicate_candidates c
      where c.group_key = g.group_key
        and c.proposed_action = 'merge_into_winner'
    )), 0)::int
  into v_clear_groups, v_clear_retirees
  from clear_merge_groups g;

  if v_clear_groups <> 602 or v_clear_retirees <> 613 then
    raise exception 'Unexpected clear merge scope: groups %, retirees %', v_clear_groups, v_clear_retirees;
  end if;

  create temp table canonical_clean_groups on commit drop as
  with group_shape as (
    select
      c.group_key,
      max(c.game_id) filter (
        where c.game_id = games_library_private.slugify_game_id_unaccent(c.title)
          and c.proposed_action = 'keep'
      ) as clean_winner_game_id,
      count(*) filter (where c.proposed_action = 'keep') as keep_rows,
      count(*) filter (where c.proposed_action = 'merge_into_winner') as merge_rows,
      count(*) filter (where c.proposed_action = 'needs_review') as needs_review_rows,
      count(distinct nullif(c.release_year, 0)) as known_year_count,
      count(distinct lower(regexp_replace(regexp_replace(c.title, '[™®©]', '', 'g'), '[^a-zA-Z0-9]+', '', 'g'))) as strict_title_key_count,
      bool_or(coalesce(c.has_edition_keyword, false)) as has_edition_keyword,
      max(coalesce(p.group_user_ref_count, 0)) as group_user_ref_count
    from games_library.game_duplicate_candidates c
    join games_library.game_duplicate_groups g using (group_key)
    left join games_library.game_duplicate_review_plan p
      on p.group_key = c.group_key
     and p.game_id = c.game_id
    where g.status = 'needs_review'
    group by c.group_key
  )
  select group_key, clean_winner_game_id
  from group_shape
  where keep_rows = 2
    and merge_rows = 1
    and needs_review_rows = 0
    and known_year_count = 1
    and strict_title_key_count = 1
    and not has_edition_keyword
    and group_user_ref_count = 0
    and clean_winner_game_id is not null;

  select
    count(*)::int,
    coalesce(sum((
      select count(*)
      from games_library.game_duplicate_candidates c
      join canonical_clean_groups cg on cg.group_key = c.group_key
      where c.group_key = g.group_key
        and c.game_id <> cg.clean_winner_game_id
    )), 0)::int
  into v_canonical_groups, v_canonical_retirees
  from canonical_clean_groups g;

  if v_canonical_groups <> 21 or v_canonical_retirees <> 42 then
    raise exception 'Unexpected canonical clean scope: groups %, retirees %', v_canonical_groups, v_canonical_retirees;
  end if;

  create temp table manual_safe_groups on commit drop as
  with group_shape as (
    select
      c.group_key,
      max(c.game_id) filter (
        where c.game_id = games_library_private.slugify_game_id_unaccent(c.title)
      ) as clean_winner_game_id,
      count(*) as candidate_rows,
      count(*) filter (where c.proposed_action = 'needs_review') as needs_review_rows,
      count(distinct nullif(c.release_year, 0)) as known_year_count,
      count(distinct lower(regexp_replace(regexp_replace(c.title, '[™®©]', '', 'g'), '[^a-zA-Z0-9]+', '', 'g'))) as strict_title_key_count,
      max(coalesce(p.group_user_ref_count, 0)) as group_user_ref_count
    from games_library.game_duplicate_candidates c
    join games_library.game_duplicate_groups g using (group_key)
    left join games_library.game_duplicate_review_plan p
      on p.group_key = c.group_key
     and p.game_id = c.game_id
    where g.status = 'needs_review'
    group by c.group_key
  )
  select group_key, clean_winner_game_id
  from group_shape
  where candidate_rows = needs_review_rows
    and candidate_rows >= 2
    and known_year_count = 1
    and strict_title_key_count = 1
    and group_user_ref_count = 0
    and clean_winner_game_id is not null;

  select
    count(*)::int,
    coalesce(sum((
      select count(*)
      from games_library.game_duplicate_candidates c
      join manual_safe_groups mg on mg.group_key = c.group_key
      where c.group_key = g.group_key
        and c.game_id <> mg.clean_winner_game_id
    )), 0)::int
  into v_manual_safe_groups, v_manual_safe_retirees
  from manual_safe_groups g;

  if v_manual_safe_groups <> 33 or v_manual_safe_retirees <> 42 then
    raise exception 'Unexpected manual-safe scope: groups %, retirees %', v_manual_safe_groups, v_manual_safe_retirees;
  end if;

  update games_library.game_duplicate_candidates c
  set
    proposed_action = case
      when c.game_id = cg.clean_winner_game_id then 'keep'
      else 'merge_into_winner'
    end,
    winner_game_id = case
      when c.game_id = cg.clean_winner_game_id then null
      else cg.clean_winner_game_id
    end,
    review_notes = case
      when btrim(coalesce(c.review_notes, '')) = '' then 'Canonicalized post-ingest duplicate group to clean Playfit-owned winner ' || cg.clean_winner_game_id
      else c.review_notes || E'\nCanonicalized post-ingest duplicate group to clean Playfit-owned winner ' || cg.clean_winner_game_id
    end,
    updated_at = now()
  from canonical_clean_groups cg
  where c.group_key = cg.group_key;

  update games_library.game_duplicate_candidates c
  set
    proposed_action = case
      when c.game_id = mg.clean_winner_game_id then 'keep'
      else 'merge_into_winner'
    end,
    winner_game_id = case
      when c.game_id = mg.clean_winner_game_id then null
      else mg.clean_winner_game_id
    end,
    review_notes = case
      when btrim(coalesce(c.review_notes, '')) = '' then 'Auto-approved strict manual-review duplicate to clean Playfit-owned winner ' || mg.clean_winner_game_id
      else c.review_notes || E'\nAuto-approved strict manual-review duplicate to clean Playfit-owned winner ' || mg.clean_winner_game_id
    end,
    updated_at = now()
  from manual_safe_groups mg
  where c.group_key = mg.group_key;

  create temp table groups_to_approve on commit drop as
  select group_key, 'clear_merge'::text as approval_lane from clear_merge_groups
  union all
  select group_key, 'canonical_clean'::text from canonical_clean_groups
  union all
  select group_key, 'manual_safe_strict'::text from manual_safe_groups;

  select count(*)::int
  into v_groups_approved
  from groups_to_approve;

  if v_groups_approved <> 656 then
    raise exception 'Expected to approve 656 groups, found %', v_groups_approved;
  end if;

  update games_library.game_duplicate_groups g
  set
    status = 'approved',
    reviewed_by = 'migration_20260620100008',
    reviewed_at = now(),
    review_notes = case
      when btrim(coalesce(g.review_notes, '')) = '' then 'Approved post-ingest duplicate processing lane: ' || a.approval_lane
      else g.review_notes || E'\nApproved post-ingest duplicate processing lane: ' || a.approval_lane
    end,
    updated_at = now()
  from groups_to_approve a
  where g.group_key = a.group_key;

  create temp table merge_pairs on commit drop as
  select
    c.group_key,
    c.game_id as loser_game_id,
    c.winner_game_id
  from games_library.game_duplicate_candidates c
  join groups_to_approve a on a.group_key = c.group_key
  where c.proposed_action = 'merge_into_winner';

  select count(*)::int
  into v_merge_pairs
  from merge_pairs;

  if v_merge_pairs <> 697 then
    raise exception 'Expected 697 merge pairs, found %', v_merge_pairs;
  end if;

  delete from games_library.game_redirects r
  using merge_pairs p
  where r.to_game_id = p.loser_game_id
    and r.from_game_id = p.winner_game_id;
  get diagnostics v_self_edges_deleted = row_count;

  update games_library.game_redirects r
  set
    to_game_id = p.winner_game_id,
    notes = case
      when btrim(coalesce(r.notes, '')) = '' then 'Redirect retargeted before post-ingest duplicate merge from ' || p.loser_game_id
      else r.notes || E'\nRedirect retargeted before post-ingest duplicate merge from ' || p.loser_game_id
    end,
    updated_at = now()
  from merge_pairs p
  where r.to_game_id = p.loser_game_id
    and r.from_game_id <> p.winner_game_id;
  get diagnostics v_redirects_retargeted = row_count;

  select count(*)::int
  into v_remaining_loser_redirects
  from games_library.game_redirects r
  join merge_pairs p on p.loser_game_id = r.to_game_id;

  if v_remaining_loser_redirects <> 0 then
    raise exception 'Expected 0 redirects pointing at loser games before merge, found %', v_remaining_loser_redirects;
  end if;

  update games_library_private.game_duplicate_merge_items i
  set winner_game_id = p.winner_game_id
  from merge_pairs p
  where i.winner_game_id = p.loser_game_id;
  get diagnostics v_audit_winner_refs_retargeted = row_count;

  select *
  into v_result
  from games_library_private.apply_approved_game_duplicate_merges(656);

  if v_result.groups_processed <> 656
     or v_result.games_retired <> 697
     or v_result.redirects_created <> 697 then
    raise exception 'Unexpected post-ingest merge result: groups %, retired %, redirects %',
      v_result.groups_processed,
      v_result.games_retired,
      v_result.redirects_created;
  end if;

  delete from games_library.game_aliases a
  using games_library.games g
  where g.game_id = a.game_id
    and a.alias = g.title;
  get diagnostics v_title_aliases_deleted = row_count;

  with desired_aliases as (
    select
      g.game_id,
      coalesce(
        array_agg(distinct a.alias order by a.alias)
          filter (where a.alias is not null and btrim(a.alias) <> '' and a.alias <> g.title),
        '{}'::text[]
      ) as aliases
    from games_library.games g
    left join games_library.game_aliases a on a.game_id = g.game_id
    group by g.game_id
  ),
  synced as (
    update games_library.games g
    set
      aliases = d.aliases,
      updated_at = now()
    from desired_aliases d
    where d.game_id = g.game_id
      and coalesce((select array_agg(x order by x) from unnest(g.aliases) x), '{}'::text[]) <> d.aliases
    returning 1
  )
  select count(*)::int
  into v_alias_cache_synced
  from synced;

  with desired_tags as (
    select
      g.game_id,
      coalesce(
        array_agg(distinct t.name order by t.name)
          filter (where t.name is not null and btrim(t.name) <> ''),
        '{}'::text[]
      ) as tags
    from games_library.games g
    left join games_library.game_tags gt on gt.game_id = g.game_id
    left join games_library.tags t on t.id = gt.tag_id
    group by g.game_id
  ),
  synced as (
    update games_library.games g
    set
      tags = d.tags,
      updated_at = now()
    from desired_tags d
    where d.game_id = g.game_id
      and coalesce((select array_agg(x order by x) from unnest(g.tags) x), '{}'::text[]) <> d.tags
    returning 1
  )
  select count(*)::int
  into v_tag_cache_synced
  from synced;

  create temp table remaining_manual_triage on commit drop as
  with group_profile as (
    select
      p.group_key,
      count(*) as candidate_rows,
      count(distinct nullif(p.release_year, 0)) as known_year_count,
      bool_or(p.group_has_edition_keyword) as has_edition_keyword,
      max(p.group_user_ref_count) as group_user_ref_count
    from games_library.game_duplicate_review_plan p
    join games_library.game_duplicate_groups g on g.group_key = p.group_key
    where g.status = 'needs_review'
    group by p.group_key
  )
  select
    group_key,
    candidate_rows,
    case
      when group_user_ref_count > 0 then 'manual_user_refs'
      when has_edition_keyword then 'manual_edition_or_remaster'
      when candidate_rows > 2 then 'manual_large_collision'
      when known_year_count > 1 then 'manual_different_known_years'
      else 'manual_other'
    end as triage_bucket
  from group_profile;

  select
    count(*)::int,
    coalesce(sum(candidate_rows), 0)::int
  into v_remaining_manual_groups, v_remaining_manual_rows
  from remaining_manual_triage;

  update games_library.game_duplicate_groups g
  set
    review_notes = case
      when position('Post-ingest manual triage:' in coalesce(g.review_notes, '')) > 0 then g.review_notes
      when btrim(coalesce(g.review_notes, '')) = '' then 'Post-ingest manual triage: ' || t.triage_bucket || '; retained needs_review for human decision.'
      else g.review_notes || E'\nPost-ingest manual triage: ' || t.triage_bucket || '; retained needs_review for human decision.'
    end,
    updated_at = now()
  from remaining_manual_triage t
  where g.group_key = t.group_key;

  update games_library_private.post_ingest_duplicate_processing_runs
  set
    completed_at = now(),
    status = 'completed',
    clear_merge_groups = v_clear_groups,
    clear_merge_retirees = v_clear_retirees,
    canonical_clean_groups = v_canonical_groups,
    canonical_clean_retirees = v_canonical_retirees,
    manual_safe_groups = v_manual_safe_groups,
    manual_safe_retirees = v_manual_safe_retirees,
    groups_approved = v_groups_approved,
    merge_pairs = v_merge_pairs,
    redirects_retargeted = v_redirects_retargeted,
    redirect_self_edges_deleted = v_self_edges_deleted,
    audit_winner_refs_retargeted = v_audit_winner_refs_retargeted,
    groups_merged = v_result.groups_processed,
    games_retired = v_result.games_retired,
    redirects_created = v_result.redirects_created,
    title_aliases_deleted = v_title_aliases_deleted,
    alias_cache_synced = v_alias_cache_synced,
    tag_cache_synced = v_tag_cache_synced,
    remaining_manual_groups = v_remaining_manual_groups,
    remaining_manual_rows = v_remaining_manual_rows
  where run_id = v_run_id;
end;
$$;

create or replace view games_library.duplicate_manual_review_triage
with (security_invoker = true)
as
with group_profile as (
  select
    p.group_key,
    count(*) as candidate_rows,
    count(distinct nullif(p.release_year, 0)) as known_year_count,
    min(nullif(p.release_year, 0)) as min_known_year,
    max(nullif(p.release_year, 0)) as max_known_year,
    bool_or(p.group_has_edition_keyword) as has_edition_keyword,
    max(p.group_user_ref_count) as group_user_ref_count,
    max(p.candidate_count) as candidate_count,
    jsonb_agg(
      jsonb_build_object(
        'game_id', p.game_id,
        'title', p.title,
        'release_year', p.release_year,
        'source_type', p.source_type,
        'source_ref', p.source_ref,
        'platform_count', p.platform_count,
        'tag_count', p.tag_count,
        'alias_count', p.alias_count,
        'has_cover', p.has_cover
      )
      order by p.release_year nulls last, p.title, p.game_id
    ) as candidates
  from games_library.game_duplicate_review_plan p
  join games_library.game_duplicate_groups g on g.group_key = p.group_key
  where g.status = 'needs_review'
  group by p.group_key
)
select
  group_key,
  candidate_rows,
  candidate_count,
  known_year_count,
  min_known_year,
  max_known_year,
  has_edition_keyword,
  group_user_ref_count,
  case
    when group_user_ref_count > 0 then 'manual_user_refs'
    when has_edition_keyword then 'manual_edition_or_remaster'
    when candidate_rows > 2 then 'manual_large_collision'
    when known_year_count > 1 then 'manual_different_known_years'
    else 'manual_other'
  end as triage_bucket,
  case
    when group_user_ref_count > 0 then 'Review user state before merging or preserving.'
    when has_edition_keyword then 'Check whether entries are editions/remasters/remakes that should remain playable separately.'
    when candidate_rows > 2 then 'Resolve canonical identity one candidate at a time; avoid group-wide merge.'
    when known_year_count > 1 then 'Different known years can be ports, reboots, sequels, or data errors; verify source metadata first.'
    else 'Manual source check required.'
  end as triage_instruction,
  candidates
from group_profile;

comment on view games_library.duplicate_manual_review_triage is
  'Remaining duplicate groups after conservative post-ingest merge processing, bucketed for manual review.';

revoke all on table games_library.duplicate_manual_review_triage
  from public, anon, authenticated;
grant select on table games_library.duplicate_manual_review_triage
  to service_role;

commit;

-- Down:
-- Intentionally not auto-reversed. The merge executor stores game snapshots in
-- games_library_private.game_duplicate_merge_items and creates game_redirects
-- for every retired loser ID. Use those audit tables for inspected rollback.
