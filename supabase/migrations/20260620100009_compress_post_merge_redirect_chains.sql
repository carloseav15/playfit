-- Re-compress redirect chains after the large post-ingest duplicate merge batch.
begin;

do $$
declare
  v_run_id uuid;
  v_existing_status text;
  v_iteration int := 0;
  v_updated int := 0;
  v_deleted int := 0;
  v_total_updated int := 0;
  v_total_deleted int := 0;
  v_chains_remaining int := 0;
  v_missing_targets int := 0;
begin
  select status
  into v_existing_status
  from games_library_private.redirect_chain_compression_runs
  where run_key = '20260620_compress_post_merge_redirect_chains';

  if v_existing_status = 'completed' then
    raise notice 'Post-merge redirect chain compression already completed; skipping.';
    return;
  elsif v_existing_status is not null then
    raise exception 'Previous post-merge redirect compression run is %, refusing to continue', v_existing_status;
  end if;

  insert into games_library_private.redirect_chain_compression_runs (run_key, notes)
  values (
    '20260620_compress_post_merge_redirect_chains',
    'Compress redirect chains introduced by the post-ingest duplicate merge queue.'
  )
  returning run_id into v_run_id;

  loop
    v_iteration := v_iteration + 1;

    delete from games_library.game_redirects r
    using games_library.game_redirects next
    where r.to_game_id = next.from_game_id
      and r.from_game_id = next.to_game_id;
    get diagnostics v_deleted = row_count;
    v_total_deleted := v_total_deleted + v_deleted;

    update games_library.game_redirects r
    set
      to_game_id = next.to_game_id,
      notes = case
        when btrim(coalesce(r.notes, '')) = '' then 'Redirect chain compressed post-merge through ' || next.from_game_id
        else r.notes || E'\nRedirect chain compressed post-merge through ' || next.from_game_id
      end,
      updated_at = now()
    from games_library.game_redirects next
    where r.to_game_id = next.from_game_id
      and r.from_game_id <> next.to_game_id;
    get diagnostics v_updated = row_count;
    v_total_updated := v_total_updated + v_updated;

    exit when v_updated = 0 and v_deleted = 0;

    if v_iteration > 20 then
      raise exception 'Post-merge redirect chain compression exceeded 20 iterations; possible cycle remains';
    end if;
  end loop;

  select count(*)::int
  into v_chains_remaining
  from games_library.game_redirects r1
  join games_library.game_redirects r2
    on r1.to_game_id = r2.from_game_id;

  select count(*)::int
  into v_missing_targets
  from games_library.game_redirects r
  left join games_library.games g
    on g.game_id = r.to_game_id
  where g.game_id is null;

  if v_chains_remaining <> 0 then
    raise exception 'Post-merge redirect compression left % chains', v_chains_remaining;
  end if;

  if v_missing_targets <> 0 then
    raise exception 'Post-merge redirect compression left % missing targets', v_missing_targets;
  end if;

  update games_library_private.redirect_chain_compression_runs
  set
    completed_at = now(),
    status = 'completed',
    update_iterations = v_iteration,
    redirects_updated = v_total_updated,
    self_redirects_deleted = v_total_deleted,
    chains_remaining = v_chains_remaining,
    missing_targets_remaining = v_missing_targets
  where run_id = v_run_id;
end;
$$;

commit;

-- Down:
-- Intentionally not auto-reversed. This only shortens redirect chains and keeps
-- the same final live target.
