begin;

-- Improve games_library schema: types, constraints, full-text search, and indexes

-- 1. Drop text defaults that block type conversion
alter table games_library.games
  alter column sort_date drop default,
  alter column release_year drop default;

-- 2. Normalize sort_date: null out empty/invalid values, backfill from release_year
update games_library.games
set sort_date = null
where sort_date is null or sort_date = '' or sort_date !~ '^\d{4}-\d{2}-\d{2}$';

update games_library.games
set sort_date = release_year || '-07-01'
where sort_date is null
  and release_year ~ '^\d{4}$'
  and release_year::integer between 1950 and 2030;

alter table games_library.games
  alter column sort_date type date
  using sort_date::date;

-- 3. release_year: text -> integer, null out invalid values
alter table games_library.games
  alter column release_year type integer
  using case
    when release_year ~ '^\d{4}$' and release_year::integer between 1950 and 2030
    then release_year::integer
    else null
  end;

-- 4. Check constraints for enum-like columns
alter table games_library.games add constraint valid_release_state
  check (release_state in ('released', 'unreleased'));

alter table games_library.games add constraint valid_source_type
  check (source_type in ('catalog', 'universe', 'finder'));

-- 5. Full-text search index
-- array_to_string is STABLE in PG17, not IMMUTABLE, so we wrap it
create or replace function games_library.immutable_array_to_string(arr text[], sep text)
returns text
language sql
immutable
as $$
  select array_to_string(arr, sep);
$$;

create index games_search_idx
  on games_library.games
  using gin (to_tsvector('english',
    coalesce(title, '') || ' ' ||
    coalesce(games_library.immutable_array_to_string(aliases, ' '), '')
  ));

-- 6. Additional indexes
create index games_release_year_idx
  on games_library.games (release_year);

commit;
