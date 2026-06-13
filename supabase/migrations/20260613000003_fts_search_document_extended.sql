-- Extend FTS search_document to include series and genre names
-- Use IMMUTABLE wrapper functions to enable index on cross-table lookups
begin;

-- Immutable wrappers for cross-table name lookups (safe for index expressions)
create or replace function games_library.get_series_name(p_id text)
returns text
language sql
immutable
parallel safe
as $$
  select name from games_library.series where id = p_id;
$$;

create or replace function games_library.get_genre_name(p_id text)
returns text
language sql
immutable
parallel safe
as $$
  select name from games_library.genres where id = p_id;
$$;

-- Drop old index first
drop index if exists games_library.games_search_doc_idx;

-- Recreate stored column with series and genre names included
alter table games_library.games
  drop column if exists search_document;

alter table games_library.games
  add column search_document tsvector
  generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(games_library.immutable_array_to_string(aliases, ' '), '') || ' ' ||
      coalesce(games_library.get_series_name(series_id), '') || ' ' ||
      coalesce(games_library.get_genre_name(genre_id), '')
    )
  ) stored;

-- Recreate index on stored column
create index if not exists games_search_doc_idx
  on games_library.games
  using gin (search_document);

comment on column games_library.games.search_document is
  'Stored tsvector for full-text search on title, aliases, series name, and genre name';

commit;
