-- Restore data from games_library_old (dump) into games_library (current schema)
-- Excludes: profiles, test_insert_2024

begin;

-- ============================================================
-- Phase 1: Prepare target tables
-- ============================================================

truncate games_library.games cascade;
truncate games_library.genres cascade;
truncate games_library.series cascade;
truncate games_library.game_platforms cascade;
truncate games_library.game_tags cascade;
truncate games_library.game_aliases cascade;

-- ============================================================
-- Phase 2: Normalize series (filtering contamination)
-- ============================================================

with clean_series as (
  select distinct trim(o.series) as name
  from games_library_old.games o
  where o.series is not null
    and o.series != ''
    and o.series !~ '^[a-z][a-z_]*(;[a-z][a-z_]*)*$'
    and o.series not in ('Standalone', 'Atlus', 'Supergiant', 'Vanillaware', 'Remedy', 'Quantic Dream', 'Test Series')
)
insert into games_library.series (id, name)
select
  regexp_replace(lower(name), '[^a-z0-9]+', '_', 'g'),
  name
from clean_series
on conflict (id) do nothing;

-- ============================================================
-- Phase 3: Normalize genres (parse primary_genre, take first token)
-- ============================================================

with genre_tokens as (
  select distinct trim(regexp_split_to_table(o.primary_genre, ';')) as token
  from games_library_old.games o
  where o.primary_genre is not null
    and o.primary_genre != ''
)
insert into games_library.genres (id, name)
select
  regexp_replace(lower(token), '[^a-z0-9]+', '_', 'g'),
  initcap(replace(token, '_', ' '))
from genre_tokens
where token != ''
on conflict (id) do nothing;

-- ============================================================
-- Phase 4: Add missing tags from dump (20 tags)
-- ============================================================

insert into games_library.tags (id)
values
  ('adventure'),
  ('anime'),
  ('arcade'),
  ('beat_em_up'),
  ('card'),
  ('city_building'),
  ('family'),
  ('gothic'),
  ('mecha'),
  ('military'),
  ('minigame'),
  ('multiplayer'),
  ('party'),
  ('point_and_click'),
  ('rpg'),
  ('simulation'),
  ('sports'),
  ('strategy'),
  ('supernatural'),
  ('visual_novel')
on conflict (id) do nothing;

-- ============================================================
-- Phase 5: Insert games (with FK mappings)
-- ============================================================

insert into games_library.games (
  game_id, title, aliases, release_year, release_state,
  source_type, source_ref, cover_url, tags, notes,
  sort_date, release_label, genre_id, series_id,
  created_at, updated_at
)
select
  o.game_id,
  o.title,
  o.aliases,
  coalesce(o.release_year, 0) as release_year,
  o.release_state,
  o.source_type,
  o.source_ref,
  o.cover_url,
  o.tags,
  o.notes,
  case
    when o.sort_date is not null then o.sort_date
    when o.release_year is not null then (o.release_year || '-07-01')::date
    else '1970-01-01'::date
  end as sort_date,
  o.release_label,
  -- genre_id: first token from primary_genre, matched by slug
  (
    select g.id
    from games_library.genres g
    where g.id = regexp_replace(lower(split_part(o.primary_genre, ';', 1)), '[^a-z0-9]+', '_', 'g')
    limit 1
  ),
  -- series_id: lookup clean series
  (
    select s.id
    from games_library.series s
    where s.name = o.series
    limit 1
  ),
  now(),
  now()
from games_library_old.games o
where o.game_id != 'test_insert_2024';

-- ============================================================
-- Phase 6: Insert game_platforms
-- ============================================================

insert into games_library.game_platforms (game_id, platform_id, created_at)
select op.game_id, op.platform_id, now()
from games_library_old.game_platforms op
where op.game_id != 'test_insert_2024';

-- ============================================================
-- Phase 7: Insert game_tags (from denormalized games.tags[])
-- ============================================================

insert into games_library.game_tags (game_id, tag_id, created_at)
select g.game_id, unnest(g.tags), now()
from games_library.games g
where array_length(g.tags, 1) > 0
on conflict (game_id, tag_id) do nothing;

-- ============================================================
-- Phase 8: Insert game_aliases (from denormalized games.aliases[])
-- ============================================================

insert into games_library.game_aliases (game_id, alias, created_at)
select g.game_id, unnest(g.aliases), now()
from games_library.games g
where array_length(g.aliases, 1) > 0
on conflict (game_id, alias) do nothing;

-- ============================================================
-- Phase 9: Update release_year = 0 to NULL (optional cleanup)
-- Comentado: 0 indica "año desconocido", mantiene NOT NULL constraint
-- ============================================================

commit;
