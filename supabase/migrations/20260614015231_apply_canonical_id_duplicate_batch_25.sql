-- Canonicalize and merge the first 25 source-prefixed duplicate groups.
-- Each group has two source-prefixed candidates, no edition/year/user blockers,
-- and a non-conflicting source-agnostic ID derived from the title.
begin;

do $$
declare
  v_existing_approved int := 0;
  v_eligible_groups int := 0;
  v_blockers int := 0;
  v_result record;
  duplicate_row record;
begin
  select count(*)::int
  into v_existing_approved
  from games_library.game_duplicate_groups
  where status = 'approved';

  if v_existing_approved <> 0 then
    raise exception 'Expected 0 pre-existing approved duplicate groups, found %', v_existing_approved;
  end if;

  with chosen as (
    select
      q.group_key,
      q.recommended_winner_game_id,
      games_library_private.slugify_game_id(q.recommended_winner_title) as proposed_canonical_id
    from games_library.game_duplicate_manual_review_queue q
    where q.review_lane = 'choose_canonical_id'
    order by q.group_key
    limit 25
  )
  select count(*)::int
  into v_eligible_groups
  from chosen;

  if v_eligible_groups = 0 then
    raise notice 'Canonical ID duplicate batch skipped: no eligible groups in this dataset.';
    return;
  end if;

  if v_eligible_groups <> 25 then
    raise exception 'Expected 25 canonical ID duplicate groups, found %', v_eligible_groups;
  end if;

  with chosen as (
    select
      q.group_key,
      q.recommended_winner_game_id,
      games_library_private.slugify_game_id(q.recommended_winner_title) as proposed_canonical_id
    from games_library.game_duplicate_manual_review_queue q
    where q.review_lane = 'choose_canonical_id'
    order by q.group_key
    limit 25
  ),
  blockers as (
    select 1
    from chosen c
    where c.proposed_canonical_id is null
       or exists (
         select 1
         from games_library.games g
         where g.game_id = c.proposed_canonical_id
       )
       or exists (
         select 1
         from games_library.game_redirects r
         where r.from_game_id = c.proposed_canonical_id
            or r.to_game_id = c.recommended_winner_game_id
       )
  )
  select count(*)::int
  into v_blockers
  from blockers;

  if v_blockers <> 0 then
    raise exception 'Canonical ID duplicate batch has % blocking conflicts', v_blockers;
  end if;

  for duplicate_row in
    select
      q.group_key,
      q.recommended_winner_game_id,
      games_library_private.slugify_game_id(q.recommended_winner_title) as proposed_canonical_id
    from games_library.game_duplicate_manual_review_queue q
    where q.review_lane = 'choose_canonical_id'
    order by q.group_key
    limit 25
  loop
    perform 1
    from games_library_private.canonicalize_duplicate_group_winner(
      duplicate_row.group_key,
      duplicate_row.recommended_winner_game_id,
      duplicate_row.proposed_canonical_id,
      'migration_20260614015231',
      'Canonical source-agnostic ID selected for source-prefixed duplicate group.'
    );

    perform 1
    from games_library_private.approve_duplicate_group_full_merge(
      duplicate_row.group_key,
      duplicate_row.proposed_canonical_id,
      'migration_20260614015231',
      'Approved after source-agnostic canonical ID selection.'
    );
  end loop;

  select *
  into v_result
  from games_library_private.apply_approved_game_duplicate_merges(25);

  if v_result.groups_processed <> 25
     or v_result.games_retired <> 25
     or v_result.redirects_created <> 25 then
    raise exception 'Unexpected canonical ID merge result: groups %, retired %, redirects %',
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
