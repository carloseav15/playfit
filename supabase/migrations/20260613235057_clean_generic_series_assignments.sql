-- Clean obvious generic vocabulary that was imported as game series.
-- This migration is intentionally conservative:
-- - exact series/genre name matches are cleared from games.series_id
-- - exact tag-only matches are queued for review, not auto-cleared
-- - original game_id -> series_id assignments are preserved for rollback
begin;

create schema if not exists games_library_private;

comment on schema games_library_private is
  'Private maintenance helpers for games_library. Not exposed through Supabase Data API.';

revoke all on schema games_library_private from public, anon, authenticated;
grant usage on schema games_library_private to service_role;

create table if not exists games_library.series_cleanup_candidates (
  series_id          text primary key references games_library.series(id) on update cascade on delete restrict,
  series_name        text not null,
  match_kind         text not null,
  matching_genre_ids text[] not null default '{}',
  matching_tag_ids   text[] not null default '{}',
  current_game_count int not null default 0 check (current_game_count >= 0),
  sample_game_ids    text[] not null default '{}',
  sample_titles      text[] not null default '{}',
  suggested_action   text not null,
  status             text not null,
  applied_game_count int not null default 0 check (applied_game_count >= 0),
  review_notes       text not null default '',
  reviewed_by        text,
  reviewed_at        timestamptz,
  applied_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint series_cleanup_candidates_match_kind_check check (
    match_kind in ('genre_name', 'tag_name', 'genre_and_tag_name')
  ),
  constraint series_cleanup_candidates_suggested_action_check check (
    suggested_action in ('auto_clear_series_id', 'review_keep_or_clear')
  ),
  constraint series_cleanup_candidates_status_check check (
    status in ('needs_review', 'approved_auto_clear', 'applied', 'ignored', 'restored')
  )
);

comment on table games_library.series_cleanup_candidates is
  'Review and audit queue for series rows that look like generic genre/tag vocabulary rather than franchises.';
comment on column games_library.series_cleanup_candidates.suggested_action is
  'Exact genre-name matches are safe to clear automatically; tag-only matches require review because some tags can also be IP/franchise names.';

create index if not exists series_cleanup_candidates_status_idx
  on games_library.series_cleanup_candidates (status, suggested_action);

alter table games_library.series_cleanup_candidates enable row level security;

drop policy if exists service_role_manage_series_cleanup_candidates
  on games_library.series_cleanup_candidates;
create policy service_role_manage_series_cleanup_candidates
  on games_library.series_cleanup_candidates
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library.series_cleanup_candidates from public, anon, authenticated;
grant select, insert, update, delete on table games_library.series_cleanup_candidates to service_role;

drop trigger if exists series_cleanup_candidates_set_updated_at
  on games_library.series_cleanup_candidates;
create trigger series_cleanup_candidates_set_updated_at
  before update on games_library.series_cleanup_candidates
  for each row
  execute function games_library.set_updated_at();

create table if not exists games_library.series_cleanup_applied (
  game_id          text primary key references games_library.games(game_id) on update cascade on delete restrict,
  title_snapshot   text not null,
  old_series_id    text not null references games_library.series(id) on update cascade on delete restrict,
  old_series_name  text not null,
  reason           text not null,
  applied_by       text not null default 'migration_20260613235057',
  applied_at       timestamptz not null default now(),
  restored_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint series_cleanup_applied_reason_check check (
    reason in ('series_name_matches_genre')
  )
);

comment on table games_library.series_cleanup_applied is
  'Rollback ledger for games whose series_id was cleared because the series name matched generic genre vocabulary.';
comment on column games_library.series_cleanup_applied.old_series_id is
  'Original games.series_id value before cleanup. Use this to restore if needed.';

create index if not exists series_cleanup_applied_old_series_idx
  on games_library.series_cleanup_applied (old_series_id);

alter table games_library.series_cleanup_applied enable row level security;

drop policy if exists service_role_manage_series_cleanup_applied
  on games_library.series_cleanup_applied;
create policy service_role_manage_series_cleanup_applied
  on games_library.series_cleanup_applied
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library.series_cleanup_applied from public, anon, authenticated;
grant select, insert, update, delete on table games_library.series_cleanup_applied to service_role;

drop trigger if exists series_cleanup_applied_set_updated_at
  on games_library.series_cleanup_applied;
create trigger series_cleanup_applied_set_updated_at
  before update on games_library.series_cleanup_applied
  for each row
  execute function games_library.set_updated_at();

create or replace function games_library_private.refresh_series_cleanup_candidates()
returns int
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_upserted int := 0;
begin
  with genre_matches as (
    select
      s.id as series_id,
      array_agg(gr.id order by gr.id) as matching_genre_ids
    from games_library.series s
    join games_library.genres gr
      on lower(btrim(s.name)) = lower(btrim(gr.name))
    group by s.id
  ),
  tag_matches as (
    select
      s.id as series_id,
      array_agg(t.id order by t.id) as matching_tag_ids
    from games_library.series s
    join games_library.tags t
      on lower(btrim(s.name)) = lower(btrim(t.name))
    group by s.id
  ),
  source as (
    select
      s.id as series_id,
      s.name as series_name,
      case
        when gm.series_id is not null and tm.series_id is not null then 'genre_and_tag_name'
        when gm.series_id is not null then 'genre_name'
        else 'tag_name'
      end as match_kind,
      coalesce(gm.matching_genre_ids, array[]::text[]) as matching_genre_ids,
      coalesce(tm.matching_tag_ids, array[]::text[]) as matching_tag_ids,
      stats.current_game_count,
      coalesce(stats.sample_game_ids, array[]::text[]) as sample_game_ids,
      coalesce(stats.sample_titles, array[]::text[]) as sample_titles,
      case
        when gm.series_id is not null then 'auto_clear_series_id'
        else 'review_keep_or_clear'
      end as suggested_action,
      case
        when gm.series_id is not null then 'approved_auto_clear'
        else 'needs_review'
      end as initial_status
    from games_library.series s
    left join genre_matches gm on gm.series_id = s.id
    left join tag_matches tm on tm.series_id = s.id
    cross join lateral (
      select
        count(g.game_id)::int as current_game_count,
        (array_agg(g.game_id order by g.title, g.game_id))[1:20] as sample_game_ids,
        (array_agg(g.title order by g.title, g.game_id))[1:20] as sample_titles
      from games_library.games g
      where g.series_id = s.id
    ) stats
    where gm.series_id is not null
       or tm.series_id is not null
  ),
  upserted as (
    insert into games_library.series_cleanup_candidates (
      series_id,
      series_name,
      match_kind,
      matching_genre_ids,
      matching_tag_ids,
      current_game_count,
      sample_game_ids,
      sample_titles,
      suggested_action,
      status
    )
    select
      series_id,
      series_name,
      match_kind,
      matching_genre_ids,
      matching_tag_ids,
      current_game_count,
      sample_game_ids,
      sample_titles,
      suggested_action,
      initial_status
    from source
    on conflict (series_id) do update set
      series_name = excluded.series_name,
      match_kind = excluded.match_kind,
      matching_genre_ids = excluded.matching_genre_ids,
      matching_tag_ids = excluded.matching_tag_ids,
      current_game_count = excluded.current_game_count,
      sample_game_ids = excluded.sample_game_ids,
      sample_titles = excluded.sample_titles,
      suggested_action = excluded.suggested_action,
      updated_at = now()
    returning 1
  )
  select count(*)::int into v_upserted from upserted;

  return v_upserted;
end;
$$;

comment on function games_library_private.refresh_series_cleanup_candidates() is
  'Refreshes generic-vocabulary series cleanup candidates without overwriting human review status.';

revoke all on function games_library_private.refresh_series_cleanup_candidates()
  from public, anon, authenticated;
grant execute on function games_library_private.refresh_series_cleanup_candidates()
  to service_role;

create or replace function games_library_private.apply_generic_series_cleanup()
returns table(candidates_refreshed int, games_cleared int)
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_candidates int := 0;
  v_games int := 0;
begin
  select games_library_private.refresh_series_cleanup_candidates()
  into v_candidates;

  with inserted as (
    insert into games_library.series_cleanup_applied (
      game_id,
      title_snapshot,
      old_series_id,
      old_series_name,
      reason
    )
    select
      g.game_id,
      g.title,
      g.series_id,
      c.series_name,
      'series_name_matches_genre'
    from games_library.games g
    join games_library.series_cleanup_candidates c
      on c.series_id = g.series_id
    where c.suggested_action = 'auto_clear_series_id'
      and c.status in ('approved_auto_clear', 'applied')
    on conflict (game_id) do nothing
    returning game_id, old_series_id
  ),
  cleared as (
    update games_library.games g
    set series_id = null
    from inserted i
    where g.game_id = i.game_id
      and g.series_id = i.old_series_id
    returning g.game_id
  )
  select count(*)::int into v_games from cleared;

  update games_library.series_cleanup_candidates c
  set
    status = case
      when c.suggested_action = 'auto_clear_series_id' then 'applied'
      else c.status
    end,
    applied_game_count = coalesce(a.applied_game_count, 0),
    applied_at = case
      when c.suggested_action = 'auto_clear_series_id'
       and coalesce(a.applied_game_count, 0) > 0
      then now()
      else c.applied_at
    end,
    updated_at = now()
  from (
    select old_series_id as series_id, count(*)::int as applied_game_count
    from games_library.series_cleanup_applied
    where restored_at is null
    group by old_series_id
  ) a
  where c.series_id = a.series_id;

  perform games_library_private.refresh_series_cleanup_candidates();

  return query select v_candidates, v_games;
end;
$$;

comment on function games_library_private.apply_generic_series_cleanup() is
  'Clears games.series_id only for review-approved generic series/genre matches and records every changed game for rollback.';

revoke all on function games_library_private.apply_generic_series_cleanup()
  from public, anon, authenticated;
grant execute on function games_library_private.apply_generic_series_cleanup()
  to service_role;

select * from games_library_private.apply_generic_series_cleanup();

commit;

-- Down:
-- begin;
-- update games_library.games g
-- set series_id = a.old_series_id
-- from games_library.series_cleanup_applied a
-- where g.game_id = a.game_id
--   and g.series_id is null
--   and a.restored_at is null;
-- drop function if exists games_library_private.apply_generic_series_cleanup();
-- drop function if exists games_library_private.refresh_series_cleanup_candidates();
-- drop table if exists games_library.series_cleanup_applied;
-- drop table if exists games_library.series_cleanup_candidates;
-- commit;
