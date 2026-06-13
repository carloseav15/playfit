begin;

create schema if not exists games_library;

create table if not exists games_library.platforms (
  id text primary key,
  name text not null,
  rawg_id integer
);

create table if not exists games_library.games (
  game_id text primary key,
  title text not null,
  aliases text[] not null default '{}',
  series text not null default '',
  primary_genre text not null default '',
  platforms text[] not null default '{}',
  platform_names text[] not null default '{}',
  release_year text not null default '',
  release_state text not null default 'released',
  source_type text not null default 'finder',
  source_ref text not null default '',
  cover_url text not null default '',
  tags text[] not null default '{}',
  notes text not null default '',
  sort_date text not null default '',
  release_label text not null default ''
);

create table if not exists games_library.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  game_states jsonb not null default '{}'::jsonb,
  profile jsonb,
  onboarding jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on schema games_library is 'Playfit catalog and profile data.';
comment on table games_library.profiles is
  'Authenticated profiles use auth.uid() as user_id. Local anonymous profiles are browser device IDs and must only be accessed through the server API service-role boundary.';

create index if not exists games_title_idx on games_library.games using btree (title);
create index if not exists games_source_type_idx on games_library.games using btree (source_type);
create index if not exists games_release_state_idx on games_library.games using btree (release_state);
create index if not exists games_platforms_gin_idx on games_library.games using gin (platforms);
create index if not exists games_tags_gin_idx on games_library.games using gin (tags);
create index if not exists profiles_user_id_idx on games_library.profiles using btree (user_id);

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

drop trigger if exists profiles_set_updated_at on games_library.profiles;
create trigger profiles_set_updated_at
before update on games_library.profiles
for each row
execute function games_library.set_updated_at();

grant usage on schema games_library to anon, authenticated, service_role;
grant select on table games_library.games to anon, authenticated;
grant select on table games_library.platforms to anon, authenticated;
grant select, insert, update on table games_library.profiles to authenticated;
grant all privileges on all tables in schema games_library to service_role;
grant all privileges on all routines in schema games_library to service_role;
revoke all on table games_library.profiles from anon;

alter table games_library.games enable row level security;
alter table games_library.platforms enable row level security;
alter table games_library.profiles enable row level security;

drop policy if exists select_games on games_library.games;
create policy select_games
on games_library.games
for select
to anon, authenticated
using (true);

drop policy if exists select_platforms on games_library.platforms;
create policy select_platforms
on games_library.platforms
for select
to anon, authenticated
using (true);

drop policy if exists select_own_profile on games_library.profiles;
create policy select_own_profile
on games_library.profiles
for select
to authenticated
using ((select auth.uid())::text = user_id);

drop policy if exists insert_own_profile on games_library.profiles;
create policy insert_own_profile
on games_library.profiles
for insert
to authenticated
with check ((select auth.uid())::text = user_id);

drop policy if exists update_own_profile on games_library.profiles;
create policy update_own_profile
on games_library.profiles
for update
to authenticated
using ((select auth.uid())::text = user_id)
with check ((select auth.uid())::text = user_id);

update games_library.games
set cover_url = ''
where cover_url like '/covers/%'
  and cover_url not like '/covers/games/%';

update games_library.games
set cover_url = ''
where game_id in (
  'donkey_kong_country_3_duplicate',
  'final_fantasy_crystal_chronicles_remastered_edition_duplicate'
)
and (
  cover_url like '/covers/games/%'
  or cover_url like 'covers/games/%'
);

commit;
