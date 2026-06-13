begin;

-- Fase 2: Normalizar series → tabla series + FK en games

create table if not exists games_library.series (
  id   text primary key,
  name text not null unique
);

comment on table games_library.series is 'Game series/franchises controlled vocabulary';
comment on column games_library.series.id is 'URL-safe slug, e.g. the_legend_of_zelda';
comment on column games_library.series.name is 'Display name, e.g. The Legend of Zelda';

-- Poblar desde valores existentes
insert into games_library.series (id, name)
select distinct
  regexp_replace(lower(trim(series)), '[^a-z0-9]+', '_', 'g'),
  series
from games_library.games
where series is not null and series != ''
on conflict (id) do nothing;

-- Agregar FK (se conserva series como columna denormalizada durante transición)
alter table games_library.games
  add column if not exists series_id text references games_library.series(id);

-- Migrar datos existentes
update games_library.games g
set series_id = (
  select id from games_library.series
  where name = g.series
)
where g.series is not null and g.series != '';

comment on column games_library.games.series_id is 'FK to series table (normalized)';

commit;
