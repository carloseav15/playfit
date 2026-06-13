-- DB Audit Fixes: RLS, grants, missing indexes, updated_at triggers, tags sync
-- Implements priority items from audit:
--   1a. RLS + grants on all catalog tables
--   1b. Indexes on games.genre_id and games.series_id
--   1c. updated_at triggers for games, platforms
--   3c. Trigger sync game_tags -> games.tags[]

begin;

-- ============================================================
-- 1a. RLS + grants on catalog tables missing them
-- ============================================================

-- Enable RLS
alter table games_library.game_platforms enable row level security;
alter table games_library.game_tags enable row level security;
alter table games_library.game_aliases enable row level security;
alter table games_library.genres enable row level security;
alter table games_library.series enable row level security;
alter table games_library.tags enable row level security;

-- Grant SELECT to anon and authenticated
grant select on games_library.game_platforms to anon, authenticated;
grant select on games_library.game_tags to anon, authenticated;
grant select on games_library.game_aliases to anon, authenticated;
grant select on games_library.genres to anon, authenticated;
grant select on games_library.series to anon, authenticated;
grant select on games_library.tags to anon, authenticated;

-- SELECT policies (catalog data is world-readable)
create policy select_all on games_library.game_platforms
  for select to anon, authenticated using (true);

create policy select_all on games_library.game_tags
  for select to anon, authenticated using (true);

create policy select_all on games_library.game_aliases
  for select to anon, authenticated using (true);

create policy select_all on games_library.genres
  for select to anon, authenticated using (true);

create policy select_all on games_library.series
  for select to anon, authenticated using (true);

create policy select_all on games_library.tags
  for select to anon, authenticated using (true);

-- ============================================================
-- 1b. Missing indexes on games FKs
-- ============================================================

create index if not exists games_genre_id_idx
  on games_library.games (genre_id);

create index if not exists games_series_id_idx
  on games_library.games (series_id);

-- ============================================================
-- 1c. updated_at triggers for games and platforms
-- ============================================================

create or replace function games_library.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists games_set_updated_at on games_library.games;
create trigger games_set_updated_at
  before update on games_library.games
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists platforms_set_updated_at on games_library.platforms;
create trigger platforms_set_updated_at
  before update on games_library.platforms
  for each row
  execute function games_library.set_updated_at();

-- ============================================================
-- 3c. Sync trigger: game_tags INSERT/DELETE -> games.tags[]
-- ============================================================

create or replace function games_library.sync_game_tags()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    update games_library.games
    set tags = (
      select array_agg(tag_id order by tag_id)
      from games_library.game_tags
      where game_id = new.game_id
    )
    where game_id = new.game_id;
    return new;
  elsif tg_op = 'DELETE' then
    update games_library.games
    set tags = coalesce(
      (select array_agg(tag_id order by tag_id)
       from games_library.game_tags
       where game_id = old.game_id),
      '{}'::text[]
    )
    where game_id = old.game_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists game_tags_sync on games_library.game_tags;
create trigger game_tags_sync
  after insert or delete on games_library.game_tags
  for each row
  execute function games_library.sync_game_tags();

-- Sync existing data: rebuild games.tags[] from game_tags
update games_library.games g
set tags = coalesce(
  (select array_agg(tag_id order by tag_id)
   from games_library.game_tags gt
   where gt.game_id = g.game_id),
  '{}'::text[]
);

commit;
