-- Metacritic review sentiment enrichment.
-- Non-destructive: stages the smaller metacritic_games.xls CSV export and writes
-- review polarity snapshots only after conservative match approval.
begin;

create table if not exists games_library_private.staging_metacritic_review_sentiment (
  staging_row_id bigint generated always as identity primary key,
  source_dataset text not null default 'metacritic_review_sentiment',
  source_file text not null default '',
  game_title text,
  platform_text text,
  developer_text text,
  genre_text text,
  number_players_text text,
  rating_text text,
  release_date_text text,
  positive_critics_text text,
  neutral_critics_text text,
  negative_critics_text text,
  positive_users_text text,
  neutral_users_text text,
  negative_users_text text,
  metascore_text text,
  user_score_text text,
  normalized_title_key text,
  normalized_platform_id text,
  release_year int,
  imported_at timestamptz not null default now()
);

create index if not exists staging_metacritic_review_sentiment_title_idx
  on games_library_private.staging_metacritic_review_sentiment (normalized_title_key);
create index if not exists staging_metacritic_review_sentiment_platform_year_idx
  on games_library_private.staging_metacritic_review_sentiment (normalized_platform_id, release_year);

alter table games_library_private.staging_metacritic_review_sentiment enable row level security;

drop policy if exists service_role_manage_staging_metacritic_review_sentiment
  on games_library_private.staging_metacritic_review_sentiment;
create policy service_role_manage_staging_metacritic_review_sentiment
  on games_library_private.staging_metacritic_review_sentiment
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library_private.staging_metacritic_review_sentiment
  from public, anon, authenticated;
grant select, insert, update, delete, truncate
  on table games_library_private.staging_metacritic_review_sentiment
  to service_role;
grant usage, select
  on sequence games_library_private.staging_metacritic_review_sentiment_staging_row_id_seq
  to service_role;

create table if not exists games_library.game_review_sentiment_snapshots (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references games_library.games(game_id) on update cascade on delete cascade,
  platform_id text references games_library.platforms(id) on update cascade on delete set null,
  source text not null default 'metacritic',
  source_dataset text not null default 'metacritic_review_sentiment',
  source_key text not null,
  source_release_date date,
  source_release_year int,
  metascore int check (metascore is null or metascore between 0 and 100),
  user_score_100 int check (user_score_100 is null or user_score_100 between 0 and 100),
  positive_critics int not null default 0 check (positive_critics >= 0),
  neutral_critics int not null default 0 check (neutral_critics >= 0),
  negative_critics int not null default 0 check (negative_critics >= 0),
  critic_review_count int generated always as (
    positive_critics + neutral_critics + negative_critics
  ) stored,
  positive_users int not null default 0 check (positive_users >= 0),
  neutral_users int not null default 0 check (neutral_users >= 0),
  negative_users int not null default 0 check (negative_users >= 0),
  user_review_count int generated always as (
    positive_users + neutral_users + negative_users
  ) stored,
  developer_text text,
  genre_text text,
  number_players_text text,
  rating_board text,
  rating text,
  match_candidate_id uuid references games_library.game_external_match_candidates(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_review_sentiment_snapshots_source_check check (source = 'metacritic'),
  unique (game_id, platform_id, source_dataset, source_key)
);

comment on table games_library.game_review_sentiment_snapshots is
  'Metacritic critic/user positive-neutral-negative counts and score snapshots from external CSV sources. This table is non-destructive and does not mutate games.';

create index if not exists game_review_sentiment_snapshots_game_idx
  on games_library.game_review_sentiment_snapshots (game_id);
create index if not exists game_review_sentiment_snapshots_platform_idx
  on games_library.game_review_sentiment_snapshots (platform_id);
create index if not exists game_review_sentiment_snapshots_source_idx
  on games_library.game_review_sentiment_snapshots (source, source_dataset);
create index if not exists game_review_sentiment_snapshots_reviews_idx
  on games_library.game_review_sentiment_snapshots (critic_review_count desc, user_review_count desc);

alter table games_library.game_review_sentiment_snapshots enable row level security;

drop policy if exists service_role_manage_game_review_sentiment_snapshots
  on games_library.game_review_sentiment_snapshots;
create policy service_role_manage_game_review_sentiment_snapshots
  on games_library.game_review_sentiment_snapshots
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library.game_review_sentiment_snapshots
  from public, anon, authenticated;
grant select, insert, update, delete
  on table games_library.game_review_sentiment_snapshots
  to service_role;

drop trigger if exists game_review_sentiment_snapshots_set_updated_at
  on games_library.game_review_sentiment_snapshots;
create trigger game_review_sentiment_snapshots_set_updated_at
  before update on games_library.game_review_sentiment_snapshots
  for each row
  execute function games_library.set_updated_at();

create or replace function games_library_private.refresh_metacritic_review_sentiment_candidates()
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
      source_dataset || ':' || staging_row_id::text || ':' ||
        coalesce(normalized_platform_id, 'unknown_platform') as source_key,
      staging_row_id as source_row_id,
      game_title as source_title,
      platform_text as source_platform_text,
      normalized_platform_id as source_platform_id,
      release_year as source_release_year,
      normalized_title_key,
      jsonb_build_object(
        'release_date', release_date_text,
        'developer', developer_text,
        'genre', genre_text,
        'number_players', number_players_text,
        'rating', rating_text,
        'positive_critics', positive_critics_text,
        'neutral_critics', neutral_critics_text,
        'negative_critics', negative_critics_text,
        'positive_users', positive_users_text,
        'neutral_users', neutral_users_text,
        'negative_users', negative_users_text,
        'metascore', metascore_text,
        'user_score_100', user_score_text
      ) as raw_payload
    from games_library_private.staging_metacritic_review_sentiment
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
      on gn.normalized_title_key = er.normalized_title_key
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

grant execute on function games_library_private.refresh_metacritic_review_sentiment_candidates()
  to service_role;

create or replace function games_library_private.apply_approved_metacritic_review_sentiment(
  p_limit int default 10000
)
returns table(
  candidates_applied int,
  external_ids_upserted int,
  review_sentiment_snapshots_upserted int,
  scores_upserted int,
  age_ratings_upserted int,
  companies_upserted int
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
  external_ids_upserted := 0;
  review_sentiment_snapshots_upserted := 0;
  scores_upserted := 0;
  age_ratings_upserted := 0;
  companies_upserted := 0;

  for v_candidate in
    select
      c.*,
      s.release_date_text as sentiment_release_date_text,
      s.developer_text as sentiment_developer_text,
      s.genre_text as sentiment_genre_text,
      s.number_players_text as sentiment_number_players_text,
      s.rating_text as sentiment_rating_text,
      s.positive_critics_text as sentiment_positive_critics_text,
      s.neutral_critics_text as sentiment_neutral_critics_text,
      s.negative_critics_text as sentiment_negative_critics_text,
      s.positive_users_text as sentiment_positive_users_text,
      s.neutral_users_text as sentiment_neutral_users_text,
      s.negative_users_text as sentiment_negative_users_text,
      s.metascore_text as sentiment_metascore_text,
      s.user_score_text as sentiment_user_score_text
    from games_library.game_external_match_candidates c
    join games_library_private.staging_metacritic_review_sentiment s
      on s.staging_row_id = c.source_row_id
    where c.source = 'metacritic'
      and c.source_dataset = 'metacritic_review_sentiment'
      and c.status in ('auto_approved', 'approved')
      and c.applied_at is null
    order by c.confidence_score desc, c.created_at
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
      'metacritic_review_sentiment',
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
    external_ids_upserted := external_ids_upserted + v_count;

    insert into games_library.game_review_sentiment_snapshots (
      game_id,
      platform_id,
      source,
      source_dataset,
      source_key,
      source_release_date,
      source_release_year,
      metascore,
      user_score_100,
      positive_critics,
      neutral_critics,
      negative_critics,
      positive_users,
      neutral_users,
      negative_users,
      developer_text,
      genre_text,
      number_players_text,
      rating_board,
      rating,
      match_candidate_id,
      metadata
    )
    values (
      v_candidate.game_id,
      v_candidate.source_platform_id,
      'metacritic',
      'metacritic_review_sentiment',
      v_candidate.source_key,
      games_library_private.parse_metacritic_release_date(v_candidate.sentiment_release_date_text),
      v_candidate.source_release_year,
      games_library_private.parse_external_int(v_candidate.sentiment_metascore_text),
      games_library_private.parse_external_int(v_candidate.sentiment_user_score_text),
      coalesce(games_library_private.parse_external_int(v_candidate.sentiment_positive_critics_text), 0),
      coalesce(games_library_private.parse_external_int(v_candidate.sentiment_neutral_critics_text), 0),
      coalesce(games_library_private.parse_external_int(v_candidate.sentiment_negative_critics_text), 0),
      coalesce(games_library_private.parse_external_int(v_candidate.sentiment_positive_users_text), 0),
      coalesce(games_library_private.parse_external_int(v_candidate.sentiment_neutral_users_text), 0),
      coalesce(games_library_private.parse_external_int(v_candidate.sentiment_negative_users_text), 0),
      nullif(btrim(coalesce(v_candidate.sentiment_developer_text, '')), ''),
      nullif(btrim(coalesce(v_candidate.sentiment_genre_text, '')), ''),
      nullif(btrim(coalesce(v_candidate.sentiment_number_players_text, '')), ''),
      case when btrim(coalesce(v_candidate.sentiment_rating_text, '')) <> '' then 'ESRB' else null end,
      nullif(btrim(coalesce(v_candidate.sentiment_rating_text, '')), ''),
      v_candidate.id,
      jsonb_build_object('user_score_scale', '0_100')
    )
    on conflict (game_id, platform_id, source_dataset, source_key) do update set
      source_release_date = excluded.source_release_date,
      source_release_year = excluded.source_release_year,
      metascore = excluded.metascore,
      user_score_100 = excluded.user_score_100,
      positive_critics = excluded.positive_critics,
      neutral_critics = excluded.neutral_critics,
      negative_critics = excluded.negative_critics,
      positive_users = excluded.positive_users,
      neutral_users = excluded.neutral_users,
      negative_users = excluded.negative_users,
      developer_text = excluded.developer_text,
      genre_text = excluded.genre_text,
      number_players_text = excluded.number_players_text,
      rating_board = excluded.rating_board,
      rating = excluded.rating,
      match_candidate_id = excluded.match_candidate_id,
      metadata = excluded.metadata,
      updated_at = now();
    get diagnostics v_count = row_count;
    review_sentiment_snapshots_upserted := review_sentiment_snapshots_upserted + v_count;

    insert into games_library.game_scores (
      game_id,
      platform_id,
      score_source,
      critic_score,
      critic_count,
      user_score,
      user_count,
      source_key,
      match_candidate_id,
      metadata
    )
    values (
      v_candidate.game_id,
      v_candidate.source_platform_id,
      'metacritic_review_sentiment',
      games_library_private.parse_external_numeric(v_candidate.sentiment_metascore_text),
      coalesce(games_library_private.parse_external_int(v_candidate.sentiment_positive_critics_text), 0)
        + coalesce(games_library_private.parse_external_int(v_candidate.sentiment_neutral_critics_text), 0)
        + coalesce(games_library_private.parse_external_int(v_candidate.sentiment_negative_critics_text), 0),
      games_library_private.parse_external_numeric(v_candidate.sentiment_user_score_text) / 10.0,
      coalesce(games_library_private.parse_external_int(v_candidate.sentiment_positive_users_text), 0)
        + coalesce(games_library_private.parse_external_int(v_candidate.sentiment_neutral_users_text), 0)
        + coalesce(games_library_private.parse_external_int(v_candidate.sentiment_negative_users_text), 0),
      v_candidate.source_key,
      v_candidate.id,
      jsonb_build_object('original_user_score_scale', '0_100')
    )
    on conflict (game_id, platform_id, score_source, source_key) do update set
      critic_score = excluded.critic_score,
      critic_count = excluded.critic_count,
      user_score = excluded.user_score,
      user_count = excluded.user_count,
      match_candidate_id = excluded.match_candidate_id,
      metadata = excluded.metadata,
      updated_at = now();
    get diagnostics v_count = row_count;
    scores_upserted := scores_upserted + v_count;

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
      btrim(v_candidate.sentiment_rating_text),
      'metacritic_review_sentiment',
      v_candidate.source_key,
      v_candidate.id
    where btrim(coalesce(v_candidate.sentiment_rating_text, '')) <> ''
    on conflict (game_id, platform_id, rating_board, source, source_key) do update set
      rating = excluded.rating,
      match_candidate_id = excluded.match_candidate_id,
      updated_at = now();
    get diagnostics v_count = row_count;
    age_ratings_upserted := age_ratings_upserted + v_count;

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
      btrim(v_candidate.sentiment_developer_text),
      'developer',
      'metacritic_review_sentiment',
      v_candidate.source_key,
      v_candidate.id
    where btrim(coalesce(v_candidate.sentiment_developer_text, '')) <> ''
    on conflict (game_id, company_name, role, source) do update set
      match_candidate_id = excluded.match_candidate_id,
      updated_at = now();
    get diagnostics v_count = row_count;
    companies_upserted := companies_upserted + v_count;

    update games_library.game_external_match_candidates
    set applied_at = now()
    where id = v_candidate.id;

    candidates_applied := candidates_applied + 1;
  end loop;

  return next;
end;
$$;

grant execute on function games_library_private.apply_approved_metacritic_review_sentiment(int)
  to service_role;

create or replace view games_library.review_sentiment_enrichment_summary
with (security_invoker = true)
as
select
  source,
  source_dataset,
  count(*) as snapshot_count,
  count(distinct game_id) as distinct_games,
  count(distinct platform_id) as distinct_platforms,
  round(avg(metascore), 2) as avg_metascore,
  round(avg(user_score_100), 2) as avg_user_score_100,
  sum(critic_review_count) as total_critic_reviews,
  sum(user_review_count) as total_user_reviews
from games_library.game_review_sentiment_snapshots
group by source, source_dataset;

revoke all on table games_library.review_sentiment_enrichment_summary
  from public, anon, authenticated;
grant select on table games_library.review_sentiment_enrichment_summary
  to service_role;

commit;

-- Down:
-- begin;
-- drop view if exists games_library.review_sentiment_enrichment_summary;
-- drop function if exists games_library_private.apply_approved_metacritic_review_sentiment(int);
-- drop function if exists games_library_private.refresh_metacritic_review_sentiment_candidates();
-- drop table if exists games_library.game_review_sentiment_snapshots;
-- drop table if exists games_library_private.staging_metacritic_review_sentiment;
-- commit;
