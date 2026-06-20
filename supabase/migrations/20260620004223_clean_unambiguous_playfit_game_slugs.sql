-- Clean unambiguous Playfit-owned game IDs generated from titles with
-- diacritics or legal marks. Collision-prone rows are intentionally left for
-- duplicate review/merge instead of receiving artificial numeric suffixes.
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
      trim(
        both '_' from regexp_replace(
          lower(extensions.unaccent(regexp_replace(p_title, '[®™©℠]', '', 'g'))),
          '[^a-z0-9]+',
          '_',
          'g'
        )
      ),
      '_+',
      '_',
      'g'
    ),
    ''
  )
$$;

comment on function games_library_private.slugify_game_id_unaccent(text) is
  'Converts a title into a source-agnostic ASCII game_id using unaccent transliteration and stripping legal marks.';

revoke all on function games_library_private.slugify_game_id_unaccent(text)
  from public, anon, authenticated;
grant execute on function games_library_private.slugify_game_id_unaccent(text)
  to service_role;

create table if not exists games_library_private.game_id_slug_cleanup_runs (
  run_id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  games_renamed int not null default 0,
  redirects_created int not null default 0,
  skipped_collision_or_existing_target int not null default 0,
  notes text not null default ''
);

comment on table games_library_private.game_id_slug_cleanup_runs is
  'Private audit runs for unambiguous Playfit-owned slug cleanup.';

create table if not exists games_library_private.game_id_slug_cleanup_map (
  previous_game_id text primary key,
  new_game_id text not null,
  run_id uuid not null references games_library_private.game_id_slug_cleanup_runs(run_id) on delete restrict,
  title text not null,
  release_year int,
  clean_slug text not null,
  applied_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (previous_game_id <> new_game_id)
);

comment on table games_library_private.game_id_slug_cleanup_map is
  'One row per unambiguous internal game_id slug rename.';

create index if not exists game_id_slug_cleanup_map_new_game_id_idx
  on games_library_private.game_id_slug_cleanup_map (new_game_id);

alter table games_library_private.game_id_slug_cleanup_runs enable row level security;
alter table games_library_private.game_id_slug_cleanup_map enable row level security;

drop policy if exists service_role_manage_game_id_slug_cleanup_runs
  on games_library_private.game_id_slug_cleanup_runs;
create policy service_role_manage_game_id_slug_cleanup_runs
  on games_library_private.game_id_slug_cleanup_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_game_id_slug_cleanup_map
  on games_library_private.game_id_slug_cleanup_map;
create policy service_role_manage_game_id_slug_cleanup_map
  on games_library_private.game_id_slug_cleanup_map
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table
  games_library_private.game_id_slug_cleanup_runs,
  games_library_private.game_id_slug_cleanup_map
from public, anon, authenticated;

grant select, insert, update, delete on table
  games_library_private.game_id_slug_cleanup_runs,
  games_library_private.game_id_slug_cleanup_map
to service_role;

do $$
declare
  v_run_id uuid;
  v_existing_status text;
  v_candidates int := 0;
  v_distinct_targets int := 0;
  v_conflicting_targets int := 0;
  v_source_like_targets int := 0;
  v_skipped int := 0;
  v_reverse_redirects_deleted int := 0;
  v_renamed int := 0;
  v_redirects int := 0;
  v_orphan_count int := 0;
begin
  select status
  into v_existing_status
  from games_library_private.game_id_slug_cleanup_runs
  where run_key = '20260620_clean_unambiguous_playfit_game_slugs';

  if v_existing_status = 'completed' then
    raise notice 'Unambiguous Playfit game_id slug cleanup already completed; skipping.';
    return;
  elsif v_existing_status is not null then
    raise exception 'Previous unambiguous Playfit game_id slug cleanup run is %, refusing to continue', v_existing_status;
  end if;

  insert into games_library_private.game_id_slug_cleanup_runs (run_key, notes)
  values (
    '20260620_clean_unambiguous_playfit_game_slugs',
    'Rename unambiguous Playfit-owned IDs after improved transliteration and legal-mark stripping; collision-prone rows stay in review.'
  )
  returning run_id into v_run_id;

  create temp table playfit_slug_cleanup_evaluated on commit drop as
  with generated as (
    select
      g.game_id as previous_game_id,
      g.title,
      g.release_year,
      games_library_private.slugify_game_id_unaccent(g.title) as clean_slug
    from games_library.games g
    where g.title ~ '[^[:ascii:]]'
  )
  select
    generated.*,
    count(*) over (partition by clean_slug) as same_clean_slug_candidates,
    exists (
      select 1
      from games_library.games existing
      where existing.game_id = generated.clean_slug
        and existing.game_id <> generated.previous_game_id
    ) as target_exists_elsewhere
  from generated;

  select count(*)::int
  into v_skipped
  from playfit_slug_cleanup_evaluated
  where clean_slug <> previous_game_id
    and clean_slug is not null
    and clean_slug <> ''
    and (same_clean_slug_candidates > 1 or target_exists_elsewhere);

  create temp table playfit_slug_cleanup_map on commit drop as
  select
    previous_game_id,
    clean_slug as new_game_id,
    '__playfit_slug_tmp_' || left(md5(previous_game_id), 16) as temp_game_id,
    title,
    release_year,
    clean_slug,
    jsonb_build_object(
      'same_clean_slug_candidates', same_clean_slug_candidates,
      'target_exists_elsewhere', target_exists_elsewhere
    ) as metadata
  from playfit_slug_cleanup_evaluated
  where clean_slug <> previous_game_id
    and clean_slug is not null
    and clean_slug <> ''
    and same_clean_slug_candidates = 1
    and not target_exists_elsewhere;

  select count(*)::int, count(distinct new_game_id)::int
  into v_candidates, v_distinct_targets
  from playfit_slug_cleanup_map;

  if v_candidates = 0 then
    update games_library_private.game_id_slug_cleanup_runs
    set
      completed_at = now(),
      status = 'completed',
      skipped_collision_or_existing_target = v_skipped,
      notes = notes || E'\nNo unambiguous slug cleanup candidates found.'
    where run_id = v_run_id;

    raise notice 'Unambiguous Playfit game_id slug cleanup skipped: no candidates.';
    return;
  end if;

  if v_candidates <> 163 then
    raise exception 'Expected 163 unambiguous slug cleanup candidates, found %', v_candidates;
  end if;

  if v_candidates <> v_distinct_targets then
    raise exception 'Generated non-unique slug cleanup targets: source %, distinct targets %', v_candidates, v_distinct_targets;
  end if;

  select count(*)::int
  into v_conflicting_targets
  from playfit_slug_cleanup_map m
  join games_library.games g
    on g.game_id = m.new_game_id
   and g.game_id <> m.previous_game_id;

  if v_conflicting_targets <> 0 then
    raise exception 'Slug cleanup generated % targets that already exist in games', v_conflicting_targets;
  end if;

  select count(*)::int
  into v_source_like_targets
  from playfit_slug_cleanup_map
  where new_game_id ~ '^(rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)(_|$)'
     or new_game_id ~ '(^|_)(rawg|steam|wiki|wikipedia|wikidata|igdb|metacritic|vgsales|opencritic|mobygames|giantbomb|grouvee|ggapp|catalog|universe|finder)$';

  if v_source_like_targets <> 0 then
    raise exception 'Slug cleanup generated % source-like IDs, refusing to continue', v_source_like_targets;
  end if;

  insert into games_library_private.game_id_slug_cleanup_map (
    previous_game_id,
    new_game_id,
    run_id,
    title,
    release_year,
    clean_slug,
    metadata
  )
  select
    previous_game_id,
    new_game_id,
    v_run_id,
    title,
    release_year,
    clean_slug,
    metadata
  from playfit_slug_cleanup_map;

  delete from games_library.game_redirects r
  using playfit_slug_cleanup_map m
  where r.from_game_id = m.new_game_id
    and r.to_game_id = m.previous_game_id;
  get diagnostics v_reverse_redirects_deleted = row_count;

  update games_library.games g
  set
    game_id = m.new_game_id,
    notes = case
      when btrim(coalesce(g.notes, '')) = '' then 'Internal game_id slug cleaned from ' || m.previous_game_id
      else g.notes || E'\nInternal game_id slug cleaned from ' || m.previous_game_id
    end,
    updated_at = now()
  from playfit_slug_cleanup_map m
  where g.game_id = m.previous_game_id;
  get diagnostics v_renamed = row_count;

  if v_renamed <> v_candidates then
    raise exception 'Expected to rename % games, renamed %', v_candidates, v_renamed;
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
    'Unambiguous internal slug cleanup by run ' || v_run_id::text,
    'migration_20260620004223_clean_unambiguous_playfit_game_slugs'
  from playfit_slug_cleanup_map
  on conflict (from_game_id) do update set
    to_game_id = excluded.to_game_id,
    reason = excluded.reason,
    notes = excluded.notes,
    created_by = excluded.created_by,
    updated_at = now();
  get diagnostics v_redirects = row_count;

  if v_redirects <> v_candidates then
    raise exception 'Expected to create/update % redirects, affected %', v_candidates, v_redirects;
  end if;

  update games_library_private.game_id_slug_cleanup_map m
  set applied_at = now()
  where m.run_id = v_run_id;

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
    raise exception 'Slug cleanup left % orphaned game references', v_orphan_count;
  end if;

  update games_library_private.game_id_slug_cleanup_runs
  set
    completed_at = now(),
    status = 'completed',
    games_renamed = v_renamed,
    redirects_created = v_redirects,
    skipped_collision_or_existing_target = v_skipped,
    notes = notes || E'\nDeleted reverse redirects before cleanup: ' || v_reverse_redirects_deleted::text
  where run_id = v_run_id;
end;
$$;

commit;

-- Down:
-- This cleanup is intentionally not auto-reversed. The audit map table and
-- redirects preserve previous IDs for inspected rollback if needed.
