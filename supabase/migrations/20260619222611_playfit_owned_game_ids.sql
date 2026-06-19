-- Canonicalize source-prefixed game IDs into Playfit-owned IDs.
-- This migration intentionally does not merge duplicate game rows. It removes
-- source/provider identity from games.game_id while preserving lineage in
-- redirects and game_external_ids.
begin;

create schema if not exists games_library_private;

create table if not exists games_library_private.game_id_canonicalization_runs (
  run_id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  profiles_deleted int not null default 0,
  user_game_states_deleted int not null default 0,
  api_cache_rows_deleted int not null default 0,
  games_renamed int not null default 0,
  redirects_created int not null default 0,
  source_refs_preserved int not null default 0,
  legacy_ids_preserved int not null default 0,
  notes text not null default ''
);

comment on table games_library_private.game_id_canonicalization_runs is
  'Private audit runs for source-prefixed game_id cleanup into Playfit-owned IDs.';

create table if not exists games_library_private.game_id_canonicalization_map (
  old_game_id text primary key,
  new_game_id text not null,
  run_id uuid not null references games_library_private.game_id_canonicalization_runs(run_id) on delete restrict,
  title text not null,
  release_year int,
  source_type text not null default '',
  source_ref text not null default '',
  base_game_id text not null,
  initial_target_game_id text not null,
  target_rank int not null,
  rename_reason text not null,
  applied_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (old_game_id <> new_game_id)
);

comment on table games_library_private.game_id_canonicalization_map is
  'One row per renamed game_id, preserving the old source-prefixed ID and final Playfit-owned ID.';

create index if not exists game_id_canonicalization_map_new_game_id_idx
  on games_library_private.game_id_canonicalization_map (new_game_id);

alter table games_library_private.game_id_canonicalization_runs enable row level security;
alter table games_library_private.game_id_canonicalization_map enable row level security;

drop policy if exists service_role_manage_game_id_canonicalization_runs
  on games_library_private.game_id_canonicalization_runs;
create policy service_role_manage_game_id_canonicalization_runs
  on games_library_private.game_id_canonicalization_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_game_id_canonicalization_map
  on games_library_private.game_id_canonicalization_map;
create policy service_role_manage_game_id_canonicalization_map
  on games_library_private.game_id_canonicalization_map
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table
  games_library_private.game_id_canonicalization_runs,
  games_library_private.game_id_canonicalization_map
from public, anon, authenticated;

grant select, insert, update, delete on table
  games_library_private.game_id_canonicalization_runs,
  games_library_private.game_id_canonicalization_map
to service_role;

do $$
declare
  v_run_id uuid;
  v_existing_status text;
  v_profiles_deleted int := 0;
  v_user_game_states_deleted int := 0;
  v_api_cache_rows_deleted int := 0;
  v_source_ids int := 0;
  v_distinct_new_ids int := 0;
  v_conflicting_targets int := 0;
  v_source_prefixed_targets int := 0;
  v_temp_conflicts int := 0;
  v_games_temped int := 0;
  v_games_renamed int := 0;
  v_redirects int := 0;
  v_source_refs int := 0;
  v_legacy_ids int := 0;
  v_remaining_source_ids int := 0;
  v_orphan_count int := 0;
begin
  select status
  into v_existing_status
  from games_library_private.game_id_canonicalization_runs
  where run_key = '20260619_playfit_owned_game_ids';

  if v_existing_status = 'completed' then
    raise notice 'Playfit-owned game_id cleanup already completed; skipping.';
    return;
  elsif v_existing_status is not null then
    raise exception 'Previous Playfit-owned game_id cleanup run is %, refusing to continue', v_existing_status;
  end if;

  insert into games_library_private.game_id_canonicalization_runs (run_key, notes)
  values (
    '20260619_playfit_owned_game_ids',
    'Reset local profiles/user states and renamed source-prefixed game IDs into Playfit-owned IDs.'
  )
  returning run_id into v_run_id;

  select count(*)::int into v_user_game_states_deleted
  from games_library.user_game_states;

  delete from games_library.user_game_states;

  select count(*)::int into v_profiles_deleted
  from games_library.profiles;

  delete from games_library.profiles;

  if to_regclass('games_library.api_cache') is not null then
    select count(*)::int into v_api_cache_rows_deleted
    from games_library.api_cache;

    delete from games_library.api_cache;
  end if;

  create temp table playfit_source_id_candidates on commit drop as
  with source_rows as (
    select
      g.game_id as old_game_id,
      g.title,
      g.release_year,
      g.source_type,
      g.source_ref,
      coalesce(
        games_library_private.slugify_game_id(g.title),
        'game_' || left(md5(coalesce(g.title, '') || '|' || coalesce(g.release_year::text, '') || '|' || g.game_id), 12)
      ) as raw_base_game_id
    from games_library.games g
    where g.game_id ~ '^(rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)[_-]'
       or g.game_id ~ '[_-](rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)$'
  )
  select
    old_game_id,
    title,
    release_year,
    source_type,
    source_ref,
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

  create temp table playfit_id_map on commit drop as
  with base_stats as (
    select base_game_id, count(*) as source_rows
    from playfit_source_id_candidates
    group by base_game_id
  ),
  base_catalog_conflicts as (
    select
      c.base_game_id,
      count(g.*) as existing_rows
    from playfit_source_id_candidates c
    join games_library.games g
      on g.game_id = c.base_game_id
     and g.game_id <> c.old_game_id
     and not exists (
       select 1
       from playfit_source_id_candidates s
       where s.old_game_id = g.game_id
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
    from playfit_source_id_candidates c
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
     and g.game_id <> t.old_game_id
     and not exists (
       select 1
       from playfit_source_id_candidates s
       where s.old_game_id = g.game_id
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
        order by
          case split_part(t.old_game_id, '_', 1)
            when 'catalog' then 0
            when 'grouvee' then 1
            when 'ggapp' then 2
            when 'wiki' then 3
            when 'wikipedia' then 3
            when 'rawg' then 4
            when 'steam' then 5
            else 9
          end,
          t.old_game_id
      ) as target_rank
    from initial_targets t
    join target_stats ts using (initial_target_game_id)
    left join target_catalog_conflicts tc using (initial_target_game_id)
  )
  select
    old_game_id,
    case
      when target_source_rows = 1 and target_existing_rows = 0 then initial_target_game_id
      else initial_target_game_id || '_' || (target_existing_rows + target_rank)::text
    end as new_game_id,
    '__playfit_tmp_' || left(md5(old_game_id), 24) as temp_game_id,
    title,
    release_year,
    source_type,
    source_ref,
    base_game_id,
    initial_target_game_id,
    target_rank,
    case
      when target_source_rows = 1 and target_existing_rows = 0 then 'source_prefix_removed'
      else 'source_prefix_removed_with_disambiguator'
    end as rename_reason
  from ranked;

  select count(*)::int, count(distinct new_game_id)::int
  into v_source_ids, v_distinct_new_ids
  from playfit_id_map;

  if v_source_ids <> v_distinct_new_ids then
    raise exception 'Generated non-unique Playfit game IDs: source %, distinct targets %', v_source_ids, v_distinct_new_ids;
  end if;

  select count(*)::int
  into v_conflicting_targets
  from playfit_id_map m
  join games_library.games g on g.game_id = m.new_game_id
  where not exists (
    select 1
    from playfit_id_map old_rows
    where old_rows.old_game_id = g.game_id
  );

  if v_conflicting_targets <> 0 then
    raise exception 'Generated % Playfit game IDs that already exist on non-renamed rows', v_conflicting_targets;
  end if;

  select count(*)::int
  into v_source_prefixed_targets
  from playfit_id_map
  where new_game_id ~ '^(rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)[_-]'
     or new_game_id ~ '[_-](rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)$';

  if v_source_prefixed_targets <> 0 then
    raise exception 'Generated % game IDs that still look source-prefixed/source-suffixed', v_source_prefixed_targets;
  end if;

  select count(*)::int
  into v_temp_conflicts
  from playfit_id_map m
  join games_library.games g on g.game_id = m.temp_game_id;

  if v_temp_conflicts <> 0 then
    raise exception 'Generated % temporary game IDs that already exist', v_temp_conflicts;
  end if;

  insert into games_library_private.game_id_canonicalization_map (
    old_game_id,
    new_game_id,
    run_id,
    title,
    release_year,
    source_type,
    source_ref,
    base_game_id,
    initial_target_game_id,
    target_rank,
    rename_reason,
    metadata
  )
  select
    old_game_id,
    new_game_id,
    v_run_id,
    title,
    release_year,
    source_type,
    coalesce(source_ref, ''),
    base_game_id,
    initial_target_game_id,
    target_rank,
    rename_reason,
    jsonb_build_object('temp_game_id', temp_game_id)
  from playfit_id_map;

  update games_library.games g
  set
    game_id = m.temp_game_id,
    updated_at = now()
  from playfit_id_map m
  where g.game_id = m.old_game_id;
  get diagnostics v_games_temped = row_count;

  if v_games_temped <> v_source_ids then
    raise exception 'Expected to move % games to temporary IDs, moved %', v_source_ids, v_games_temped;
  end if;

  update games_library.games g
  set
    game_id = m.new_game_id,
    updated_at = now()
  from playfit_id_map m
  where g.game_id = m.temp_game_id;
  get diagnostics v_games_renamed = row_count;

  if v_games_renamed <> v_source_ids then
    raise exception 'Expected to rename % games to Playfit IDs, renamed %', v_source_ids, v_games_renamed;
  end if;

  insert into games_library.game_external_ids (
    game_id,
    provider,
    provider_game_key,
    source_title,
    confidence_score,
    metadata
  )
  select
    new_game_id,
    'legacy_game_id',
    old_game_id,
    title,
    100,
    jsonb_build_object(
      'canonicalized_from_game_id', old_game_id,
      'source_type', source_type,
      'source_ref', coalesce(source_ref, ''),
      'run_id', v_run_id
    )
  from playfit_id_map
  on conflict (game_id, provider, provider_game_key) do update set
    source_title = excluded.source_title,
    confidence_score = greatest(games_library.game_external_ids.confidence_score, excluded.confidence_score),
    metadata = games_library.game_external_ids.metadata || excluded.metadata,
    updated_at = now();
  get diagnostics v_legacy_ids = row_count;

  insert into games_library.game_external_ids (
    game_id,
    provider,
    provider_game_key,
    source_title,
    confidence_score,
    metadata
  )
  select
    new_game_id,
    split_part(source_ref, ':', 1),
    substring(source_ref from position(':' in source_ref) + 1),
    title,
    100,
    jsonb_build_object(
      'canonicalized_from_game_id', old_game_id,
      'legacy_source_ref', source_ref,
      'run_id', v_run_id
    )
  from playfit_id_map
  where source_ref like '%:%'
    and btrim(split_part(source_ref, ':', 1)) <> ''
    and btrim(substring(source_ref from position(':' in source_ref) + 1)) <> ''
  on conflict (game_id, provider, provider_game_key) do update set
    source_title = excluded.source_title,
    confidence_score = greatest(games_library.game_external_ids.confidence_score, excluded.confidence_score),
    metadata = games_library.game_external_ids.metadata || excluded.metadata,
    updated_at = now();
  get diagnostics v_source_refs = row_count;

  insert into games_library.game_redirects (
    from_game_id,
    to_game_id,
    reason,
    notes,
    created_by
  )
  select
    old_game_id,
    new_game_id,
    'source_cleanup',
    'Source-prefixed game_id canonicalized to Playfit-owned ID by run ' || v_run_id::text,
    'migration_20260619222611_playfit_owned_game_ids'
  from playfit_id_map
  on conflict (from_game_id) do update set
    to_game_id = excluded.to_game_id,
    reason = excluded.reason,
    notes = excluded.notes,
    created_by = excluded.created_by,
    updated_at = now();
  get diagnostics v_redirects = row_count;

  update games_library_private.game_id_canonicalization_map m
  set applied_at = now()
  where m.run_id = v_run_id;

  select count(*)::int
  into v_remaining_source_ids
  from games_library.games
  where game_id ~ '^(rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)[_-]'
     or game_id ~ '[_-](rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)$';

  if v_remaining_source_ids <> 0 then
    raise exception 'Expected 0 remaining source-prefixed/source-suffixed game IDs, found %', v_remaining_source_ids;
  end if;

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
    raise exception 'Found % game_id orphans after Playfit-owned ID cleanup', v_orphan_count;
  end if;

  update games_library_private.game_id_canonicalization_runs
  set
    completed_at = now(),
    status = 'completed',
    profiles_deleted = v_profiles_deleted,
    user_game_states_deleted = v_user_game_states_deleted,
    api_cache_rows_deleted = v_api_cache_rows_deleted,
    games_renamed = v_games_renamed,
    redirects_created = v_redirects,
    source_refs_preserved = v_source_refs,
    legacy_ids_preserved = v_legacy_ids
  where run_id = v_run_id;

  perform * from games_library_private.propose_game_duplicate_actions();
end;
$$;

commit;

-- Down:
-- This migration is intentionally not auto-reversed. It stores the mapping in
-- games_library_private.game_id_canonicalization_map and creates redirects in
-- games_library.game_redirects. To inspect or manually reverse a specific row,
-- use the private map plus FK cascades after taking a fresh DB backup.
