-- Revert one unstable fallback-hash slug cleanup row.
-- Non-transliterable titles must not be repeatedly renamed from game_<hash> to
-- another game_<hash>; keep the pre-cleanup Playfit ID and preserve a redirect
-- from the temporary hash that briefly existed locally.
begin;

do $$
declare
  v_bad_previous_game_id text := 'game_aa8ca7ebc591';
  v_bad_new_game_id text := 'game_26758e87d606';
  v_title text := '仙剑奇侠传';
  v_run_id uuid;
  v_deleted_reverse_redirects int := 0;
  v_renamed int := 0;
  v_deleted_map_rows int := 0;
  v_orphan_count int := 0;
begin
  select run_id
  into v_run_id
  from games_library_private.game_id_slug_cleanup_map
  where previous_game_id = v_bad_previous_game_id
    and new_game_id = v_bad_new_game_id
    and title = v_title;

  if v_run_id is null then
    raise notice 'Unstable hash slug cleanup row is absent; skipping correction.';
    return;
  end if;

  if exists (select 1 from games_library.games where game_id = v_bad_previous_game_id) then
    raise notice 'Original hash ID already exists; removing stale cleanup audit row only.';

    delete from games_library_private.game_id_slug_cleanup_map
    where previous_game_id = v_bad_previous_game_id
      and new_game_id = v_bad_new_game_id;
    get diagnostics v_deleted_map_rows = row_count;

    update games_library_private.game_id_slug_cleanup_runs
    set
      games_renamed = greatest(games_renamed - v_deleted_map_rows, 0),
      redirects_created = greatest(redirects_created - v_deleted_map_rows, 0),
      notes = notes || E'\nRemoved unstable fallback-hash cleanup audit row without data rename.'
    where run_id = v_run_id;

    return;
  end if;

  if not exists (
    select 1
    from games_library.games
    where game_id = v_bad_new_game_id
      and title = v_title
  ) then
    raise exception 'Expected unstable hash game % with title %, but it was not found', v_bad_new_game_id, v_title;
  end if;

  delete from games_library.game_redirects
  where from_game_id = v_bad_previous_game_id
    and to_game_id = v_bad_new_game_id;
  get diagnostics v_deleted_reverse_redirects = row_count;

  update games_library.games
  set
    game_id = v_bad_previous_game_id,
    notes = case
      when btrim(coalesce(notes, '')) = '' then 'Reverted unstable fallback-hash slug cleanup from ' || v_bad_new_game_id
      else notes || E'\nReverted unstable fallback-hash slug cleanup from ' || v_bad_new_game_id
    end,
    updated_at = now()
  where game_id = v_bad_new_game_id
    and title = v_title;
  get diagnostics v_renamed = row_count;

  if v_renamed <> 1 then
    raise exception 'Expected to revert 1 unstable hash game, reverted %', v_renamed;
  end if;

  insert into games_library.game_redirects (
    from_game_id,
    to_game_id,
    reason,
    notes,
    created_by
  )
  values (
    v_bad_new_game_id,
    v_bad_previous_game_id,
    'manual_id_change',
    'Reverted unstable fallback-hash slug cleanup; non-transliterable title kept on prior Playfit ID.',
    'migration_20260620004801_revert_unstable_hash_slug_cleanup'
  )
  on conflict (from_game_id) do update set
    to_game_id = excluded.to_game_id,
    reason = excluded.reason,
    notes = excluded.notes,
    created_by = excluded.created_by,
    updated_at = now();

  delete from games_library_private.game_id_slug_cleanup_map
  where previous_game_id = v_bad_previous_game_id
    and new_game_id = v_bad_new_game_id;
  get diagnostics v_deleted_map_rows = row_count;

  if v_deleted_map_rows <> 1 then
    raise exception 'Expected to delete 1 unstable hash cleanup audit row, deleted %', v_deleted_map_rows;
  end if;

  update games_library_private.game_id_slug_cleanup_runs
  set
    games_renamed = greatest(games_renamed - 1, 0),
    redirects_created = greatest(redirects_created - 1, 0),
    notes = notes || E'\nReverted unstable fallback-hash cleanup row; deleted reverse redirects: ' || v_deleted_reverse_redirects::text
  where run_id = v_run_id;

  select sum(orphan_rows)::int
  into v_orphan_count
  from (
    select count(*) as orphan_rows from games_library.game_platforms t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_tags t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_aliases t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.user_game_states t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.series_cleanup_applied t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_external_match_candidates t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_external_ids t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_releases t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_companies t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_scores t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_age_ratings t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_summaries t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_sales_snapshots t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_review_sentiment_snapshots t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_redirects t left join games_library.games g on g.game_id = t.to_game_id where g.game_id is null
  ) orphan_checks;

  if coalesce(v_orphan_count, 0) <> 0 then
    raise exception 'Unstable hash cleanup correction left % orphaned game references', v_orphan_count;
  end if;
end;
$$;

commit;

-- Down:
-- Intentionally not auto-reversed. The correction restores a stable Playfit ID
-- and preserves the temporary hash via game_redirects.
