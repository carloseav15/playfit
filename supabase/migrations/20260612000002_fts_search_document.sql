-- FTS: add generated tsvector column for efficient search
begin;

-- Drop the old functional index (relies on immutable_array_to_string)
drop index if exists games_library.games_search_idx;

-- Add generated tsvector column
alter table games_library.games
  add column if not exists search_document tsvector
  generated always as (
    to_tsvector('english',
      coalesce(title, '') || ' ' ||
      coalesce(
        games_library.immutable_array_to_string(aliases, ' '),
        ''
      )
    )
  ) stored;

-- Index on the stored generated column
create index if not exists games_search_doc_idx
  on games_library.games
  using gin (search_document);

comment on column games_library.games.search_document is
  'Stored tsvector for full-text search on title and aliases';

commit;
