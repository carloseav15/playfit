-- Audit fixes: profiles.user_id uuid, RLS, missing indexes, game_aliases sync, tags.name, rate_limits
begin;

-- ============================================================
-- 1. Fix profiles.user_id type: text -> uuid
--    Drop policies first (they depend on user_id column),
--    alter column, then recreate with native uuid comparison.
-- ============================================================
drop policy if exists select_own_profile on games_library.profiles;
drop policy if exists insert_own_profile on games_library.profiles;
drop policy if exists update_own_profile on games_library.profiles;

alter table games_library.profiles
  alter column user_id type uuid
  using user_id::uuid;

create policy select_own_profile
  on games_library.profiles
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy insert_own_profile
  on games_library.profiles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy update_own_profile
  on games_library.profiles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- 2. Missing index on game_aliases.game_id
-- ============================================================
create index if not exists game_aliases_game_idx
  on games_library.game_aliases (game_id);

-- ============================================================
-- 3. Sync trigger: game_aliases INSERT/DELETE -> games.aliases[]
-- ============================================================
create or replace function games_library.sync_game_aliases()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    update games_library.games
    set aliases = (
      select array_agg(alias order by alias)
      from games_library.game_aliases
      where game_id = new.game_id
    )
    where game_id = new.game_id;
    return new;
  elsif tg_op = 'DELETE' then
    update games_library.games
    set aliases = coalesce(
      (select array_agg(alias order by alias)
       from games_library.game_aliases
       where game_id = old.game_id),
      '{}'::text[]
    )
    where game_id = old.game_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists game_aliases_sync on games_library.game_aliases;
create trigger game_aliases_sync
  after insert or delete on games_library.game_aliases
  for each row
  execute function games_library.sync_game_aliases();

-- Sync existing data: rebuild games.aliases[] from game_aliases
update games_library.games g
set aliases = coalesce(
  (select array_agg(alias order by alias)
   from games_library.game_aliases ga
   where ga.game_id = g.game_id),
  '{}'::text[]
);

-- ============================================================
-- 4. Add name column to tags table
-- ============================================================
alter table games_library.tags
  add column if not exists name text;

update games_library.tags set name = id where name is null;

alter table games_library.tags
  alter column name set not null;

-- ============================================================
-- 5. Rate limit tracking table
-- ============================================================
create table if not exists games_library.rate_limits (
  id           bigint generated always as identity primary key,
  ip_address   text not null,
  endpoint     text not null,
  requested_at timestamptz not null default now()
);

create index if not exists rate_limits_lookup_idx
  on games_library.rate_limits (ip_address, endpoint, requested_at);

create index if not exists rate_limits_cleanup_idx
  on games_library.rate_limits (requested_at);

grant insert on games_library.rate_limits to anon, authenticated, service_role;
grant select on games_library.rate_limits to service_role;

-- ============================================================
-- 6. SECURITY DEFINER functions for profile access
--    (removes need for service_role key in API route)
-- ============================================================
create or replace function games_library.get_profile(p_user_id text)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'game_states', p.game_states,
    'profile', p.profile,
    'onboarding', p.onboarding,
    'created_at', p.created_at
  )
  from games_library.profiles p
  where p.user_id = p_user_id::uuid;
$$;

create or replace function games_library.upsert_profile(
  p_user_id    text,
  p_game_states jsonb,
  p_profile    jsonb,
  p_onboarding jsonb
) returns void
language sql
security definer
set search_path = pg_catalog
as $$
  insert into games_library.profiles (user_id, game_states, profile, onboarding)
  values (p_user_id::uuid, p_game_states, p_profile, p_onboarding)
  on conflict (user_id) do update set
    game_states  = excluded.game_states,
    profile      = excluded.profile,
    onboarding   = excluded.onboarding,
    updated_at   = now();
$$;

create or replace function games_library.delete_profile(p_user_id text)
returns void
language sql
security definer
set search_path = pg_catalog
as $$
  delete from games_library.profiles where user_id = p_user_id::uuid;
$$;

create or replace function games_library.migrate_profile(
  p_from_user_id text,
  p_to_user_id   text,
  p_onboarding   jsonb
) returns void
language sql
security definer
set search_path = pg_catalog
as $$
  insert into games_library.profiles (user_id, game_states, profile, onboarding)
  select p_to_user_id::uuid, game_states, profile, p_onboarding
  from games_library.profiles
  where user_id = p_from_user_id::uuid
  on conflict (user_id) do update set
    game_states  = excluded.game_states,
    profile      = excluded.profile,
    onboarding   = excluded.onboarding,
    updated_at   = now();
$$;

grant execute on function games_library.get_profile to anon, authenticated;
grant execute on function games_library.upsert_profile to anon, authenticated;
grant execute on function games_library.delete_profile to anon, authenticated;
grant execute on function games_library.migrate_profile to anon, authenticated;

-- ============================================================
-- 7. Profile level-security: anon can read/write own profile via SECURITY DEFINER
--    Drop direct table access for anon
-- ============================================================
revoke all on games_library.profiles from anon;

commit;
