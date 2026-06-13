begin;

-- Fase 5: Normalizar aliases → tabla game_aliases
-- Se mantiene games.aliases text[] como columna denormalizada durante transición

create table if not exists games_library.game_aliases (
  game_id text not null references games_library.games(game_id) on delete cascade,
  alias   text not null,
  primary key (game_id, alias)
);

create index if not exists game_aliases_alias_idx on games_library.game_aliases (alias);

comment on table games_library.game_aliases is 'Alternative/search names for games';
comment on column games_library.game_aliases.game_id is 'FK to games table';
comment on column games_library.game_aliases.alias is 'Alternative name for search';

-- Migrar datos existentes desde games.aliases array
insert into games_library.game_aliases (game_id, alias)
select g.game_id, unnest(g.aliases)
from games_library.games g
where array_length(g.aliases, 1) > 0
on conflict (game_id, alias) do nothing;

commit;
