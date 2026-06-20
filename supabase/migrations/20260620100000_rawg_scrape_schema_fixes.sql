-- RAWG scrape: schema fixes for full data ingestion
begin;

-- ============================================================
-- 1. Service role RLS policies for tables used by scrape-rawg
-- ============================================================

create policy "service_role_manage_games"
  on games_library.games to service_role
  using (true) with check (true);

create policy "service_role_manage_genres"
  on games_library.genres to service_role
  using (true) with check (true);

create policy "service_role_manage_tags"
  on games_library.tags to service_role
  using (true) with check (true);

create policy "service_role_manage_game_tags"
  on games_library.game_tags to service_role
  using (true) with check (true);

create policy "service_role_manage_game_platforms"
  on games_library.game_platforms to service_role
  using (true) with check (true);

create policy "service_role_manage_game_aliases"
  on games_library.game_aliases to service_role
  using (true) with check (true);

-- ============================================================
-- 2. Fix games table column constraints
-- ============================================================

alter table games_library.games
  alter column release_year drop not null,
  alter column sort_date drop not null;

-- ============================================================
-- 3. Add denormalized columns for platform info
-- ============================================================

alter table games_library.games
  add column if not exists platforms text[] not null default '{}';

alter table games_library.games
  add column if not exists platform_names text[] not null default '{}';

alter table games_library.games
  add column if not exists playtime integer;

commit;

-- Down:
-- begin;
--   drop policy if exists "service_role_manage_games" on games_library.games;
--   drop policy if exists "service_role_manage_genres" on games_library.genres;
--   drop policy if exists "service_role_manage_tags" on games_library.tags;
--   drop policy if exists "service_role_manage_game_tags" on games_library.game_tags;
--   drop policy if exists "service_role_manage_game_platforms" on games_library.game_platforms;
--   drop policy if exists "service_role_manage_game_aliases" on games_library.game_aliases;
--   alter table games_library.games alter column release_year set not null;
--   alter table games_library.games alter column sort_date set not null;
--   alter table games_library.games drop column if exists platforms;
--   alter table games_library.games drop column if exists platform_names;
--   alter table games_library.games drop column if exists playtime;
-- commit;
