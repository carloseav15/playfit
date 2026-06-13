begin;

-- Normalize platforms: replace games.platforms text[] with game_platforms join table

-- 1. Create join table
create table if not exists games_library.game_platforms (
  game_id     text not null references games_library.games(game_id) on delete cascade,
  platform_id text not null references games_library.platforms(id) on delete cascade,
  primary key (game_id, platform_id)
);

create index game_platforms_game_idx on games_library.game_platforms (game_id);
create index game_platforms_platform_idx on games_library.game_platforms (platform_id);

-- 2. Migrate existing data
insert into games_library.game_platforms (game_id, platform_id)
select g.game_id, unnest(g.platforms)
from games_library.games g
where array_length(g.platforms, 1) > 0;

-- 3. Drop denormalized columns
drop index if exists games_library.games_platforms_gin_idx;

alter table games_library.games
  drop column if exists platforms,
  drop column if exists platform_names;

commit;
