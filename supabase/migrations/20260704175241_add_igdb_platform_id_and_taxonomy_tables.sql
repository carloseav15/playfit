-- Adds IGDB platform id mapping so release_dates (per-platform, more precise
-- than games.release_year) can be resolved to a local platform without
-- re-matching. Also adds three new lookup+junction taxonomies mirroring the
-- existing genres/game_genres pattern (pk bigint identity as real PK, id text
-- as unique slug), to receive IGDB's game_modes, themes and
-- player_perspectives (currently unmodeled fields, verified populated on
-- 65-81% of the 39k IGDB-linked games).
alter table games_library.platforms
  add column if not exists igdb_id integer;

create unique index if not exists platforms_igdb_id_key
  on games_library.platforms (igdb_id)
  where igdb_id is not null;

create table if not exists games_library.game_modes (
  pk bigint generated always as identity primary key,
  id text not null unique,
  name text not null unique,
  igdb_id integer unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists games_library.game_game_modes (
  game_ref bigint not null references games_library.games(pk) on delete cascade,
  mode_ref bigint not null references games_library.game_modes(pk) on delete cascade,
  game_id text not null,
  mode_id text not null,
  source text not null default 'igdb',
  created_at timestamptz not null default now(),
  primary key (game_ref, mode_ref)
);

create table if not exists games_library.themes (
  pk bigint generated always as identity primary key,
  id text not null unique,
  name text not null unique,
  igdb_id integer unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists games_library.game_themes (
  game_ref bigint not null references games_library.games(pk) on delete cascade,
  theme_ref bigint not null references games_library.themes(pk) on delete cascade,
  game_id text not null,
  theme_id text not null,
  source text not null default 'igdb',
  created_at timestamptz not null default now(),
  primary key (game_ref, theme_ref)
);

create table if not exists games_library.perspectives (
  pk bigint generated always as identity primary key,
  id text not null unique,
  name text not null unique,
  igdb_id integer unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists games_library.game_perspectives (
  game_ref bigint not null references games_library.games(pk) on delete cascade,
  perspective_ref bigint not null references games_library.perspectives(pk) on delete cascade,
  game_id text not null,
  perspective_id text not null,
  source text not null default 'igdb',
  created_at timestamptz not null default now(),
  primary key (game_ref, perspective_ref)
);

alter table games_library.game_modes enable row level security;
alter table games_library.game_game_modes enable row level security;
alter table games_library.themes enable row level security;
alter table games_library.game_themes enable row level security;
alter table games_library.perspectives enable row level security;
alter table games_library.game_perspectives enable row level security;

create policy "public read game_modes" on games_library.game_modes for select using (true);
create policy "public read game_game_modes" on games_library.game_game_modes for select using (true);
create policy "public read themes" on games_library.themes for select using (true);
create policy "public read game_themes" on games_library.game_themes for select using (true);
create policy "public read perspectives" on games_library.perspectives for select using (true);
create policy "public read game_perspectives" on games_library.game_perspectives for select using (true);
