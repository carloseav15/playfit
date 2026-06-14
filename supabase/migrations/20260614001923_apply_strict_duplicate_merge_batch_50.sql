-- Apply a second, larger duplicate merge batch with stricter eligibility.
-- Scope: 50 groups, each with exactly one stable winner and one source-prefixed loser.
begin;

do $$
declare
  v_existing_approved int := 0;
  v_eligible_groups int := 0;
  v_result record;
begin
  select count(*)::int
  into v_existing_approved
  from games_library.game_duplicate_groups
  where status = 'approved';

  if v_existing_approved <> 0 then
    raise exception 'Expected 0 pre-existing approved duplicate groups, found %', v_existing_approved;
  end if;

  with safe_groups as (
    select
      p.group_key,
      count(*) filter (where p.recommended_action = 'keep') as keep_rows,
      count(*) filter (where p.recommended_action = 'merge_into_winner') as merge_rows,
      count(*) as plan_rows,
      bool_and(p.review_bucket = 'auto_proposable_same_title_year') as all_auto,
      bool_or(
        p.recommended_action = 'keep'
        and p.game_id !~ '^(rawg|steam|wiki)_'
      ) as stable_winner,
      bool_and(
        p.recommended_action <> 'merge_into_winner'
        or p.game_id ~ '^(rawg|steam|wiki)_'
      ) as only_source_losers
    from games_library.game_duplicate_review_plan p
    where p.group_status = 'needs_review'
      and p.proposed_action = p.recommended_action
      and p.group_user_ref_count = 0
      and not p.group_has_edition_keyword
      and p.known_year_count = 1
    group by p.group_key
  ),
  chosen as (
    select group_key
    from safe_groups
    where plan_rows = 2
      and keep_rows = 1
      and merge_rows = 1
      and all_auto
      and stable_winner
      and only_source_losers
    order by group_key
    limit 50
  )
  select count(*)::int
  into v_eligible_groups
  from chosen;

  if v_eligible_groups = 0 then
    raise notice 'Strict duplicate merge batch skipped: no eligible groups in this dataset.';
    return;
  end if;

  if v_eligible_groups <> 50 then
    raise exception 'Expected 50 strict duplicate groups, found %', v_eligible_groups;
  end if;

  with safe_groups as (
    select
      p.group_key,
      count(*) filter (where p.recommended_action = 'keep') as keep_rows,
      count(*) filter (where p.recommended_action = 'merge_into_winner') as merge_rows,
      count(*) as plan_rows,
      bool_and(p.review_bucket = 'auto_proposable_same_title_year') as all_auto,
      bool_or(
        p.recommended_action = 'keep'
        and p.game_id !~ '^(rawg|steam|wiki)_'
      ) as stable_winner,
      bool_and(
        p.recommended_action <> 'merge_into_winner'
        or p.game_id ~ '^(rawg|steam|wiki)_'
      ) as only_source_losers
    from games_library.game_duplicate_review_plan p
    where p.group_status = 'needs_review'
      and p.proposed_action = p.recommended_action
      and p.group_user_ref_count = 0
      and not p.group_has_edition_keyword
      and p.known_year_count = 1
    group by p.group_key
  ),
  chosen as (
    select group_key
    from safe_groups
    where plan_rows = 2
      and keep_rows = 1
      and merge_rows = 1
      and all_auto
      and stable_winner
      and only_source_losers
    order by group_key
    limit 50
  )
  update games_library.game_duplicate_groups g
  set
    status = 'approved',
    reviewed_by = 'migration_20260614001923',
    reviewed_at = now(),
    review_notes = case
      when btrim(g.review_notes) = '' then 'Approved strict duplicate merge batch of 50.'
      else g.review_notes || E'\nApproved strict duplicate merge batch of 50.'
    end,
    updated_at = now()
  from chosen c
  where g.group_key = c.group_key;

  select *
  into v_result
  from games_library_private.apply_approved_game_duplicate_merges(50);

  if v_result.groups_processed <> 50
     or v_result.games_retired <> 50
     or v_result.redirects_created <> 50 then
    raise exception 'Unexpected strict merge result: groups %, retired %, redirects %',
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
