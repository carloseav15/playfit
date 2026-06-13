begin;

-- Fase 6: Limpieza final — timestamps, drop denormalized columns, comments

-- 1. Drop denormalized columns reemplazadas por FKs
alter table games_library.games
  drop column if exists primary_genre,
  drop column if exists series;

-- 2. Timestamps en tablas de catálogo
alter table games_library.games
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table games_library.platforms
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table games_library.game_platforms
  add column if not exists created_at timestamptz not null default now();

alter table games_library.game_tags
  add column if not exists created_at timestamptz not null default now();

alter table games_library.game_aliases
  add column if not exists created_at timestamptz not null default now();

-- 3. Comments faltantes
comment on table games_library.games is 'Master game catalog. Each row is a unique game title.';
comment on column games_library.games.game_id is 'Unique slug/identifier, e.g. rawg_zelda_breath_of_the_wild';
comment on column games_library.games.title is 'Display title';
comment on column games_library.games.aliases is 'Alternative names for search (denormalized cache of game_aliases)';
comment on column games_library.games.tags is 'Gameplay tags (denormalized cache of game_tags)';
comment on column games_library.games.genre_id is 'FK to genres table (normalized)';
comment on column games_library.games.series_id is 'FK to series table (normalized)';
comment on column games_library.games.source_type is 'Origin: catalog (verified), universe (expanded), finder (scraped)';
comment on column games_library.games.source_ref is 'External reference URL or ID (e.g. rawg:12345)';
comment on column games_library.games.cover_url is 'Cover image path or URL';
comment on column games_library.games.sort_date is 'Sortable date for ordering in lists';
comment on column games_library.games.release_label is 'Display label for release (e.g. Q1 2025)';
comment on column games_library.games.created_at is 'When the record was first inserted';
comment on column games_library.games.updated_at is 'When the record was last updated';

comment on table games_library.game_platforms is 'Many-to-many join: which games are available on which platforms';
comment on column games_library.game_platforms.game_id is 'FK to games table';
comment on column games_library.game_platforms.platform_id is 'FK to platforms table';

commit;
