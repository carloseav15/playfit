-- Remove redundant aliases that exactly duplicate the canonical game title.
begin;

create table if not exists games_library_private.redundant_alias_cleanup_runs (
  run_id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  title_aliases_deleted int not null default 0,
  games_alias_cache_synced int not null default 0,
  notes text not null default ''
);

alter table games_library_private.redundant_alias_cleanup_runs enable row level security;

drop policy if exists service_role_manage_redundant_alias_cleanup_runs
  on games_library_private.redundant_alias_cleanup_runs;
create policy service_role_manage_redundant_alias_cleanup_runs
  on games_library_private.redundant_alias_cleanup_runs
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library_private.redundant_alias_cleanup_runs
  from public, anon, authenticated;
grant select, insert, update, delete on table games_library_private.redundant_alias_cleanup_runs
  to service_role;

do $$
declare
  v_run_id uuid;
  v_existing_status text;
  v_deleted int := 0;
  v_synced int := 0;
begin
  select status
  into v_existing_status
  from games_library_private.redundant_alias_cleanup_runs
  where run_key = '20260620_remove_redundant_title_aliases';

  if v_existing_status = 'completed' then
    raise notice 'Redundant title alias cleanup already completed; skipping.';
    return;
  elsif v_existing_status is not null then
    raise exception 'Previous redundant title alias cleanup run is %, refusing to continue', v_existing_status;
  end if;

  insert into games_library_private.redundant_alias_cleanup_runs (run_key, notes)
  values (
    '20260620_remove_redundant_title_aliases',
    'Delete aliases that exactly duplicate the canonical title; title remains on games.title.'
  )
  returning run_id into v_run_id;

  delete from games_library.game_aliases a
  using games_library.games g
  where g.game_id = a.game_id
    and a.alias = g.title;
  get diagnostics v_deleted = row_count;

  with desired as (
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
    from desired d
    where d.game_id = g.game_id
      and coalesce((select array_agg(x order by x) from unnest(g.aliases) x), '{}'::text[]) <> d.aliases
    returning 1
  )
  select count(*)::int
  into v_synced
  from synced;

  update games_library_private.redundant_alias_cleanup_runs
  set
    completed_at = now(),
    status = 'completed',
    title_aliases_deleted = v_deleted,
    games_alias_cache_synced = v_synced
  where run_id = v_run_id;
end;
$$;

commit;

-- Down:
-- Intentionally not auto-reversed. Deleted aliases were exact copies of
-- games.title and can be reconstructed from canonical titles if needed.
