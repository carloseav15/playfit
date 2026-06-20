-- Backfill safe aliases from approved local external titles.
-- Genre candidates are exposed as review-only because tag-derived genre
-- inference can be wrong for hybrids such as RPG/shooter games.
begin;

create table if not exists games_library_private.safe_alias_backfill_runs (
  run_id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  aliases_inserted int not null default 0,
  games_alias_cache_synced int not null default 0,
  notes text not null default ''
);

alter table games_library_private.safe_alias_backfill_runs enable row level security;

drop policy if exists service_role_manage_safe_alias_backfill_runs
  on games_library_private.safe_alias_backfill_runs;
create policy service_role_manage_safe_alias_backfill_runs
  on games_library_private.safe_alias_backfill_runs
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library_private.safe_alias_backfill_runs
  from public, anon, authenticated;
grant select, insert, update, delete on table games_library_private.safe_alias_backfill_runs
  to service_role;

do $$
declare
  v_run_id uuid;
  v_existing_status text;
  v_aliases_inserted int := 0;
  v_games_alias_cache_synced int := 0;
begin
  select status
  into v_existing_status
  from games_library_private.safe_alias_backfill_runs
  where run_key = '20260620_backfill_safe_aliases';

  if v_existing_status = 'completed' then
    raise notice 'Safe alias backfill already completed; skipping.';
    return;
  elsif v_existing_status is not null then
    raise exception 'Previous safe alias backfill run is %, refusing to continue', v_existing_status;
  end if;

  insert into games_library_private.safe_alias_backfill_runs (run_key, notes)
  values (
    '20260620_backfill_safe_aliases',
    'Backfill aliases from source titles already linked to live games; do not infer genres automatically.'
  )
  returning run_id into v_run_id;

  with alias_candidates as (
    select e.game_id, btrim(e.source_title) as alias
    from games_library.game_external_ids e
    join games_library.games g on g.game_id = e.game_id
    where btrim(coalesce(e.source_title, '')) <> ''
      and lower(btrim(e.source_title)) <> lower(btrim(g.title))
      and length(btrim(e.source_title)) <= 200
    union
    select c.game_id, btrim(c.source_title) as alias
    from games_library.game_external_match_candidates c
    join games_library.games g on g.game_id = c.game_id
    where c.status in ('auto_approved', 'approved')
      and btrim(coalesce(c.source_title, '')) <> ''
      and lower(btrim(c.source_title)) <> lower(btrim(g.title))
      and length(btrim(c.source_title)) <= 200
  ),
  inserted as (
    insert into games_library.game_aliases (game_id, alias)
    select game_id, alias
    from alias_candidates ac
    where not exists (
      select 1
      from games_library.game_aliases existing
      where existing.game_id = ac.game_id
        and lower(existing.alias) = lower(ac.alias)
    )
    on conflict (game_id, alias) do nothing
    returning 1
  )
  select count(*)::int
  into v_aliases_inserted
  from inserted;

  if v_aliases_inserted <> 132 then
    raise exception 'Expected to insert 132 safe aliases, inserted %', v_aliases_inserted;
  end if;

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
  into v_games_alias_cache_synced
  from synced;

  update games_library_private.safe_alias_backfill_runs
  set
    completed_at = now(),
    status = 'completed',
    aliases_inserted = v_aliases_inserted,
    games_alias_cache_synced = v_games_alias_cache_synced
  where run_id = v_run_id;
end;
$$;

create or replace view games_library.genre_backfill_review_candidates
with (security_invoker = true)
as
with candidates as (
  select
    g.game_id,
    g.title,
    g.release_year,
    array_agg(distinct t.name order by t.name) as matching_tag_names,
    min(ge.id) as candidate_genre_id,
    min(ge.name) as candidate_genre_name,
    count(distinct ge.id) as candidate_genre_count
  from games_library.games g
  join games_library.game_tags gt on gt.game_id = g.game_id
  join games_library.tags t on t.id = gt.tag_id
  join games_library.genres ge on lower(ge.name) = lower(t.name)
  where g.genre_id is null
  group by g.game_id, g.title, g.release_year
)
select
  game_id,
  title,
  release_year,
  matching_tag_names,
  candidate_genre_id,
  candidate_genre_name,
  'review_required_tag_genre_inference'::text as review_lane,
  'Do not auto-apply: tag-derived genre can be wrong for hybrids. Review title/source metadata first.'::text as review_instruction
from candidates
where candidate_genre_count = 1;

comment on view games_library.genre_backfill_review_candidates is
  'Review-only candidates where a missing game genre has exactly one tag matching a genre name. Not auto-applied because tag-derived genre inference can be wrong.';

revoke all on table games_library.genre_backfill_review_candidates
  from public, anon, authenticated;
grant select on table games_library.genre_backfill_review_candidates
  to service_role;

commit;

-- Down:
-- Intentionally not auto-reversed. Aliases are additive and source-backed;
-- genre candidates are review-only.
