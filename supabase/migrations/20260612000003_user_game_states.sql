-- Normalize profiles.game_states JSONB into user_game_states table
begin;

-- ============================================================
-- 1. Create user_game_states table
-- ============================================================
create table if not exists games_library.user_game_states (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references games_library.profiles(user_id) on delete cascade,
  game_id     text not null references games_library.games(game_id) on delete cascade,
  status      text check (status in ('playing', 'on_hold', 'shelved', 'beaten', 'completed', 'abandoned', 'want_to_play')),
  rating      numeric(2,1) check (rating between 0 and 5),
  in_backlog  boolean not null default false,
  in_wishlist boolean not null default false,
  excluded    boolean not null default false,
  source      text not null check (source in ('onboarding', 'finder', 'manual')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, game_id)
);

create index if not exists user_game_states_user_idx
  on games_library.user_game_states (user_id);

create index if not exists user_game_states_game_idx
  on games_library.user_game_states (game_id);

-- ============================================================
-- 2. RLS: users can only see/manage their own states
-- ============================================================
alter table games_library.user_game_states enable row level security;

drop policy if exists own_game_states on games_library.user_game_states;
create policy own_game_states
  on games_library.user_game_states
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- SECURITY DEFINER functions bypass RLS, but grant explicit access for direct queries
grant select, insert, update, delete on games_library.user_game_states to authenticated;

-- ============================================================
-- 3. Backfill existing data from profiles.game_states JSONB
-- ============================================================
insert into games_library.user_game_states (user_id, game_id, status, rating, in_backlog, in_wishlist, excluded, source, created_at, updated_at)
select
  p.user_id,
  gs.key as game_id,
  (gs.value ->> 'status')::text as status,
  (gs.value ->> 'rating')::numeric(2,1) as rating,
  coalesce((gs.value ->> 'inBacklog')::boolean, false) as in_backlog,
  coalesce((gs.value ->> 'inWishlist')::boolean, false) as in_wishlist,
  coalesce((gs.value ->> 'excluded')::boolean, false) as excluded,
  coalesce(gs.value ->> 'source', 'manual') as source,
  coalesce((gs.value ->> 'createdAt')::timestamptz, now()) as created_at,
  coalesce((gs.value ->> 'updatedAt')::timestamptz, now()) as updated_at
from games_library.profiles p
cross join lateral jsonb_each(p.game_states) as gs
on conflict (user_id, game_id) do nothing;

-- ============================================================
-- 4. Trigger: sync user_game_states changes back to profiles.game_states
--    This ensures backward compatibility with existing code
--    that reads game_states from the profiles JSONB column.
-- ============================================================
create or replace function games_library.sync_profile_game_states()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' or tg_op = 'UPDATE' then
    update games_library.profiles
    set game_states = (
      select coalesce(jsonb_object_agg(ugs.game_id, jsonb_build_object(
        'status', ugs.status,
        'rating', ugs.rating,
        'inBacklog', ugs.in_backlog,
        'inWishlist', ugs.in_wishlist,
        'excluded', ugs.excluded,
        'source', ugs.source,
        'createdAt', ugs.created_at,
        'updatedAt', ugs.updated_at
      )), '{}'::jsonb)
      from games_library.user_game_states ugs
      where ugs.user_id = new.user_id
    ),
    updated_at = now()
    where user_id = new.user_id;
    return new;
  elsif tg_op = 'DELETE' then
    update games_library.profiles
    set game_states = (
      select coalesce(jsonb_object_agg(ugs.game_id, jsonb_build_object(
        'status', ugs.status,
        'rating', ugs.rating,
        'inBacklog', ugs.in_backlog,
        'inWishlist', ugs.in_wishlist,
        'excluded', ugs.excluded,
        'source', ugs.source,
        'createdAt', ugs.created_at,
        'updatedAt', ugs.updated_at
      )), '{}'::jsonb)
      from games_library.user_game_states ugs
      where ugs.user_id = old.user_id
    ),
    updated_at = now()
    where user_id = old.user_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists sync_profile_game_states_trigger on games_library.user_game_states;
create trigger sync_profile_game_states_trigger
  after insert or update or delete on games_library.user_game_states
  for each row
  execute function games_library.sync_profile_game_states();

-- Initial sync: rebuild profiles.game_states from user_game_states
update games_library.profiles p
set game_states = (
  select coalesce(jsonb_object_agg(ugs.game_id, jsonb_build_object(
    'status', ugs.status,
    'rating', ugs.rating,
    'inBacklog', ugs.in_backlog,
    'inWishlist', ugs.in_wishlist,
    'excluded', ugs.excluded,
    'source', ugs.source,
    'createdAt', ugs.created_at,
    'updatedAt', ugs.updated_at
  )), '{}'::jsonb)
  from games_library.user_game_states ugs
  where ugs.user_id = p.user_id
),
updated_at = now();

-- ============================================================
-- 5. New SECURITY DEFINER functions for per-game state operations
-- ============================================================

create or replace function games_library.get_game_states(p_user_id text)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select coalesce(jsonb_object_agg(ugs.game_id, jsonb_build_object(
    'status', ugs.status,
    'rating', ugs.rating,
    'inBacklog', ugs.in_backlog,
    'inWishlist', ugs.in_wishlist,
    'excluded', ugs.excluded,
    'source', ugs.source,
    'createdAt', ugs.created_at,
    'updatedAt', ugs.updated_at
  )), '{}'::jsonb)
  from games_library.user_game_states ugs
  where ugs.user_id = p_user_id::uuid;
$$;

create or replace function games_library.upsert_game_state(
  p_user_id    text,
  p_game_id    text,
  p_status     text default null,
  p_rating     numeric(2,1) default null,
  p_in_backlog boolean default null,
  p_in_wishlist boolean default null,
  p_excluded   boolean default null,
  p_source     text default 'manual'
) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into games_library.user_game_states (user_id, game_id, status, rating, in_backlog, in_wishlist, excluded, source)
  values (p_user_id::uuid, p_game_id, p_status, p_rating, coalesce(p_in_backlog, false), coalesce(p_in_wishlist, false), coalesce(p_excluded, false), p_source)
  on conflict (user_id, game_id) do update set
    status      = coalesce(p_status, user_game_states.status),
    rating      = coalesce(p_rating, user_game_states.rating),
    in_backlog  = coalesce(p_in_backlog, user_game_states.in_backlog),
    in_wishlist = coalesce(p_in_wishlist, user_game_states.in_wishlist),
    excluded    = coalesce(p_excluded, user_game_states.excluded),
    updated_at  = now();
end;
$$;

create or replace function games_library.delete_game_state(
  p_user_id text,
  p_game_id text
) returns void
language sql
security definer
set search_path = pg_catalog
as $$
  delete from games_library.user_game_states
  where user_id = p_user_id::uuid and game_id = p_game_id;
$$;

grant execute on function games_library.get_game_states to anon, authenticated;
grant execute on function games_library.upsert_game_state to anon, authenticated;
grant execute on function games_library.delete_game_state to anon, authenticated;

commit;
