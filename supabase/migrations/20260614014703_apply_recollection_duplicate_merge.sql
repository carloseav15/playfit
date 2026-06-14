-- Merge the single strict duplicate unlocked by the edition-keyword boundary fix.
begin;

do $$
declare
  v_existing_approved int := 0;
  v_group_status text;
  v_eligible int := 0;
  v_approval record;
  v_result record;
begin
  select status
  into v_group_status
  from games_library.game_duplicate_groups
  where group_key = 'anothercoderecollection';

  if not found then
    raise notice 'Another Code: Recollection duplicate merge skipped: group not present in this dataset.';
    return;
  end if;

  if v_group_status = 'merged' then
    raise notice 'Another Code: Recollection duplicate merge skipped: group is already merged.';
    return;
  end if;

  if v_group_status <> 'needs_review' then
    raise exception 'Expected anothercoderecollection to be needs_review, found %', v_group_status;
  end if;

  select count(*)::int
  into v_existing_approved
  from games_library.game_duplicate_groups
  where status = 'approved';

  if v_existing_approved <> 0 then
    raise exception 'Expected 0 pre-existing approved duplicate groups, found %', v_existing_approved;
  end if;

  with strict_eligible as (
    select p.group_key
    from games_library.game_duplicate_review_plan p
    where p.group_key = 'anothercoderecollection'
    group by p.group_key
    having bool_and(p.group_status = 'needs_review')
       and bool_and(coalesce(p.group_user_ref_count, 0) = 0)
       and bool_and(not coalesce(p.group_has_edition_keyword, false))
       and bool_and(coalesce(p.known_year_count, 0) = 1)
       and count(*) = 2
       and count(*) filter (
         where p.proposed_action = 'keep'
           and p.recommended_action = 'keep'
           and p.game_id = p.recommended_winner_game_id
           and p.has_stable_catalog_id
       ) = 1
       and count(*) filter (
         where p.proposed_action = 'merge_into_winner'
           and p.recommended_action = 'merge_into_winner'
           and p.winner_game_id = p.recommended_winner_game_id
           and p.game_id ~ '^(rawg|steam|wiki)_'
       ) = 1
  )
  select count(*)::int
  into v_eligible
  from strict_eligible;

  if v_eligible <> 1 then
    raise exception 'Expected anothercoderecollection to be exactly one strict eligible group, found %', v_eligible;
  end if;

  select *
  into v_approval
  from games_library_private.approve_duplicate_group_full_merge(
    'anothercoderecollection',
    'another_code_recollection',
    'migration_20260614014703',
    'False positive collection keyword fixed; exact title duplicate with stable catalog winner.'
  );

  if v_approval.loser_count <> 1 then
    raise exception 'Unexpected approval result for anothercoderecollection: loser_count %', v_approval.loser_count;
  end if;

  select *
  into v_result
  from games_library_private.apply_approved_game_duplicate_merges(1);

  if v_result.groups_processed <> 1
     or v_result.games_retired <> 1
     or v_result.redirects_created <> 1 then
    raise exception 'Unexpected Another Code: Recollection merge result: groups %, retired %, redirects %',
      v_result.groups_processed,
      v_result.games_retired,
      v_result.redirects_created;
  end if;
end;
$$;

commit;

-- Down:
-- This merge is intentionally not auto-reversed. The merge executor stores
-- snapshots in games_library_private.game_duplicate_merge_items and redirects
-- in games_library.game_redirects for inspected rollback if needed.
