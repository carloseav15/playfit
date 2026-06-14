-- Apply the first small reviewed duplicate merge batch.
-- Scope: 10 explicit, high-confidence same-title/year groups with stable winners.
begin;

do $$
declare
  v_existing_approved int := 0;
  v_groups_present int := 0;
  v_groups_already_merged int := 0;
  v_plan_rows int := 0;
  v_keep_rows int := 0;
  v_merge_rows int := 0;
  v_result record;
begin
  with chosen(group_key) as (
    values
      ('alanwake'),
      ('animalcrossingnewhorizons'),
      ('animalwell'),
      ('arco'),
      ('armoredcorevifiresofrubicon'),
      ('artofrally'),
      ('assassinscreedmirage'),
      ('astrobot'),
      ('baldursgateiii'),
      ('batmanarkhamcity')
  )
  select
    count(*)::int,
    count(*) filter (where g.status = 'merged')::int
  into v_groups_present, v_groups_already_merged
  from games_library.game_duplicate_groups g
  join chosen c using (group_key);

  if v_groups_present = 0 then
    raise notice 'First duplicate merge batch skipped: chosen groups are absent in this dataset.';
    return;
  end if;

  if v_groups_already_merged = 10 then
    raise notice 'First duplicate merge batch skipped: chosen groups are already merged.';
    return;
  end if;

  if v_groups_present <> 10 then
    raise exception 'Expected 10 chosen duplicate groups, found %', v_groups_present;
  end if;

  select count(*)::int
  into v_existing_approved
  from games_library.game_duplicate_groups
  where status = 'approved';

  if v_existing_approved <> 0 then
    raise exception 'Expected 0 pre-existing approved duplicate groups, found %', v_existing_approved;
  end if;

  with chosen(group_key) as (
    values
      ('alanwake'),
      ('animalcrossingnewhorizons'),
      ('animalwell'),
      ('arco'),
      ('armoredcorevifiresofrubicon'),
      ('artofrally'),
      ('assassinscreedmirage'),
      ('astrobot'),
      ('baldursgateiii'),
      ('batmanarkhamcity')
  )
  select
    count(*)::int,
    count(*) filter (where p.recommended_action = 'keep')::int,
    count(*) filter (where p.recommended_action = 'merge_into_winner')::int
  into v_plan_rows, v_keep_rows, v_merge_rows
  from games_library.game_duplicate_review_plan p
  join chosen c using (group_key)
  where p.review_bucket = 'auto_proposable_same_title_year'
    and p.group_status = 'needs_review'
    and p.suggested_review = 'merge_candidate'
    and p.known_year_count = 1
    and not p.group_has_edition_keyword
    and p.group_user_ref_count = 0
    and p.proposed_action = p.recommended_action;

  if v_plan_rows <> 20 or v_keep_rows <> 10 or v_merge_rows <> 10 then
    raise exception 'Unexpected first merge batch shape: rows %, keep %, merge %',
      v_plan_rows, v_keep_rows, v_merge_rows;
  end if;

  with chosen(group_key) as (
    values
      ('alanwake'),
      ('animalcrossingnewhorizons'),
      ('animalwell'),
      ('arco'),
      ('armoredcorevifiresofrubicon'),
      ('artofrally'),
      ('assassinscreedmirage'),
      ('astrobot'),
      ('baldursgateiii'),
      ('batmanarkhamcity')
  )
  update games_library.game_duplicate_groups g
  set
    status = 'approved',
    reviewed_by = 'migration_20260614001329',
    reviewed_at = now(),
    review_notes = case
      when btrim(g.review_notes) = '' then 'Approved first conservative duplicate merge batch.'
      else g.review_notes || E'\nApproved first conservative duplicate merge batch.'
    end,
    updated_at = now()
  from chosen c
  where g.group_key = c.group_key;

  select *
  into v_result
  from games_library_private.apply_approved_game_duplicate_merges(10);

  if v_result.groups_processed <> 10
     or v_result.games_retired <> 10
     or v_result.redirects_created <> 10 then
    raise exception 'Unexpected first merge result: groups %, retired %, redirects %',
      v_result.groups_processed,
      v_result.games_retired,
      v_result.redirects_created;
  end if;
end;
$$;

commit;

-- Down:
-- This batch is intentionally not auto-reversed. The merge executor stores
-- snapshots in games_library_private.game_duplicate_merge_items and redirects
-- in games_library.game_redirects for inspected rollback if needed.
