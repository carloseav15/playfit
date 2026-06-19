-- Improve Playfit-owned IDs generated from accented titles.
-- The previous canonicalization used the legacy slugifier, which strips many
-- non-ASCII letters. This pass uses unaccent for cleaner IDs such as pokemon_*.
begin;

create extension if not exists unaccent with schema extensions;

create or replace function games_library_private.slugify_game_id_unaccent(p_title text)
returns text
language sql
stable
strict
set search_path = pg_catalog, extensions
as $$
  select nullif(
    regexp_replace(
      trim(both '_' from regexp_replace(lower(extensions.unaccent(p_title)), '[^a-z0-9]+', '_', 'g')),
      '_+',
      '_',
      'g'
    ),
    ''
  )
$$;

comment on function games_library_private.slugify_game_id_unaccent(text) is
  'Converts a title into a source-agnostic ASCII game_id using unaccent transliteration.';

revoke all on function games_library_private.slugify_game_id_unaccent(text)
  from public, anon, authenticated;
grant execute on function games_library_private.slugify_game_id_unaccent(text)
  to service_role;

create table if not exists games_library_private.game_id_diacritic_cleanup_runs (
  run_id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  games_renamed int not null default 0,
  redirects_created int not null default 0,
  notes text not null default ''
);

create table if not exists games_library_private.game_id_diacritic_cleanup_map (
  previous_game_id text primary key,
  new_game_id text not null,
  run_id uuid not null references games_library_private.game_id_diacritic_cleanup_runs(run_id) on delete restrict,
  title text not null,
  release_year int,
  base_game_id text not null,
  initial_target_game_id text not null,
  target_rank int not null,
  applied_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (previous_game_id <> new_game_id)
);

create index if not exists game_id_diacritic_cleanup_map_new_game_id_idx
  on games_library_private.game_id_diacritic_cleanup_map (new_game_id);

alter table games_library_private.game_id_diacritic_cleanup_runs enable row level security;
alter table games_library_private.game_id_diacritic_cleanup_map enable row level security;

drop policy if exists service_role_manage_game_id_diacritic_cleanup_runs
  on games_library_private.game_id_diacritic_cleanup_runs;
create policy service_role_manage_game_id_diacritic_cleanup_runs
  on games_library_private.game_id_diacritic_cleanup_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_game_id_diacritic_cleanup_map
  on games_library_private.game_id_diacritic_cleanup_map;
create policy service_role_manage_game_id_diacritic_cleanup_map
  on games_library_private.game_id_diacritic_cleanup_map
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table
  games_library_private.game_id_diacritic_cleanup_runs,
  games_library_private.game_id_diacritic_cleanup_map
from public, anon, authenticated;

grant select, insert, update, delete on table
  games_library_private.game_id_diacritic_cleanup_runs,
  games_library_private.game_id_diacritic_cleanup_map
to service_role;

do $$
declare
  v_run_id uuid;
  v_existing_status text;
  v_candidates int := 0;
  v_distinct_targets int := 0;
  v_conflicting_targets int := 0;
  v_source_prefixed_targets int := 0;
  v_temp_conflicts int := 0;
  v_temped int := 0;
  v_renamed int := 0;
  v_redirects int := 0;
  v_orphan_count int := 0;
begin
  select status
  into v_existing_status
  from games_library_private.game_id_diacritic_cleanup_runs
  where run_key = '20260619_improve_playfit_id_diacritics';

  if v_existing_status = 'completed' then
    raise notice 'Playfit game_id diacritic cleanup already completed; skipping.';
    return;
  elsif v_existing_status is not null then
    raise exception 'Previous Playfit game_id diacritic cleanup run is %, refusing to continue', v_existing_status;
  end if;

  insert into games_library_private.game_id_diacritic_cleanup_runs (run_key, notes)
  values (
    '20260619_improve_playfit_id_diacritics',
    'Improve IDs from the source-prefix cleanup by transliterating accented title characters.'
  )
  returning run_id into v_run_id;

  create temp table playfit_diacritic_source_rows on commit drop as
  with source_rows as (
    select
      m.old_game_id as original_source_game_id,
      m.new_game_id as previous_game_id,
      g.title,
      g.release_year,
      coalesce(
        games_library_private.slugify_game_id_unaccent(g.title),
        'game_' || left(md5(coalesce(g.title, '') || '|' || coalesce(g.release_year::text, '') || '|' || g.game_id), 12)
      ) as raw_base_game_id
    from games_library_private.game_id_canonicalization_map m
    join games_library.games g
      on g.game_id = m.new_game_id
    where m.run_id = (
      select run_id
      from games_library_private.game_id_canonicalization_runs
      where run_key = '20260619_playfit_owned_game_ids'
        and status = 'completed'
    )
  )
  select
    original_source_game_id,
    previous_game_id,
    title,
    release_year,
    case
      when raw_base_game_id ~ '^(rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)($|_)'
        and raw_base_game_id ~ '(^|_)(rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)$'
        then 'game_' || raw_base_game_id || '_title'
      when raw_base_game_id ~ '^(rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)($|_)'
        then 'game_' || raw_base_game_id
      when raw_base_game_id ~ '(^|_)(rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)$'
        then raw_base_game_id || '_game'
      else raw_base_game_id
    end as base_game_id
  from source_rows;

  create temp table playfit_diacritic_id_map on commit drop as
  with base_stats as (
    select base_game_id, count(*) as source_rows
    from playfit_diacritic_source_rows
    group by base_game_id
  ),
  base_catalog_conflicts as (
    select
      c.base_game_id,
      count(g.*) as existing_rows
    from playfit_diacritic_source_rows c
    join games_library.games g
      on g.game_id = c.base_game_id
     and g.game_id <> c.previous_game_id
     and not exists (
       select 1
       from playfit_diacritic_source_rows s
       where s.previous_game_id = g.game_id
     )
    group by c.base_game_id
  ),
  initial_targets as (
    select
      c.*,
      case
        when bs.source_rows = 1 and coalesce(bc.existing_rows, 0) = 0 then c.base_game_id
        when c.release_year is not null and c.release_year > 0 then c.base_game_id || '_' || c.release_year::text
        else c.base_game_id
      end as initial_target_game_id
    from playfit_diacritic_source_rows c
    join base_stats bs using (base_game_id)
    left join base_catalog_conflicts bc using (base_game_id)
  ),
  target_stats as (
    select initial_target_game_id, count(*) as source_rows
    from initial_targets
    group by initial_target_game_id
  ),
  target_catalog_conflicts as (
    select
      t.initial_target_game_id,
      count(g.*) as existing_rows
    from initial_targets t
    join games_library.games g
      on g.game_id = t.initial_target_game_id
     and g.game_id <> t.previous_game_id
     and not exists (
       select 1
       from playfit_diacritic_source_rows s
       where s.previous_game_id = g.game_id
     )
    group by t.initial_target_game_id
  ),
  ranked as (
    select
      t.*,
      ts.source_rows as target_source_rows,
      coalesce(tc.existing_rows, 0) as target_existing_rows,
      row_number() over (
        partition by t.initial_target_game_id
        order by t.previous_game_id
      ) as target_rank
    from initial_targets t
    join target_stats ts using (initial_target_game_id)
    left join target_catalog_conflicts tc using (initial_target_game_id)
  ),
  generated as (
    select
      previous_game_id,
      case
        when target_source_rows = 1 and target_existing_rows = 0 then initial_target_game_id
        else initial_target_game_id || '_' || (target_existing_rows + target_rank)::text
      end as new_game_id,
      '__playfit_diacritic_tmp_' || left(md5(previous_game_id), 16) as temp_game_id,
      title,
      release_year,
      base_game_id,
      initial_target_game_id,
      target_rank,
      original_source_game_id
    from ranked
  )
  select *
  from generated
  where new_game_id <> previous_game_id;

  select count(*)::int, count(distinct new_game_id)::int
  into v_candidates, v_distinct_targets
  from playfit_diacritic_id_map;

  if v_candidates <> v_distinct_targets then
    raise exception 'Generated non-unique diacritic-improved game IDs: source %, distinct targets %', v_candidates, v_distinct_targets;
  end if;

  select count(*)::int
  into v_conflicting_targets
  from playfit_diacritic_id_map m
  join games_library.games g on g.game_id = m.new_game_id
  where not exists (
    select 1
    from playfit_diacritic_id_map current_rows
    where current_rows.previous_game_id = g.game_id
  );

  if v_conflicting_targets <> 0 then
    raise exception 'Generated % diacritic-improved IDs that already exist on non-renamed rows', v_conflicting_targets;
  end if;

  select count(*)::int
  into v_source_prefixed_targets
  from playfit_diacritic_id_map
  where new_game_id ~ '^(rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)[_-]'
     or new_game_id ~ '[_-](rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)$';

  if v_source_prefixed_targets <> 0 then
    raise exception 'Generated % diacritic-improved IDs that still look source-prefixed/source-suffixed', v_source_prefixed_targets;
  end if;

  select count(*)::int
  into v_temp_conflicts
  from playfit_diacritic_id_map m
  join games_library.games g on g.game_id = m.temp_game_id;

  if v_temp_conflicts <> 0 then
    raise exception 'Generated % temporary diacritic cleanup IDs that already exist', v_temp_conflicts;
  end if;

  insert into games_library_private.game_id_diacritic_cleanup_map (
    previous_game_id,
    new_game_id,
    run_id,
    title,
    release_year,
    base_game_id,
    initial_target_game_id,
    target_rank,
    metadata
  )
  select
    previous_game_id,
    new_game_id,
    v_run_id,
    title,
    release_year,
    base_game_id,
    initial_target_game_id,
    target_rank,
    jsonb_build_object(
      'original_source_game_id', original_source_game_id,
      'temp_game_id', temp_game_id
    )
  from playfit_diacritic_id_map;

  update games_library.games g
  set
    game_id = m.temp_game_id,
    updated_at = now()
  from playfit_diacritic_id_map m
  where g.game_id = m.previous_game_id;
  get diagnostics v_temped = row_count;

  if v_temped <> v_candidates then
    raise exception 'Expected to move % games to diacritic temp IDs, moved %', v_candidates, v_temped;
  end if;

  update games_library.games g
  set
    game_id = m.new_game_id,
    updated_at = now()
  from playfit_diacritic_id_map m
  where g.game_id = m.temp_game_id;
  get diagnostics v_renamed = row_count;

  if v_renamed <> v_candidates then
    raise exception 'Expected to rename % games to diacritic-improved IDs, renamed %', v_candidates, v_renamed;
  end if;

  insert into games_library.game_redirects (
    from_game_id,
    to_game_id,
    reason,
    notes,
    created_by
  )
  select
    previous_game_id,
    new_game_id,
    'manual_id_change',
    'Diacritic-improved Playfit-owned game_id by run ' || v_run_id::text,
    'migration_20260619223247_improve_playfit_id_diacritics'
  from playfit_diacritic_id_map
  on conflict (from_game_id) do update set
    to_game_id = excluded.to_game_id,
    reason = excluded.reason,
    notes = excluded.notes,
    created_by = excluded.created_by,
    updated_at = now();
  get diagnostics v_redirects = row_count;

  update games_library_private.game_id_diacritic_cleanup_map m
  set applied_at = now()
  where m.run_id = v_run_id;

  update games_library_private.game_id_canonicalization_map m
  set
    new_game_id = d.new_game_id,
    metadata = m.metadata || jsonb_build_object('first_playfit_game_id', d.previous_game_id),
    applied_at = coalesce(m.applied_at, now())
  from playfit_diacritic_id_map d
  where m.new_game_id = d.previous_game_id;

  select sum(orphan_count)::int
  into v_orphan_count
  from (
    select count(*) as orphan_count
    from games_library.game_platforms gp
    left join games_library.games g using (game_id)
    where g.game_id is null
    union all
    select count(*)
    from games_library.game_tags gt
    left join games_library.games g using (game_id)
    where g.game_id is null
    union all
    select count(*)
    from games_library.game_aliases ga
    left join games_library.games g using (game_id)
    where g.game_id is null
    union all
    select count(*)
    from games_library.game_external_ids ge
    left join games_library.games g using (game_id)
    where g.game_id is null
    union all
    select count(*)
    from games_library.game_external_match_candidates c
    left join games_library.games g using (game_id)
    where g.game_id is null
    union all
    select count(*)
    from games_library.user_game_states ugs
    left join games_library.games g using (game_id)
    where g.game_id is null
  ) checks;

  if coalesce(v_orphan_count, 0) <> 0 then
    raise exception 'Found % game_id orphans after diacritic ID cleanup', v_orphan_count;
  end if;

  update games_library_private.game_id_diacritic_cleanup_runs
  set
    completed_at = now(),
    status = 'completed',
    games_renamed = v_renamed,
    redirects_created = v_redirects
  where run_id = v_run_id;

  perform * from games_library_private.propose_game_duplicate_actions();
end;
$$;

commit;

-- Down:
-- This migration is intentionally not auto-reversed. It stores the prior and
-- final IDs in games_library_private.game_id_diacritic_cleanup_map and creates
-- redirects from the first-generation IDs to the improved IDs.
