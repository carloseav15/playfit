-- External catalog enrichment pipeline.
-- Non-destructive: stages external CSV data, proposes matches, and writes
-- enrichment only into new side tables after candidates are approved.
begin;

create schema if not exists games_library_private;

comment on schema games_library_private is
  'Private maintenance helpers for games_library. Not exposed through Supabase Data API.';

revoke all on schema games_library_private from public, anon, authenticated;
grant usage on schema games_library_private to service_role;

-- ============================================================
-- 1. Private normalization helpers
-- ============================================================

create or replace function games_library_private.normalize_external_key(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '', 'g');
$$;

create or replace function games_library_private.normalize_external_platform_key(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '', 'g');
$$;

create or replace function games_library_private.map_external_platform_id(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case games_library_private.normalize_external_platform_key(p_value)
    when '3ds' then '3ds'
    when 'nintendo3ds' then '3ds'
    when 'android' then 'android'
    when 'atari2600' then 'atari_2600'
    when 'dreamcast' then 'dreamcast'
    when 'dc' then 'dreamcast'
    when 'ds' then 'ds'
    when 'nintendods' then 'ds'
    when 'gamegear' then 'game_gear'
    when 'gg' then 'game_gear'
    when 'gamecube' then 'gamecube'
    when 'gc' then 'gamecube'
    when 'gameboy' then 'gb'
    when 'gb' then 'gb'
    when 'gameboyadvance' then 'gba'
    when 'gba' then 'gba'
    when 'gameboycolor' then 'gbc'
    when 'gbc' then 'gbc'
    when 'genesis' then 'genesis'
    when 'gen' then 'genesis'
    when 'ios' then 'ios'
    when 'linux' then 'linux'
    when 'macos' then 'macos'
    when 'mac' then 'macos'
    when 'nintendo64' then 'n64'
    when 'n64' then 'n64'
    when 'neogeo' then 'neo_geo'
    when 'ng' then 'neo_geo'
    when 'nes' then 'nes'
    when 'pc' then 'pc'
    when 'playstation' then 'ps1'
    when 'ps' then 'ps1'
    when 'ps1' then 'ps1'
    when 'playstation2' then 'ps2'
    when 'ps2' then 'ps2'
    when 'playstation3' then 'ps3'
    when 'ps3' then 'ps3'
    when 'playstation4' then 'ps4'
    when 'ps4' then 'ps4'
    when 'playstation5' then 'ps5'
    when 'ps5' then 'ps5'
    when 'playstationportable' then 'psp'
    when 'psp' then 'psp'
    when 'playstationvita' then 'ps_vita'
    when 'psvita' then 'ps_vita'
    when 'psv' then 'ps_vita'
    when 'saturn' then 'saturn'
    when 'sat' then 'saturn'
    when 'segamastersystem' then 'sega_master_system'
    when 'snes' then 'snes'
    when 'switch' then 'switch_1'
    when 'nintendoswitch' then 'switch_1'
    when 'switch2' then 'switch_2'
    when 'nintendoswitch2' then 'switch_2'
    when 'wii' then 'wii'
    when 'wiiu' then 'wii_u'
    when 'xbox' then 'xbox_original'
    when 'xb' then 'xbox_original'
    when 'xbox360' then 'xbox_360'
    when 'x360' then 'xbox_360'
    when 'xboxone' then 'xbox_one'
    when 'xone' then 'xbox_one'
    when 'xboxseriesxs' then 'xbox_series_xs'
    when 'xboxseriesx' then 'xbox_series_xs'
    when 'xboxseriess' then 'xbox_series_xs'
    else null
  end;
$$;

create or replace function games_library_private.parse_external_int(p_value text)
returns int
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_value is null then null
    when btrim(p_value) = '' then null
    when lower(btrim(p_value)) in ('nan', 'tbd', 'not available', 'n/a') then null
    when btrim(p_value) ~ '^-?[0-9]+(\.0+)?$' then btrim(p_value)::numeric::int
    else null
  end;
$$;

create or replace function games_library_private.parse_external_numeric(p_value text)
returns numeric
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_value is null then null
    when btrim(p_value) = '' then null
    when lower(btrim(p_value)) in ('nan', 'tbd', 'not available', 'n/a') then null
    when btrim(p_value) ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(p_value)::numeric
    else null
  end;
$$;

create or replace function games_library_private.extract_external_year(p_value text)
returns int
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_value is null then null
    when substring(p_value from '([12][0-9]{3})') is null then null
    else substring(p_value from '([12][0-9]{3})')::int
  end;
$$;

create or replace function games_library_private.parse_metacritic_release_date(p_value text)
returns date
language plpgsql
stable
set search_path = pg_catalog
as $$
declare
  v_clean text;
begin
  v_clean := btrim(regexp_replace(coalesce(p_value, ''), '\s+', ' ', 'g'));
  if v_clean = '' then
    return null;
  end if;

  begin
    return to_date(v_clean, 'Mon DD, YYYY');
  exception when others then
    return null;
  end;
end;
$$;

-- ============================================================
-- 2. Private CSV staging tables
-- ============================================================

create table if not exists games_library_private.staging_metacritic_games (
  staging_row_id bigint generated always as identity primary key,
  source_dataset text not null default 'metacritic_games_master',
  source_file text not null default '',
  csv_row_index text,
  title text,
  release_date_text text,
  genre_text text,
  platforms_text text,
  developer_text text,
  esrb_rating text,
  esrb_descriptors text,
  metascore_text text,
  userscore_text text,
  critic_reviews_text text,
  user_reviews_text text,
  num_players text,
  summary text,
  normalized_title_key text,
  normalized_platform_id text,
  release_year int,
  imported_at timestamptz not null default now()
);

create table if not exists games_library_private.staging_vgsales (
  staging_row_id bigint generated always as identity primary key,
  source_dataset text not null default 'vgsales_2016',
  source_file text not null default '',
  name text,
  platform_text text,
  year_of_release_text text,
  genre_text text,
  publisher_text text,
  na_sales_text text,
  eu_sales_text text,
  jp_sales_text text,
  other_sales_text text,
  global_sales_text text,
  critic_score_text text,
  critic_count_text text,
  user_score_text text,
  user_count_text text,
  developer_text text,
  rating_text text,
  normalized_title_key text,
  normalized_platform_id text,
  release_year int,
  imported_at timestamptz not null default now()
);

create table if not exists games_library_private.staging_metacritic_reviews (
  staging_row_id bigint generated always as identity primary key,
  source_dataset text not null default 'metacritic_reviews_master',
  source_file text not null default '',
  csv_row_index text,
  reviewer_id text,
  game_title text,
  rating_text text,
  review_text text,
  normalized_title_key text,
  imported_at timestamptz not null default now()
);

create index if not exists staging_metacritic_games_title_idx
  on games_library_private.staging_metacritic_games (normalized_title_key);
create index if not exists staging_metacritic_games_platform_year_idx
  on games_library_private.staging_metacritic_games (normalized_platform_id, release_year);
create index if not exists staging_vgsales_title_idx
  on games_library_private.staging_vgsales (normalized_title_key);
create index if not exists staging_vgsales_platform_year_idx
  on games_library_private.staging_vgsales (normalized_platform_id, release_year);
create index if not exists staging_metacritic_reviews_title_idx
  on games_library_private.staging_metacritic_reviews (normalized_title_key);

alter table games_library_private.staging_metacritic_games enable row level security;
alter table games_library_private.staging_vgsales enable row level security;
alter table games_library_private.staging_metacritic_reviews enable row level security;

drop policy if exists service_role_manage_staging_metacritic_games
  on games_library_private.staging_metacritic_games;
create policy service_role_manage_staging_metacritic_games
  on games_library_private.staging_metacritic_games
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_staging_vgsales
  on games_library_private.staging_vgsales;
create policy service_role_manage_staging_vgsales
  on games_library_private.staging_vgsales
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_staging_metacritic_reviews
  on games_library_private.staging_metacritic_reviews;
create policy service_role_manage_staging_metacritic_reviews
  on games_library_private.staging_metacritic_reviews
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table
  games_library_private.staging_metacritic_games,
  games_library_private.staging_vgsales,
  games_library_private.staging_metacritic_reviews
from public, anon, authenticated;
grant select, insert, update, delete, truncate on table
  games_library_private.staging_metacritic_games,
  games_library_private.staging_vgsales,
  games_library_private.staging_metacritic_reviews
to service_role;

-- ============================================================
-- 3. Public-schema review queue and enrichment side tables
-- ============================================================

create table if not exists games_library.game_external_match_candidates (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_dataset text not null,
  source_key text not null,
  source_row_id bigint not null,
  source_title text not null,
  source_platform_text text,
  source_platform_id text references games_library.platforms(id) on update cascade on delete restrict,
  source_release_year int,
  game_id text not null references games_library.games(game_id) on update cascade on delete restrict,
  confidence_score int not null check (confidence_score between 0 and 100),
  matched_by text not null,
  status text not null default 'needs_review',
  signals jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  applied_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_external_match_candidates_source_check check (
    source in ('metacritic', 'vgsales')
  ),
  constraint game_external_match_candidates_status_check check (
    status in ('auto_approved', 'needs_review', 'low_confidence', 'approved', 'rejected', 'superseded')
  ),
  unique (source, source_key, game_id)
);

comment on table games_library.game_external_match_candidates is
  'Review queue for matching external CSV rows to canonical Playfit game IDs. This table is non-destructive and does not mutate games.';

create index if not exists game_external_match_candidates_game_idx
  on games_library.game_external_match_candidates (game_id);
create index if not exists game_external_match_candidates_status_idx
  on games_library.game_external_match_candidates (status, confidence_score desc);
create index if not exists game_external_match_candidates_source_idx
  on games_library.game_external_match_candidates (source, source_dataset);

create table if not exists games_library.game_external_ids (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games_library.games(game_id) on update cascade on delete cascade,
  provider text not null,
  provider_game_key text not null,
  source_title text not null default '',
  source_platform_id text references games_library.platforms(id) on update cascade on delete set null,
  confidence_score int not null check (confidence_score between 0 and 100),
  match_candidate_id uuid references games_library.game_external_match_candidates(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, provider, provider_game_key)
);

create table if not exists games_library.game_releases (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games_library.games(game_id) on update cascade on delete cascade,
  platform_id text references games_library.platforms(id) on update cascade on delete set null,
  release_date date,
  release_year int,
  source text not null,
  source_key text not null,
  match_candidate_id uuid references games_library.game_external_match_candidates(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, platform_id, source, source_key)
);

create table if not exists games_library.game_companies (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games_library.games(game_id) on update cascade on delete cascade,
  company_name text not null,
  role text not null,
  source text not null,
  source_key text not null,
  match_candidate_id uuid references games_library.game_external_match_candidates(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_companies_role_check check (role in ('developer', 'publisher')),
  unique (game_id, company_name, role, source)
);

create table if not exists games_library.game_scores (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games_library.games(game_id) on update cascade on delete cascade,
  platform_id text references games_library.platforms(id) on update cascade on delete set null,
  score_source text not null,
  critic_score numeric,
  critic_count int,
  user_score numeric,
  user_count int,
  source_key text not null,
  match_candidate_id uuid references games_library.game_external_match_candidates(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, platform_id, score_source, source_key)
);

create table if not exists games_library.game_age_ratings (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games_library.games(game_id) on update cascade on delete cascade,
  platform_id text references games_library.platforms(id) on update cascade on delete set null,
  rating_board text not null,
  rating text not null,
  descriptors text,
  source text not null,
  source_key text not null,
  match_candidate_id uuid references games_library.game_external_match_candidates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, platform_id, rating_board, source, source_key)
);

create table if not exists games_library.game_summaries (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games_library.games(game_id) on update cascade on delete cascade,
  summary text not null,
  source text not null,
  source_key text not null,
  match_candidate_id uuid references games_library.game_external_match_candidates(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, source, source_key)
);

create table if not exists games_library.game_sales_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games_library.games(game_id) on update cascade on delete cascade,
  platform_id text references games_library.platforms(id) on update cascade on delete set null,
  source text not null,
  source_key text not null,
  snapshot_date date not null,
  na_sales_millions numeric,
  eu_sales_millions numeric,
  jp_sales_millions numeric,
  other_sales_millions numeric,
  global_sales_millions numeric,
  match_candidate_id uuid references games_library.game_external_match_candidates(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, platform_id, source, source_key, snapshot_date)
);

create index if not exists game_external_ids_game_idx on games_library.game_external_ids (game_id);
create index if not exists game_releases_game_idx on games_library.game_releases (game_id);
create index if not exists game_companies_game_idx on games_library.game_companies (game_id);
create index if not exists game_scores_game_idx on games_library.game_scores (game_id);
create index if not exists game_age_ratings_game_idx on games_library.game_age_ratings (game_id);
create index if not exists game_summaries_game_idx on games_library.game_summaries (game_id);
create index if not exists game_sales_snapshots_game_idx on games_library.game_sales_snapshots (game_id);

alter table games_library.game_external_match_candidates enable row level security;
alter table games_library.game_external_ids enable row level security;
alter table games_library.game_releases enable row level security;
alter table games_library.game_companies enable row level security;
alter table games_library.game_scores enable row level security;
alter table games_library.game_age_ratings enable row level security;
alter table games_library.game_summaries enable row level security;
alter table games_library.game_sales_snapshots enable row level security;

drop policy if exists service_role_manage_game_external_match_candidates
  on games_library.game_external_match_candidates;
create policy service_role_manage_game_external_match_candidates
  on games_library.game_external_match_candidates
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_game_external_ids on games_library.game_external_ids;
create policy service_role_manage_game_external_ids
  on games_library.game_external_ids
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_game_releases on games_library.game_releases;
create policy service_role_manage_game_releases
  on games_library.game_releases
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_game_companies on games_library.game_companies;
create policy service_role_manage_game_companies
  on games_library.game_companies
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_game_scores on games_library.game_scores;
create policy service_role_manage_game_scores
  on games_library.game_scores
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_game_age_ratings on games_library.game_age_ratings;
create policy service_role_manage_game_age_ratings
  on games_library.game_age_ratings
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_game_summaries on games_library.game_summaries;
create policy service_role_manage_game_summaries
  on games_library.game_summaries
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_game_sales_snapshots
  on games_library.game_sales_snapshots;
create policy service_role_manage_game_sales_snapshots
  on games_library.game_sales_snapshots
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table
  games_library.game_external_match_candidates,
  games_library.game_external_ids,
  games_library.game_releases,
  games_library.game_companies,
  games_library.game_scores,
  games_library.game_age_ratings,
  games_library.game_summaries,
  games_library.game_sales_snapshots
from public, anon, authenticated;

grant select, insert, update, delete on table
  games_library.game_external_match_candidates,
  games_library.game_external_ids,
  games_library.game_releases,
  games_library.game_companies,
  games_library.game_scores,
  games_library.game_age_ratings,
  games_library.game_summaries,
  games_library.game_sales_snapshots
to service_role;

drop trigger if exists game_external_match_candidates_set_updated_at
  on games_library.game_external_match_candidates;
create trigger game_external_match_candidates_set_updated_at
  before update on games_library.game_external_match_candidates
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists game_external_ids_set_updated_at on games_library.game_external_ids;
create trigger game_external_ids_set_updated_at
  before update on games_library.game_external_ids
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists game_releases_set_updated_at on games_library.game_releases;
create trigger game_releases_set_updated_at
  before update on games_library.game_releases
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists game_companies_set_updated_at on games_library.game_companies;
create trigger game_companies_set_updated_at
  before update on games_library.game_companies
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists game_scores_set_updated_at on games_library.game_scores;
create trigger game_scores_set_updated_at
  before update on games_library.game_scores
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists game_age_ratings_set_updated_at on games_library.game_age_ratings;
create trigger game_age_ratings_set_updated_at
  before update on games_library.game_age_ratings
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists game_summaries_set_updated_at on games_library.game_summaries;
create trigger game_summaries_set_updated_at
  before update on games_library.game_summaries
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists game_sales_snapshots_set_updated_at on games_library.game_sales_snapshots;
create trigger game_sales_snapshots_set_updated_at
  before update on games_library.game_sales_snapshots
  for each row
  execute function games_library.set_updated_at();

-- ============================================================
-- 4. Candidate refresh
-- ============================================================

create or replace function games_library_private.refresh_external_match_candidates()
returns table(
  inserted_or_updated int,
  auto_approved int,
  needs_review int,
  low_confidence int
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_count int := 0;
begin
  with games_norm as (
    select
      g.game_id,
      g.title,
      g.release_year,
      games_library_private.normalize_external_key(g.title) as normalized_title_key,
      count(*) over (
        partition by games_library_private.normalize_external_key(g.title)
      ) as title_group_count
    from games_library.games g
  ),
  external_rows as (
    select
      'metacritic'::text as source,
      source_dataset,
      source_dataset || ':' || coalesce(csv_row_index, staging_row_id::text) || ':' ||
        coalesce(normalized_platform_id, 'unknown_platform') as source_key,
      staging_row_id as source_row_id,
      title as source_title,
      platforms_text as source_platform_text,
      normalized_platform_id as source_platform_id,
      release_year as source_release_year,
      jsonb_build_object(
        'release_date', release_date_text,
        'genre', genre_text,
        'developer', developer_text,
        'esrb_rating', esrb_rating,
        'esrb_descriptors', esrb_descriptors,
        'metascore', metascore_text,
        'userscore', userscore_text,
        'critic_reviews', critic_reviews_text,
        'user_reviews', user_reviews_text,
        'num_players', num_players,
        'summary_present', coalesce(summary, '') <> ''
      ) as raw_payload
    from games_library_private.staging_metacritic_games
    where coalesce(normalized_title_key, '') <> ''

    union all

    select
      'vgsales'::text as source,
      source_dataset,
      source_dataset || ':' || staging_row_id::text || ':' ||
        coalesce(normalized_platform_id, 'unknown_platform') as source_key,
      staging_row_id as source_row_id,
      name as source_title,
      platform_text as source_platform_text,
      normalized_platform_id as source_platform_id,
      release_year as source_release_year,
      jsonb_build_object(
        'genre', genre_text,
        'publisher', publisher_text,
        'developer', developer_text,
        'rating', rating_text,
        'global_sales', global_sales_text,
        'critic_score', critic_score_text,
        'critic_count', critic_count_text,
        'user_score', user_score_text,
        'user_count', user_count_text
      ) as raw_payload
    from games_library_private.staging_vgsales
    where coalesce(normalized_title_key, '') <> ''
  ),
  scored as (
    select
      er.*,
      gn.game_id,
      gn.release_year as game_release_year,
      gn.title_group_count,
      exists (
        select 1
        from games_library.game_platforms gp
        where gp.game_id = gn.game_id
          and er.source_platform_id is not null
          and gp.platform_id = er.source_platform_id
      ) as platform_match,
      case
        when er.source_release_year is not null
          and gn.release_year <> 0
          and er.source_release_year = gn.release_year then 'exact_year'
        when er.source_release_year is not null
          and gn.release_year <> 0
          and abs(er.source_release_year - gn.release_year) <= 1 then 'near_year'
        when er.source_release_year is not null and gn.release_year = 0 then 'source_year_only'
        when er.source_release_year is null then 'missing_source_year'
        else 'year_conflict'
      end as year_signal
    from external_rows er
    join games_norm gn
      on gn.normalized_title_key = (
        select case er.source
          when 'metacritic' then (
            select normalized_title_key
            from games_library_private.staging_metacritic_games smg
            where smg.staging_row_id = er.source_row_id
          )
          else (
            select normalized_title_key
            from games_library_private.staging_vgsales svg
            where svg.staging_row_id = er.source_row_id
          )
        end
      )
  ),
  ranked as (
    select
      s.*,
      least(100, greatest(0,
        50
        + case when s.platform_match then 25 when s.source_platform_id is null then 5 else -18 end
        + case s.year_signal
            when 'exact_year' then 20
            when 'near_year' then 14
            when 'source_year_only' then 8
            when 'missing_source_year' then 0
            else -22
          end
        + case when s.title_group_count = 1 then 8 else -20 end
        + case when s.raw_payload <> '{}'::jsonb then 4 else 0 end
      ))::int as confidence_score
    from scored s
  ),
  prepared as (
    select
      r.*,
      case
        when r.platform_match and r.year_signal in ('exact_year', 'near_year') and r.title_group_count = 1
          then 'exact_title_platform_year'
        when r.platform_match and r.title_group_count = 1
          then 'exact_title_platform'
        when r.year_signal in ('exact_year', 'near_year') and r.title_group_count = 1
          then 'exact_title_year'
        else 'exact_title_review_required'
      end as matched_by,
      jsonb_build_object(
        'title_group_count', r.title_group_count,
        'platform_match', r.platform_match,
        'year_signal', r.year_signal,
        'game_release_year', r.game_release_year
      ) as signals
    from ranked r
  ),
  upserted as (
    insert into games_library.game_external_match_candidates (
      source,
      source_dataset,
      source_key,
      source_row_id,
      source_title,
      source_platform_text,
      source_platform_id,
      source_release_year,
      game_id,
      confidence_score,
      matched_by,
      status,
      signals,
      raw_payload
    )
    select
      source,
      source_dataset,
      source_key,
      source_row_id,
      coalesce(source_title, ''),
      source_platform_text,
      source_platform_id,
      source_release_year,
      game_id,
      confidence_score,
      matched_by,
      case
        when confidence_score >= 95
          and matched_by = 'exact_title_platform_year'
          then 'auto_approved'
        when confidence_score >= 70 then 'needs_review'
        else 'low_confidence'
      end,
      signals,
      raw_payload
    from prepared
    on conflict (source, source_key, game_id) do update set
      source_dataset = excluded.source_dataset,
      source_row_id = excluded.source_row_id,
      source_title = excluded.source_title,
      source_platform_text = excluded.source_platform_text,
      source_platform_id = excluded.source_platform_id,
      source_release_year = excluded.source_release_year,
      confidence_score = excluded.confidence_score,
      matched_by = excluded.matched_by,
      status = case
        when games_library.game_external_match_candidates.status in ('approved', 'rejected')
          then games_library.game_external_match_candidates.status
        else excluded.status
      end,
      signals = excluded.signals,
      raw_payload = excluded.raw_payload,
      updated_at = now()
    returning status
  )
  select
    count(*)::int,
    count(*) filter (where status = 'auto_approved')::int,
    count(*) filter (where status = 'needs_review')::int,
    count(*) filter (where status = 'low_confidence')::int
  into inserted_or_updated, auto_approved, needs_review, low_confidence
  from upserted;

  return next;
end;
$$;

grant execute on function games_library_private.refresh_external_match_candidates()
  to service_role;

-- ============================================================
-- 5. Approved enrichment writer
-- ============================================================

create or replace function games_library_private.apply_approved_external_enrichment(
  p_limit int default 10000
)
returns table(
  candidates_applied int,
  external_ids_inserted int,
  releases_inserted int,
  companies_inserted int,
  scores_inserted int,
  age_ratings_inserted int,
  summaries_inserted int,
  sales_snapshots_inserted int
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_candidate record;
  v_count int;
begin
  if p_limit < 1 or p_limit > 50000 then
    raise exception 'p_limit must be between 1 and 50000';
  end if;

  candidates_applied := 0;
  external_ids_inserted := 0;
  releases_inserted := 0;
  companies_inserted := 0;
  scores_inserted := 0;
  age_ratings_inserted := 0;
  summaries_inserted := 0;
  sales_snapshots_inserted := 0;

  for v_candidate in
    select *
    from games_library.game_external_match_candidates
    where status in ('auto_approved', 'approved')
      and applied_at is null
    order by confidence_score desc, created_at
    limit p_limit
  loop
    insert into games_library.game_external_ids (
      game_id,
      provider,
      provider_game_key,
      source_title,
      source_platform_id,
      confidence_score,
      match_candidate_id,
      metadata
    )
    values (
      v_candidate.game_id,
      v_candidate.source,
      v_candidate.source_key,
      v_candidate.source_title,
      v_candidate.source_platform_id,
      v_candidate.confidence_score,
      v_candidate.id,
      v_candidate.signals
    )
    on conflict (game_id, provider, provider_game_key) do update set
      confidence_score = excluded.confidence_score,
      match_candidate_id = excluded.match_candidate_id,
      metadata = excluded.metadata,
      updated_at = now();
    get diagnostics v_count = row_count;
    external_ids_inserted := external_ids_inserted + v_count;

    if v_candidate.source = 'metacritic' then
      insert into games_library.game_releases (
        game_id,
        platform_id,
        release_date,
        release_year,
        source,
        source_key,
        match_candidate_id,
        metadata
      )
      select
        v_candidate.game_id,
        v_candidate.source_platform_id,
        games_library_private.parse_metacritic_release_date(s.release_date_text),
        s.release_year,
        'metacritic',
        v_candidate.source_key,
        v_candidate.id,
        jsonb_build_object('source_release_date', s.release_date_text)
      from games_library_private.staging_metacritic_games s
      where s.staging_row_id = v_candidate.source_row_id
        and (s.release_year is not null or coalesce(s.release_date_text, '') <> '')
      on conflict (game_id, platform_id, source, source_key) do update set
        release_date = excluded.release_date,
        release_year = excluded.release_year,
        match_candidate_id = excluded.match_candidate_id,
        metadata = excluded.metadata,
        updated_at = now();
      get diagnostics v_count = row_count;
      releases_inserted := releases_inserted + v_count;

      insert into games_library.game_companies (
        game_id,
        company_name,
        role,
        source,
        source_key,
        match_candidate_id
      )
      select
        v_candidate.game_id,
        btrim(s.developer_text),
        'developer',
        'metacritic',
        v_candidate.source_key,
        v_candidate.id
      from games_library_private.staging_metacritic_games s
      where s.staging_row_id = v_candidate.source_row_id
        and btrim(coalesce(s.developer_text, '')) <> ''
      on conflict (game_id, company_name, role, source) do update set
        match_candidate_id = excluded.match_candidate_id,
        updated_at = now();
      get diagnostics v_count = row_count;
      companies_inserted := companies_inserted + v_count;

      insert into games_library.game_scores (
        game_id,
        platform_id,
        score_source,
        critic_score,
        critic_count,
        user_score,
        user_count,
        source_key,
        match_candidate_id
      )
      select
        v_candidate.game_id,
        v_candidate.source_platform_id,
        'metacritic',
        games_library_private.parse_external_numeric(s.metascore_text),
        games_library_private.parse_external_int(s.critic_reviews_text),
        games_library_private.parse_external_numeric(s.userscore_text),
        games_library_private.parse_external_int(s.user_reviews_text),
        v_candidate.source_key,
        v_candidate.id
      from games_library_private.staging_metacritic_games s
      where s.staging_row_id = v_candidate.source_row_id
        and (
          games_library_private.parse_external_numeric(s.metascore_text) is not null
          or games_library_private.parse_external_numeric(s.userscore_text) is not null
        )
      on conflict (game_id, platform_id, score_source, source_key) do update set
        critic_score = excluded.critic_score,
        critic_count = excluded.critic_count,
        user_score = excluded.user_score,
        user_count = excluded.user_count,
        match_candidate_id = excluded.match_candidate_id,
        updated_at = now();
      get diagnostics v_count = row_count;
      scores_inserted := scores_inserted + v_count;

      insert into games_library.game_age_ratings (
        game_id,
        platform_id,
        rating_board,
        rating,
        descriptors,
        source,
        source_key,
        match_candidate_id
      )
      select
        v_candidate.game_id,
        v_candidate.source_platform_id,
        'ESRB',
        btrim(s.esrb_rating),
        nullif(btrim(coalesce(s.esrb_descriptors, '')), ''),
        'metacritic',
        v_candidate.source_key,
        v_candidate.id
      from games_library_private.staging_metacritic_games s
      where s.staging_row_id = v_candidate.source_row_id
        and btrim(coalesce(s.esrb_rating, '')) <> ''
      on conflict (game_id, platform_id, rating_board, source, source_key) do update set
        rating = excluded.rating,
        descriptors = excluded.descriptors,
        match_candidate_id = excluded.match_candidate_id,
        updated_at = now();
      get diagnostics v_count = row_count;
      age_ratings_inserted := age_ratings_inserted + v_count;

      insert into games_library.game_summaries (
        game_id,
        summary,
        source,
        source_key,
        match_candidate_id
      )
      select
        v_candidate.game_id,
        btrim(s.summary),
        'metacritic',
        v_candidate.source_key,
        v_candidate.id
      from games_library_private.staging_metacritic_games s
      where s.staging_row_id = v_candidate.source_row_id
        and btrim(coalesce(s.summary, '')) <> ''
      on conflict (game_id, source, source_key) do update set
        summary = excluded.summary,
        match_candidate_id = excluded.match_candidate_id,
        updated_at = now();
      get diagnostics v_count = row_count;
      summaries_inserted := summaries_inserted + v_count;
    end if;

    if v_candidate.source = 'vgsales' then
      insert into games_library.game_releases (
        game_id,
        platform_id,
        release_year,
        source,
        source_key,
        match_candidate_id
      )
      select
        v_candidate.game_id,
        v_candidate.source_platform_id,
        s.release_year,
        'vgsales',
        v_candidate.source_key,
        v_candidate.id
      from games_library_private.staging_vgsales s
      where s.staging_row_id = v_candidate.source_row_id
        and s.release_year is not null
      on conflict (game_id, platform_id, source, source_key) do update set
        release_year = excluded.release_year,
        match_candidate_id = excluded.match_candidate_id,
        updated_at = now();
      get diagnostics v_count = row_count;
      releases_inserted := releases_inserted + v_count;

      insert into games_library.game_companies (
        game_id,
        company_name,
        role,
        source,
        source_key,
        match_candidate_id
      )
      select v_candidate.game_id, btrim(s.developer_text), 'developer', 'vgsales', v_candidate.source_key, v_candidate.id
      from games_library_private.staging_vgsales s
      where s.staging_row_id = v_candidate.source_row_id
        and btrim(coalesce(s.developer_text, '')) <> ''
      union all
      select v_candidate.game_id, btrim(s.publisher_text), 'publisher', 'vgsales', v_candidate.source_key, v_candidate.id
      from games_library_private.staging_vgsales s
      where s.staging_row_id = v_candidate.source_row_id
        and btrim(coalesce(s.publisher_text, '')) <> ''
      on conflict (game_id, company_name, role, source) do update set
        match_candidate_id = excluded.match_candidate_id,
        updated_at = now();
      get diagnostics v_count = row_count;
      companies_inserted := companies_inserted + v_count;

      insert into games_library.game_scores (
        game_id,
        platform_id,
        score_source,
        critic_score,
        critic_count,
        user_score,
        user_count,
        source_key,
        match_candidate_id
      )
      select
        v_candidate.game_id,
        v_candidate.source_platform_id,
        'vgsales',
        games_library_private.parse_external_numeric(s.critic_score_text),
        games_library_private.parse_external_int(s.critic_count_text),
        games_library_private.parse_external_numeric(s.user_score_text),
        games_library_private.parse_external_int(s.user_count_text),
        v_candidate.source_key,
        v_candidate.id
      from games_library_private.staging_vgsales s
      where s.staging_row_id = v_candidate.source_row_id
        and (
          games_library_private.parse_external_numeric(s.critic_score_text) is not null
          or games_library_private.parse_external_numeric(s.user_score_text) is not null
        )
      on conflict (game_id, platform_id, score_source, source_key) do update set
        critic_score = excluded.critic_score,
        critic_count = excluded.critic_count,
        user_score = excluded.user_score,
        user_count = excluded.user_count,
        match_candidate_id = excluded.match_candidate_id,
        updated_at = now();
      get diagnostics v_count = row_count;
      scores_inserted := scores_inserted + v_count;

      insert into games_library.game_age_ratings (
        game_id,
        platform_id,
        rating_board,
        rating,
        source,
        source_key,
        match_candidate_id
      )
      select
        v_candidate.game_id,
        v_candidate.source_platform_id,
        'ESRB',
        btrim(s.rating_text),
        'vgsales',
        v_candidate.source_key,
        v_candidate.id
      from games_library_private.staging_vgsales s
      where s.staging_row_id = v_candidate.source_row_id
        and btrim(coalesce(s.rating_text, '')) <> ''
      on conflict (game_id, platform_id, rating_board, source, source_key) do update set
        rating = excluded.rating,
        match_candidate_id = excluded.match_candidate_id,
        updated_at = now();
      get diagnostics v_count = row_count;
      age_ratings_inserted := age_ratings_inserted + v_count;

      insert into games_library.game_sales_snapshots (
        game_id,
        platform_id,
        source,
        source_key,
        snapshot_date,
        na_sales_millions,
        eu_sales_millions,
        jp_sales_millions,
        other_sales_millions,
        global_sales_millions,
        match_candidate_id
      )
      select
        v_candidate.game_id,
        v_candidate.source_platform_id,
        'vgsales',
        v_candidate.source_key,
        date '2016-12-22',
        games_library_private.parse_external_numeric(s.na_sales_text),
        games_library_private.parse_external_numeric(s.eu_sales_text),
        games_library_private.parse_external_numeric(s.jp_sales_text),
        games_library_private.parse_external_numeric(s.other_sales_text),
        games_library_private.parse_external_numeric(s.global_sales_text),
        v_candidate.id
      from games_library_private.staging_vgsales s
      where s.staging_row_id = v_candidate.source_row_id
        and games_library_private.parse_external_numeric(s.global_sales_text) is not null
      on conflict (game_id, platform_id, source, source_key, snapshot_date) do update set
        na_sales_millions = excluded.na_sales_millions,
        eu_sales_millions = excluded.eu_sales_millions,
        jp_sales_millions = excluded.jp_sales_millions,
        other_sales_millions = excluded.other_sales_millions,
        global_sales_millions = excluded.global_sales_millions,
        match_candidate_id = excluded.match_candidate_id,
        updated_at = now();
      get diagnostics v_count = row_count;
      sales_snapshots_inserted := sales_snapshots_inserted + v_count;
    end if;

    update games_library.game_external_match_candidates
    set applied_at = now()
    where id = v_candidate.id;

    candidates_applied := candidates_applied + 1;
  end loop;

  return next;
end;
$$;

grant execute on function games_library_private.apply_approved_external_enrichment(int)
  to service_role;

create or replace view games_library.external_match_candidate_summary
with (security_invoker = true)
as
select
  source,
  source_dataset,
  status,
  count(*) as candidate_count,
  round(avg(confidence_score), 2) as avg_confidence,
  count(distinct game_id) as distinct_games,
  count(*) filter (where applied_at is not null) as applied_count
from games_library.game_external_match_candidates
group by source, source_dataset, status;

revoke all on table games_library.external_match_candidate_summary
  from public, anon, authenticated;
grant select on table games_library.external_match_candidate_summary
  to service_role;

commit;

-- Down:
-- begin;
-- drop view if exists games_library.external_match_candidate_summary;
-- drop function if exists games_library_private.apply_approved_external_enrichment(int);
-- drop function if exists games_library_private.refresh_external_match_candidates();
-- drop table if exists games_library.game_sales_snapshots;
-- drop table if exists games_library.game_summaries;
-- drop table if exists games_library.game_age_ratings;
-- drop table if exists games_library.game_scores;
-- drop table if exists games_library.game_companies;
-- drop table if exists games_library.game_releases;
-- drop table if exists games_library.game_external_ids;
-- drop table if exists games_library.game_external_match_candidates;
-- drop table if exists games_library_private.staging_metacritic_reviews;
-- drop table if exists games_library_private.staging_vgsales;
-- drop table if exists games_library_private.staging_metacritic_games;
-- drop function if exists games_library_private.parse_metacritic_release_date(text);
-- drop function if exists games_library_private.extract_external_year(text);
-- drop function if exists games_library_private.parse_external_numeric(text);
-- drop function if exists games_library_private.parse_external_int(text);
-- drop function if exists games_library_private.map_external_platform_id(text);
-- drop function if exists games_library_private.normalize_external_platform_key(text);
-- drop function if exists games_library_private.normalize_external_key(text);
-- commit;
