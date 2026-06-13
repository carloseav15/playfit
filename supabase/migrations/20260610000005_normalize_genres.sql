begin;

-- Fase 1: Normalizar primary_genre → tabla genres + FK en games

create table if not exists games_library.genres (
  id   text primary key,
  name text not null unique
);

comment on table games_library.genres is 'Controlled vocabulary of game genres';
comment on column games_library.genres.id is 'URL-safe slug, e.g. role_playing_games_rpg';
comment on column games_library.genres.name is 'Display name, e.g. Role-Playing Games (RPG)';

-- Poblar desde valores existentes
insert into games_library.genres (id, name)
select distinct
  regexp_replace(lower(trim(primary_genre)), '[^a-z0-9]+', '_', 'g'),
  primary_genre
from games_library.games
where primary_genre is not null and primary_genre != ''
on conflict (id) do nothing;

-- Agregar FK (se conserva primary_genre como columna denormalizada durante transición)
alter table games_library.games
  add column if not exists genre_id text references games_library.genres(id);

-- Migrar datos existentes
update games_library.games g
set genre_id = (
  select id from games_library.genres
  where name = g.primary_genre
)
where g.primary_genre is not null and g.primary_genre != '';

comment on column games_library.games.genre_id is 'FK to genres table (normalized)';

commit;
