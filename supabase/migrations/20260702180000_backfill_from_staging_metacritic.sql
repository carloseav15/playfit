-- Backfill genre / summary / score gaps from games_library_private.staging_metacritic_games,
-- a previously-imported dataset that was never fully applied to the catalog.
--
-- Matching: normalized title, disambiguated by release_year when both sides
-- know it (staging_metacritic_games only stores a free-text release date, so
-- the year is parsed out of it). When a game's release_year is unknown
-- (0/null) we fall back to title-only matching. Where a (title, year) pair
-- still has more than one staging row (common: Metacritic tracks each
-- platform release separately), we deterministically pick the lowest
-- staging_row_id so every matching game gets one consistent set of values.
--
-- Conservative by design:
--   - Genre is only backfilled when the *first* comma-separated genre tag,
--     normalized to snake_case, is an exact match for an existing
--     games_library.genres.id. No fuzzy/synonym mapping, to avoid assigning
--     a wrong specific subgenre.
--   - Summary/score are only inserted for games that currently have zero
--     rows in game_summaries / game_scores (never overwrites or duplicates
--     existing enrichment from another source).
begin;

with staging_parsed as (
  select
    staging_row_id,
    lower(btrim(title)) as norm_title,
    nullif(regexp_replace(coalesce(release_date_text, ''), '.*?(\d{4})\D*$', '\1'), coalesce(release_date_text, '')) ::int as parsed_year,
    nullif(regexp_replace(lower(btrim(split_part(coalesce(genre_text, ''), ',', 1))), '[^a-z0-9]+', '_', 'g'), '') as first_genre_token
  from games_library_private.staging_metacritic_games
),
staging_ranked as (
  select *, row_number() over (partition by norm_title, parsed_year order by staging_row_id) as rn
  from staging_parsed
),
staging_best as (
  select * from staging_ranked where rn = 1
),
matched as (
  select g.game_id, s.first_genre_token
  from games_library.games g
  join staging_best s
    on lower(btrim(g.title)) = s.norm_title
   and (
     s.parsed_year is null
     or g.release_year is null
     or g.release_year = 0
     or g.release_year = s.parsed_year
   )
  where g.genre_id is null
)
update games_library.games g
set genre_id = m.first_genre_token
from matched m
join games_library.genres gen on gen.id = m.first_genre_token
where g.game_id = m.game_id
  and m.first_genre_token is not null;

with staging_parsed as (
  select
    staging_row_id,
    lower(btrim(title)) as norm_title,
    nullif(regexp_replace(coalesce(release_date_text, ''), '.*?(\d{4})\D*$', '\1'), coalesce(release_date_text, '')) ::int as parsed_year,
    nullif(btrim(summary), '') as summary
  from games_library_private.staging_metacritic_games
),
staging_ranked as (
  select *, row_number() over (partition by norm_title, parsed_year order by staging_row_id) as rn
  from staging_parsed
  where summary is not null
),
staging_best as (
  select * from staging_ranked where rn = 1
),
matched as (
  select distinct on (g.game_id) g.game_id, s.summary, s.staging_row_id
  from games_library.games g
  join staging_best s
    on lower(btrim(g.title)) = s.norm_title
   and (
     s.parsed_year is null
     or g.release_year is null
     or g.release_year = 0
     or g.release_year = s.parsed_year
   )
  where not exists (
    select 1 from games_library.game_summaries gs where gs.game_id = g.game_id
  )
  order by g.game_id, s.staging_row_id
)
insert into games_library.game_summaries (game_id, summary, source, source_key)
select game_id, summary, 'metacritic_staging', 'staging_row_' || staging_row_id
from matched
on conflict (game_id, source, source_key) do nothing;

with staging_parsed as (
  select
    staging_row_id,
    lower(btrim(title)) as norm_title,
    nullif(regexp_replace(coalesce(release_date_text, ''), '.*?(\d{4})\D*$', '\1'), coalesce(release_date_text, '')) ::int as parsed_year,
    nullif(metascore_text, '')::numeric as critic_score,
    nullif(critic_reviews_text, '')::int as critic_count,
    case when nullif(userscore_text, '') ~ '^[0-9.]+$' then nullif(userscore_text, '')::numeric else null end as user_score,
    nullif(user_reviews_text, '')::int as user_count
  from games_library_private.staging_metacritic_games
),
staging_ranked as (
  select *, row_number() over (partition by norm_title, parsed_year order by staging_row_id) as rn
  from staging_parsed
  where critic_score is not null or user_score is not null
),
staging_best as (
  select * from staging_ranked where rn = 1
),
matched as (
  select distinct on (g.game_id)
    g.game_id, s.critic_score, s.critic_count, s.user_score, s.user_count, s.staging_row_id
  from games_library.games g
  join staging_best s
    on lower(btrim(g.title)) = s.norm_title
   and (
     s.parsed_year is null
     or g.release_year is null
     or g.release_year = 0
     or g.release_year = s.parsed_year
   )
  where not exists (
    select 1 from games_library.game_scores gsc where gsc.game_id = g.game_id
  )
  order by g.game_id, s.staging_row_id
)
insert into games_library.game_scores (game_id, score_source, critic_score, critic_count, user_score, user_count, source_key)
select game_id, 'metacritic_staging', critic_score, critic_count, user_score, user_count, 'staging_row_' || staging_row_id
from matched
on conflict (game_id, platform_id, score_source, source_key) do nothing;

commit;

-- Down:
-- Not auto-reversed. Rows inserted by this migration are identifiable via
-- source = 'metacritic_staging' in game_summaries and game_scores; genre_id
-- backfills are not separately tagged since genres has no provenance column.
