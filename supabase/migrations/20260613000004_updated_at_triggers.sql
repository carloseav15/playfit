-- Add updated_at triggers to remaining catalog tables
begin;

-- ============================================================
-- 1. Add updated_at column to tables missing it
-- ============================================================

alter table games_library.genres
  add column if not exists updated_at timestamptz not null default now();

alter table games_library.series
  add column if not exists updated_at timestamptz not null default now();

alter table games_library.tags
  add column if not exists updated_at timestamptz not null default now();

alter table games_library.game_tags
  add column if not exists updated_at timestamptz not null default now();

alter table games_library.game_aliases
  add column if not exists updated_at timestamptz not null default now();

alter table games_library.game_platforms
  add column if not exists updated_at timestamptz not null default now();

-- ============================================================
-- 2. Add BEFORE UPDATE triggers using existing function
-- ============================================================

drop trigger if exists genres_set_updated_at on games_library.genres;
create trigger genres_set_updated_at
  before update on games_library.genres
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists series_set_updated_at on games_library.series;
create trigger series_set_updated_at
  before update on games_library.series
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists tags_set_updated_at on games_library.tags;
create trigger tags_set_updated_at
  before update on games_library.tags
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists game_tags_set_updated_at on games_library.game_tags;
create trigger game_tags_set_updated_at
  before update on games_library.game_tags
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists game_aliases_set_updated_at on games_library.game_aliases;
create trigger game_aliases_set_updated_at
  before update on games_library.game_aliases
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists game_platforms_set_updated_at on games_library.game_platforms;
create trigger game_platforms_set_updated_at
  before update on games_library.game_platforms
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists user_game_states_set_updated_at on games_library.user_game_states;
create trigger user_game_states_set_updated_at
  before update on games_library.user_game_states
  for each row
  execute function games_library.set_updated_at();

commit;
