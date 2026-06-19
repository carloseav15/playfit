-- Harden duplicate merge execution so enriched external metadata is moved from
-- loser rows to the reviewed winner before deleting loser games.
begin;

create schema if not exists games_library_private;

create or replace function games_library_private.move_duplicate_enrichment_to_winner(
  p_loser_game_id text,
  p_winner_game_id text
) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_loser_game_id is null or btrim(p_loser_game_id) = '' then
    raise exception 'p_loser_game_id is required';
  end if;

  if p_winner_game_id is null or btrim(p_winner_game_id) = '' then
    raise exception 'p_winner_game_id is required';
  end if;

  if p_loser_game_id = p_winner_game_id then
    raise exception 'Cannot move enrichment from % into itself', p_loser_game_id;
  end if;

  if not exists (select 1 from games_library.games where game_id = p_loser_game_id) then
    raise exception 'Loser game % does not exist', p_loser_game_id;
  end if;

  if not exists (select 1 from games_library.games where game_id = p_winner_game_id) then
    raise exception 'Winner game % does not exist', p_winner_game_id;
  end if;

  -- First reconcile external match candidates. Several enrichment tables point
  -- at candidate IDs, and game_external_match_candidates uses ON DELETE RESTRICT.
  with candidate_conflicts as (
    select
      loser.id as loser_candidate_id,
      winner.id as winner_candidate_id
    from games_library.game_external_match_candidates loser
    join games_library.game_external_match_candidates winner
      on winner.game_id = p_winner_game_id
     and winner.source = loser.source
     and winner.source_key = loser.source_key
    where loser.game_id = p_loser_game_id
  )
  update games_library.game_external_ids t
  set
    match_candidate_id = c.winner_candidate_id,
    updated_at = now()
  from candidate_conflicts c
  where t.match_candidate_id = c.loser_candidate_id;

  with candidate_conflicts as (
    select
      loser.id as loser_candidate_id,
      winner.id as winner_candidate_id
    from games_library.game_external_match_candidates loser
    join games_library.game_external_match_candidates winner
      on winner.game_id = p_winner_game_id
     and winner.source = loser.source
     and winner.source_key = loser.source_key
    where loser.game_id = p_loser_game_id
  )
  update games_library.game_releases t
  set
    match_candidate_id = c.winner_candidate_id,
    updated_at = now()
  from candidate_conflicts c
  where t.match_candidate_id = c.loser_candidate_id;

  with candidate_conflicts as (
    select
      loser.id as loser_candidate_id,
      winner.id as winner_candidate_id
    from games_library.game_external_match_candidates loser
    join games_library.game_external_match_candidates winner
      on winner.game_id = p_winner_game_id
     and winner.source = loser.source
     and winner.source_key = loser.source_key
    where loser.game_id = p_loser_game_id
  )
  update games_library.game_companies t
  set
    match_candidate_id = c.winner_candidate_id,
    updated_at = now()
  from candidate_conflicts c
  where t.match_candidate_id = c.loser_candidate_id;

  with candidate_conflicts as (
    select
      loser.id as loser_candidate_id,
      winner.id as winner_candidate_id
    from games_library.game_external_match_candidates loser
    join games_library.game_external_match_candidates winner
      on winner.game_id = p_winner_game_id
     and winner.source = loser.source
     and winner.source_key = loser.source_key
    where loser.game_id = p_loser_game_id
  )
  update games_library.game_scores t
  set
    match_candidate_id = c.winner_candidate_id,
    updated_at = now()
  from candidate_conflicts c
  where t.match_candidate_id = c.loser_candidate_id;

  with candidate_conflicts as (
    select
      loser.id as loser_candidate_id,
      winner.id as winner_candidate_id
    from games_library.game_external_match_candidates loser
    join games_library.game_external_match_candidates winner
      on winner.game_id = p_winner_game_id
     and winner.source = loser.source
     and winner.source_key = loser.source_key
    where loser.game_id = p_loser_game_id
  )
  update games_library.game_age_ratings t
  set
    match_candidate_id = c.winner_candidate_id,
    updated_at = now()
  from candidate_conflicts c
  where t.match_candidate_id = c.loser_candidate_id;

  with candidate_conflicts as (
    select
      loser.id as loser_candidate_id,
      winner.id as winner_candidate_id
    from games_library.game_external_match_candidates loser
    join games_library.game_external_match_candidates winner
      on winner.game_id = p_winner_game_id
     and winner.source = loser.source
     and winner.source_key = loser.source_key
    where loser.game_id = p_loser_game_id
  )
  update games_library.game_summaries t
  set
    match_candidate_id = c.winner_candidate_id,
    updated_at = now()
  from candidate_conflicts c
  where t.match_candidate_id = c.loser_candidate_id;

  with candidate_conflicts as (
    select
      loser.id as loser_candidate_id,
      winner.id as winner_candidate_id
    from games_library.game_external_match_candidates loser
    join games_library.game_external_match_candidates winner
      on winner.game_id = p_winner_game_id
     and winner.source = loser.source
     and winner.source_key = loser.source_key
    where loser.game_id = p_loser_game_id
  )
  update games_library.game_sales_snapshots t
  set
    match_candidate_id = c.winner_candidate_id,
    updated_at = now()
  from candidate_conflicts c
  where t.match_candidate_id = c.loser_candidate_id;

  with candidate_conflicts as (
    select
      loser.id as loser_candidate_id,
      winner.id as winner_candidate_id
    from games_library.game_external_match_candidates loser
    join games_library.game_external_match_candidates winner
      on winner.game_id = p_winner_game_id
     and winner.source = loser.source
     and winner.source_key = loser.source_key
    where loser.game_id = p_loser_game_id
  )
  update games_library.game_review_sentiment_snapshots t
  set
    match_candidate_id = c.winner_candidate_id,
    updated_at = now()
  from candidate_conflicts c
  where t.match_candidate_id = c.loser_candidate_id;

  with candidate_conflicts as (
    select
      loser.id as loser_candidate_id,
      winner.id as winner_candidate_id,
      loser.*
    from games_library.game_external_match_candidates loser
    join games_library.game_external_match_candidates winner
      on winner.game_id = p_winner_game_id
     and winner.source = loser.source
     and winner.source_key = loser.source_key
    where loser.game_id = p_loser_game_id
  )
  update games_library.game_external_match_candidates winner
  set
    source_dataset = coalesce(nullif(winner.source_dataset, ''), c.source_dataset),
    source_row_id = case
      when winner.source_row_id is null then c.source_row_id
      else winner.source_row_id
    end,
    source_title = coalesce(nullif(winner.source_title, ''), c.source_title),
    source_platform_text = coalesce(winner.source_platform_text, c.source_platform_text),
    source_platform_id = coalesce(winner.source_platform_id, c.source_platform_id),
    source_release_year = coalesce(winner.source_release_year, c.source_release_year),
    confidence_score = greatest(winner.confidence_score, c.confidence_score),
    matched_by = case
      when winner.confidence_score >= c.confidence_score then winner.matched_by
      else c.matched_by
    end,
    status = case
      when winner.applied_at is null and c.applied_at is not null then c.status
      when winner.status in ('low_confidence', 'needs_review') and c.status in ('auto_approved', 'approved') then c.status
      else winner.status
    end,
    signals = winner.signals || c.signals,
    raw_payload = winner.raw_payload || jsonb_build_object(
      'merged_loser_candidate',
      jsonb_build_object(
        'id', c.loser_candidate_id,
        'game_id', p_loser_game_id,
        'status', c.status,
        'confidence_score', c.confidence_score,
        'matched_by', c.matched_by
      )
    ),
    applied_at = coalesce(winner.applied_at, c.applied_at),
    reviewed_by = coalesce(winner.reviewed_by, c.reviewed_by),
    reviewed_at = coalesce(winner.reviewed_at, c.reviewed_at),
    review_notes = case
      when btrim(c.review_notes) = '' then winner.review_notes
      when btrim(winner.review_notes) = '' then c.review_notes
      else winner.review_notes || E'\nMerged loser candidate ' || c.loser_candidate_id::text || ': ' || c.review_notes
    end,
    created_at = least(winner.created_at, c.created_at),
    updated_at = now()
  from candidate_conflicts c
  where winner.id = c.winner_candidate_id;

  delete from games_library.game_external_match_candidates c
  using (
    select loser.id as loser_candidate_id
    from games_library.game_external_match_candidates loser
    join games_library.game_external_match_candidates winner
      on winner.game_id = p_winner_game_id
     and winner.source = loser.source
     and winner.source_key = loser.source_key
    where loser.game_id = p_loser_game_id
  ) conflicts
  where c.id = conflicts.loser_candidate_id;

  update games_library.game_external_match_candidates c
  set
    game_id = p_winner_game_id,
    review_notes = case
      when btrim(c.review_notes) = '' then 'Moved from duplicate loser ' || p_loser_game_id
      else c.review_notes || E'\nMoved from duplicate loser ' || p_loser_game_id
    end,
    updated_at = now()
  where c.game_id = p_loser_game_id;

  -- External IDs.
  update games_library.game_external_ids winner
  set
    source_title = coalesce(nullif(winner.source_title, ''), loser.source_title),
    source_platform_id = coalesce(winner.source_platform_id, loser.source_platform_id),
    confidence_score = greatest(winner.confidence_score, loser.confidence_score),
    match_candidate_id = coalesce(winner.match_candidate_id, loser.match_candidate_id),
    metadata = winner.metadata || loser.metadata || jsonb_build_object('merged_from_game_id', p_loser_game_id),
    created_at = least(winner.created_at, loser.created_at),
    updated_at = now()
  from games_library.game_external_ids loser
  where winner.game_id = p_winner_game_id
    and loser.game_id = p_loser_game_id
    and winner.provider = loser.provider
    and winner.provider_game_key = loser.provider_game_key;

  insert into games_library.game_external_ids (
    game_id,
    provider,
    provider_game_key,
    source_title,
    source_platform_id,
    confidence_score,
    match_candidate_id,
    metadata,
    created_at,
    updated_at
  )
  select
    p_winner_game_id,
    loser.provider,
    loser.provider_game_key,
    loser.source_title,
    loser.source_platform_id,
    loser.confidence_score,
    loser.match_candidate_id,
    loser.metadata || jsonb_build_object('merged_from_game_id', p_loser_game_id),
    loser.created_at,
    now()
  from games_library.game_external_ids loser
  where loser.game_id = p_loser_game_id
    and not exists (
      select 1
      from games_library.game_external_ids winner
      where winner.game_id = p_winner_game_id
        and winner.provider = loser.provider
        and winner.provider_game_key = loser.provider_game_key
    );

  delete from games_library.game_external_ids
  where game_id = p_loser_game_id;

  -- Releases.
  update games_library.game_releases winner
  set
    release_date = coalesce(winner.release_date, loser.release_date),
    release_year = coalesce(winner.release_year, loser.release_year),
    match_candidate_id = coalesce(winner.match_candidate_id, loser.match_candidate_id),
    metadata = winner.metadata || loser.metadata || jsonb_build_object('merged_from_game_id', p_loser_game_id),
    created_at = least(winner.created_at, loser.created_at),
    updated_at = now()
  from games_library.game_releases loser
  where winner.game_id = p_winner_game_id
    and loser.game_id = p_loser_game_id
    and winner.platform_id is not distinct from loser.platform_id
    and winner.source = loser.source
    and winner.source_key = loser.source_key;

  insert into games_library.game_releases (
    game_id,
    platform_id,
    release_date,
    release_year,
    source,
    source_key,
    match_candidate_id,
    metadata,
    created_at,
    updated_at
  )
  select
    p_winner_game_id,
    loser.platform_id,
    loser.release_date,
    loser.release_year,
    loser.source,
    loser.source_key,
    loser.match_candidate_id,
    loser.metadata || jsonb_build_object('merged_from_game_id', p_loser_game_id),
    loser.created_at,
    now()
  from games_library.game_releases loser
  where loser.game_id = p_loser_game_id
    and not exists (
      select 1
      from games_library.game_releases winner
      where winner.game_id = p_winner_game_id
        and winner.platform_id is not distinct from loser.platform_id
        and winner.source = loser.source
        and winner.source_key = loser.source_key
    );

  delete from games_library.game_releases
  where game_id = p_loser_game_id;

  -- Companies.
  update games_library.game_companies winner
  set
    source_key = case
      when btrim(winner.source_key) = '' then loser.source_key
      else winner.source_key
    end,
    match_candidate_id = coalesce(winner.match_candidate_id, loser.match_candidate_id),
    metadata = winner.metadata || loser.metadata || jsonb_build_object(
      'merged_from_game_id',
      p_loser_game_id,
      'merged_source_key',
      loser.source_key
    ),
    created_at = least(winner.created_at, loser.created_at),
    updated_at = now()
  from games_library.game_companies loser
  where winner.game_id = p_winner_game_id
    and loser.game_id = p_loser_game_id
    and winner.company_name = loser.company_name
    and winner.role = loser.role
    and winner.source = loser.source;

  insert into games_library.game_companies (
    game_id,
    company_name,
    role,
    source,
    source_key,
    match_candidate_id,
    metadata,
    created_at,
    updated_at
  )
  select
    p_winner_game_id,
    loser.company_name,
    loser.role,
    loser.source,
    loser.source_key,
    loser.match_candidate_id,
    loser.metadata || jsonb_build_object('merged_from_game_id', p_loser_game_id),
    loser.created_at,
    now()
  from games_library.game_companies loser
  where loser.game_id = p_loser_game_id
    and not exists (
      select 1
      from games_library.game_companies winner
      where winner.game_id = p_winner_game_id
        and winner.company_name = loser.company_name
        and winner.role = loser.role
        and winner.source = loser.source
    );

  delete from games_library.game_companies
  where game_id = p_loser_game_id;

  -- Scores.
  update games_library.game_scores winner
  set
    critic_score = coalesce(winner.critic_score, loser.critic_score),
    critic_count = case
      when winner.critic_count is null and loser.critic_count is null then null
      else greatest(coalesce(winner.critic_count, 0), coalesce(loser.critic_count, 0))
    end,
    user_score = coalesce(winner.user_score, loser.user_score),
    user_count = case
      when winner.user_count is null and loser.user_count is null then null
      else greatest(coalesce(winner.user_count, 0), coalesce(loser.user_count, 0))
    end,
    match_candidate_id = coalesce(winner.match_candidate_id, loser.match_candidate_id),
    metadata = winner.metadata || loser.metadata || jsonb_build_object('merged_from_game_id', p_loser_game_id),
    created_at = least(winner.created_at, loser.created_at),
    updated_at = now()
  from games_library.game_scores loser
  where winner.game_id = p_winner_game_id
    and loser.game_id = p_loser_game_id
    and winner.platform_id is not distinct from loser.platform_id
    and winner.score_source = loser.score_source
    and winner.source_key = loser.source_key;

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
    metadata,
    created_at,
    updated_at
  )
  select
    p_winner_game_id,
    loser.platform_id,
    loser.score_source,
    loser.critic_score,
    loser.critic_count,
    loser.user_score,
    loser.user_count,
    loser.source_key,
    loser.match_candidate_id,
    loser.metadata || jsonb_build_object('merged_from_game_id', p_loser_game_id),
    loser.created_at,
    now()
  from games_library.game_scores loser
  where loser.game_id = p_loser_game_id
    and not exists (
      select 1
      from games_library.game_scores winner
      where winner.game_id = p_winner_game_id
        and winner.platform_id is not distinct from loser.platform_id
        and winner.score_source = loser.score_source
        and winner.source_key = loser.source_key
    );

  delete from games_library.game_scores
  where game_id = p_loser_game_id;

  -- Age ratings.
  update games_library.game_age_ratings winner
  set
    rating = case
      when btrim(winner.rating) = '' then loser.rating
      else winner.rating
    end,
    descriptors = coalesce(nullif(winner.descriptors, ''), loser.descriptors),
    match_candidate_id = coalesce(winner.match_candidate_id, loser.match_candidate_id),
    created_at = least(winner.created_at, loser.created_at),
    updated_at = now()
  from games_library.game_age_ratings loser
  where winner.game_id = p_winner_game_id
    and loser.game_id = p_loser_game_id
    and winner.platform_id is not distinct from loser.platform_id
    and winner.rating_board = loser.rating_board
    and winner.source = loser.source
    and winner.source_key = loser.source_key;

  insert into games_library.game_age_ratings (
    game_id,
    platform_id,
    rating_board,
    rating,
    descriptors,
    source,
    source_key,
    match_candidate_id,
    created_at,
    updated_at
  )
  select
    p_winner_game_id,
    loser.platform_id,
    loser.rating_board,
    loser.rating,
    loser.descriptors,
    loser.source,
    loser.source_key,
    loser.match_candidate_id,
    loser.created_at,
    now()
  from games_library.game_age_ratings loser
  where loser.game_id = p_loser_game_id
    and not exists (
      select 1
      from games_library.game_age_ratings winner
      where winner.game_id = p_winner_game_id
        and winner.platform_id is not distinct from loser.platform_id
        and winner.rating_board = loser.rating_board
        and winner.source = loser.source
        and winner.source_key = loser.source_key
    );

  delete from games_library.game_age_ratings
  where game_id = p_loser_game_id;

  -- Summaries.
  update games_library.game_summaries winner
  set
    summary = case
      when length(loser.summary) > length(winner.summary) then loser.summary
      else winner.summary
    end,
    match_candidate_id = coalesce(winner.match_candidate_id, loser.match_candidate_id),
    created_at = least(winner.created_at, loser.created_at),
    updated_at = now()
  from games_library.game_summaries loser
  where winner.game_id = p_winner_game_id
    and loser.game_id = p_loser_game_id
    and winner.source = loser.source
    and winner.source_key = loser.source_key;

  insert into games_library.game_summaries (
    game_id,
    summary,
    source,
    source_key,
    match_candidate_id,
    created_at,
    updated_at
  )
  select
    p_winner_game_id,
    loser.summary,
    loser.source,
    loser.source_key,
    loser.match_candidate_id,
    loser.created_at,
    now()
  from games_library.game_summaries loser
  where loser.game_id = p_loser_game_id
    and not exists (
      select 1
      from games_library.game_summaries winner
      where winner.game_id = p_winner_game_id
        and winner.source = loser.source
        and winner.source_key = loser.source_key
    );

  delete from games_library.game_summaries
  where game_id = p_loser_game_id;

  -- Sales snapshots. Business grain is game/platform/source/date; do not sum
  -- duplicate sales rows because that would double-count source duplicates.
  update games_library.game_sales_snapshots winner
  set
    source_key = case
      when btrim(winner.source_key) = '' then loser.source_key
      else winner.source_key
    end,
    na_sales_millions = case
      when winner.na_sales_millions is null and loser.na_sales_millions is null then null
      else greatest(coalesce(winner.na_sales_millions, 0), coalesce(loser.na_sales_millions, 0))
    end,
    eu_sales_millions = case
      when winner.eu_sales_millions is null and loser.eu_sales_millions is null then null
      else greatest(coalesce(winner.eu_sales_millions, 0), coalesce(loser.eu_sales_millions, 0))
    end,
    jp_sales_millions = case
      when winner.jp_sales_millions is null and loser.jp_sales_millions is null then null
      else greatest(coalesce(winner.jp_sales_millions, 0), coalesce(loser.jp_sales_millions, 0))
    end,
    other_sales_millions = case
      when winner.other_sales_millions is null and loser.other_sales_millions is null then null
      else greatest(coalesce(winner.other_sales_millions, 0), coalesce(loser.other_sales_millions, 0))
    end,
    global_sales_millions = case
      when winner.global_sales_millions is null and loser.global_sales_millions is null then null
      else greatest(coalesce(winner.global_sales_millions, 0), coalesce(loser.global_sales_millions, 0))
    end,
    match_candidate_id = coalesce(winner.match_candidate_id, loser.match_candidate_id),
    metadata = winner.metadata || loser.metadata || jsonb_build_object(
      'merged_from_game_id',
      p_loser_game_id,
      'merged_source_key',
      loser.source_key
    ),
    created_at = least(winner.created_at, loser.created_at),
    updated_at = now()
  from games_library.game_sales_snapshots loser
  where winner.game_id = p_winner_game_id
    and loser.game_id = p_loser_game_id
    and winner.platform_id is not distinct from loser.platform_id
    and winner.source = loser.source
    and winner.snapshot_date = loser.snapshot_date;

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
    match_candidate_id,
    metadata,
    created_at,
    updated_at
  )
  select
    p_winner_game_id,
    loser.platform_id,
    loser.source,
    loser.source_key,
    loser.snapshot_date,
    loser.na_sales_millions,
    loser.eu_sales_millions,
    loser.jp_sales_millions,
    loser.other_sales_millions,
    loser.global_sales_millions,
    loser.match_candidate_id,
    loser.metadata || jsonb_build_object('merged_from_game_id', p_loser_game_id),
    loser.created_at,
    now()
  from games_library.game_sales_snapshots loser
  where loser.game_id = p_loser_game_id
    and not exists (
      select 1
      from games_library.game_sales_snapshots winner
      where winner.game_id = p_winner_game_id
        and winner.platform_id is not distinct from loser.platform_id
        and winner.source = loser.source
        and winner.snapshot_date = loser.snapshot_date
    );

  delete from games_library.game_sales_snapshots
  where game_id = p_loser_game_id;

  -- Review sentiment snapshots.
  update games_library.game_review_sentiment_snapshots winner
  set
    source_release_date = coalesce(winner.source_release_date, loser.source_release_date),
    source_release_year = coalesce(winner.source_release_year, loser.source_release_year),
    metascore = coalesce(winner.metascore, loser.metascore),
    user_score_100 = coalesce(winner.user_score_100, loser.user_score_100),
    positive_critics = greatest(winner.positive_critics, loser.positive_critics),
    neutral_critics = greatest(winner.neutral_critics, loser.neutral_critics),
    negative_critics = greatest(winner.negative_critics, loser.negative_critics),
    positive_users = greatest(winner.positive_users, loser.positive_users),
    neutral_users = greatest(winner.neutral_users, loser.neutral_users),
    negative_users = greatest(winner.negative_users, loser.negative_users),
    developer_text = coalesce(winner.developer_text, loser.developer_text),
    genre_text = coalesce(winner.genre_text, loser.genre_text),
    number_players_text = coalesce(winner.number_players_text, loser.number_players_text),
    rating_board = coalesce(winner.rating_board, loser.rating_board),
    rating = coalesce(winner.rating, loser.rating),
    match_candidate_id = coalesce(winner.match_candidate_id, loser.match_candidate_id),
    metadata = winner.metadata || loser.metadata || jsonb_build_object('merged_from_game_id', p_loser_game_id),
    created_at = least(winner.created_at, loser.created_at),
    updated_at = now()
  from games_library.game_review_sentiment_snapshots loser
  where winner.game_id = p_winner_game_id
    and loser.game_id = p_loser_game_id
    and winner.platform_id is not distinct from loser.platform_id
    and winner.source_dataset = loser.source_dataset
    and winner.source_key = loser.source_key;

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
    metadata,
    created_at,
    updated_at
  )
  select
    p_winner_game_id,
    loser.platform_id,
    loser.source,
    loser.source_dataset,
    loser.source_key,
    loser.source_release_date,
    loser.source_release_year,
    loser.metascore,
    loser.user_score_100,
    loser.positive_critics,
    loser.neutral_critics,
    loser.negative_critics,
    loser.positive_users,
    loser.neutral_users,
    loser.negative_users,
    loser.developer_text,
    loser.genre_text,
    loser.number_players_text,
    loser.rating_board,
    loser.rating,
    loser.match_candidate_id,
    loser.metadata || jsonb_build_object('merged_from_game_id', p_loser_game_id),
    loser.created_at,
    now()
  from games_library.game_review_sentiment_snapshots loser
  where loser.game_id = p_loser_game_id
    and not exists (
      select 1
      from games_library.game_review_sentiment_snapshots winner
      where winner.game_id = p_winner_game_id
        and winner.platform_id is not distinct from loser.platform_id
        and winner.source_dataset = loser.source_dataset
        and winner.source_key = loser.source_key
    );

  delete from games_library.game_review_sentiment_snapshots
  where game_id = p_loser_game_id;
end;
$$;

comment on function games_library_private.move_duplicate_enrichment_to_winner(text, text) is
  'Moves external enrichment side-table rows from a duplicate loser game to the reviewed winner before the loser is deleted.';

revoke all on function games_library_private.move_duplicate_enrichment_to_winner(text, text)
  from public, anon, authenticated;
grant execute on function games_library_private.move_duplicate_enrichment_to_winner(text, text)
  to service_role;

create or replace function games_library_private.apply_approved_game_duplicate_merges(
  p_limit int default null
) returns table(
  run_id uuid,
  groups_processed int,
  games_retired int,
  redirects_created int,
  platforms_moved int,
  tags_moved int,
  aliases_moved int,
  user_states_moved int
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_groups int := 0;
  v_retired int := 0;
  v_redirects int := 0;
  v_platforms int := 0;
  v_tags int := 0;
  v_aliases int := 0;
  v_user_states int := 0;
  v_count int := 0;
  merge_row record;
begin
  if p_limit is not null and (p_limit < 1 or p_limit > 1000) then
    raise exception 'p_limit must be between 1 and 1000';
  end if;

  insert into games_library_private.game_duplicate_merge_runs (run_id, notes)
  values (v_run_id, 'approved duplicate merge execution with enrichment transfer');

  for merge_row in
    with keep_rows as (
      select group_key, game_id as winner_game_id
      from games_library.game_duplicate_candidates
      where proposed_action = 'keep'
    ),
    eligible_groups as (
      select
        g.group_key,
        k.winner_game_id
      from games_library.game_duplicate_groups g
      join keep_rows k on k.group_key = g.group_key
      where g.status = 'approved'
        and (
          select count(*)
          from games_library.game_duplicate_candidates c
          where c.group_key = g.group_key
            and c.proposed_action = 'keep'
        ) = 1
        and exists (
          select 1
          from games_library.game_duplicate_candidates c
          where c.group_key = g.group_key
            and c.proposed_action = 'merge_into_winner'
        )
        and not exists (
          select 1
          from games_library.game_duplicate_candidates c
          where c.group_key = g.group_key
            and c.proposed_action not in ('keep', 'merge_into_winner')
        )
        and not exists (
          select 1
          from games_library.game_duplicate_candidates c
          where c.group_key = g.group_key
            and c.proposed_action = 'merge_into_winner'
            and c.winner_game_id is distinct from k.winner_game_id
        )
      order by g.group_key
      limit coalesce(p_limit, 1000)
    )
    select
      eg.group_key,
      eg.winner_game_id,
      c.game_id as loser_game_id
    from eligible_groups eg
    join games_library.game_duplicate_candidates c
      on c.group_key = eg.group_key
     and c.proposed_action = 'merge_into_winner'
    order by eg.group_key, c.game_id
  loop
    insert into games_library_private.game_duplicate_merge_items (
      run_id,
      group_key,
      loser_game_id,
      winner_game_id,
      loser_snapshot,
      winner_snapshot_before
    )
    select
      v_run_id,
      merge_row.group_key,
      merge_row.loser_game_id,
      merge_row.winner_game_id,
      to_jsonb(l),
      to_jsonb(w)
    from games_library.games l
    join games_library.games w on w.game_id = merge_row.winner_game_id
    where l.game_id = merge_row.loser_game_id;

    update games_library.games w
    set
      aliases = coalesce((
        select array_agg(distinct alias_value order by alias_value)
        from unnest(w.aliases || l.aliases || array[l.title]) as alias_value
        where btrim(alias_value) <> ''
          and alias_value <> w.title
      ), '{}'::text[]),
      tags = coalesce((
        select array_agg(distinct tag_value order by tag_value)
        from unnest(w.tags || l.tags) as tag_value
        where btrim(tag_value) <> ''
      ), '{}'::text[]),
      release_year = case
        when w.release_year = 0 and l.release_year <> 0 then l.release_year
        else w.release_year
      end,
      sort_date = case
        when w.sort_date = date '1970-01-01' and l.sort_date <> date '1970-01-01' then l.sort_date
        else w.sort_date
      end,
      release_label = case
        when btrim(w.release_label) = '' and btrim(l.release_label) <> '' then l.release_label
        else w.release_label
      end,
      cover_url = case
        when btrim(w.cover_url) = '' and btrim(l.cover_url) <> '' then l.cover_url
        else w.cover_url
      end,
      genre_id = coalesce(w.genre_id, l.genre_id),
      series_id = coalesce(w.series_id, l.series_id),
      notes = case
        when btrim(l.notes) = '' then w.notes
        when btrim(w.notes) = '' then l.notes
        when position(l.notes in w.notes) > 0 then w.notes
        else w.notes || E'\nMerged duplicate notes from ' || l.game_id || ': ' || l.notes
      end,
      updated_at = now()
    from games_library.games l
    where w.game_id = merge_row.winner_game_id
      and l.game_id = merge_row.loser_game_id;

    insert into games_library.game_platforms (game_id, platform_id)
    select merge_row.winner_game_id, platform_id
    from games_library.game_platforms
    where game_id = merge_row.loser_game_id
    on conflict (game_id, platform_id) do nothing;
    get diagnostics v_count = row_count;
    v_platforms := v_platforms + v_count;

    insert into games_library.game_tags (game_id, tag_id)
    select merge_row.winner_game_id, tag_id
    from games_library.game_tags
    where game_id = merge_row.loser_game_id
    on conflict (game_id, tag_id) do nothing;
    get diagnostics v_count = row_count;
    v_tags := v_tags + v_count;

    insert into games_library.game_aliases (game_id, alias)
    select merge_row.winner_game_id, alias
    from games_library.game_aliases
    where game_id = merge_row.loser_game_id
    union
    select merge_row.winner_game_id, title
    from games_library.games
    where game_id = merge_row.loser_game_id
      and btrim(title) <> ''
    on conflict (game_id, alias) do nothing;
    get diagnostics v_count = row_count;
    v_aliases := v_aliases + v_count;

    insert into games_library.user_game_states (
      user_id,
      game_id,
      status,
      rating,
      in_backlog,
      in_wishlist,
      excluded,
      source,
      created_at,
      updated_at
    )
    select
      user_id,
      merge_row.winner_game_id,
      status,
      rating,
      in_backlog,
      in_wishlist,
      excluded,
      source,
      created_at,
      updated_at
    from games_library.user_game_states
    where game_id = merge_row.loser_game_id
    on conflict (user_id, game_id) do update set
      status = coalesce(excluded.status, games_library.user_game_states.status),
      rating = coalesce(excluded.rating, games_library.user_game_states.rating),
      in_backlog = games_library.user_game_states.in_backlog or excluded.in_backlog,
      in_wishlist = games_library.user_game_states.in_wishlist or excluded.in_wishlist,
      excluded = games_library.user_game_states.excluded and excluded.excluded,
      source = case
        when games_library.user_game_states.source = 'manual' then games_library.user_game_states.source
        else excluded.source
      end,
      created_at = least(games_library.user_game_states.created_at, excluded.created_at),
      updated_at = greatest(games_library.user_game_states.updated_at, excluded.updated_at);
    get diagnostics v_count = row_count;
    v_user_states := v_user_states + v_count;

    update games_library.profiles p
    set
      game_states = case
        when p.game_states ? merge_row.winner_game_id then p.game_states - merge_row.loser_game_id
        else (p.game_states - merge_row.loser_game_id) ||
          jsonb_build_object(
            merge_row.winner_game_id,
            jsonb_set(
              p.game_states -> merge_row.loser_game_id,
              '{gameId}',
              to_jsonb(merge_row.winner_game_id)
            )
          )
      end,
      updated_at = now()
    where p.game_states ? merge_row.loser_game_id;

    perform games_library_private.move_duplicate_enrichment_to_winner(
      merge_row.loser_game_id,
      merge_row.winner_game_id
    );

    delete from games_library.user_game_states
    where game_id = merge_row.loser_game_id;

    insert into games_library.game_redirects (
      from_game_id,
      to_game_id,
      reason,
      notes,
      created_by
    )
    values (
      merge_row.loser_game_id,
      merge_row.winner_game_id,
      'duplicate_merge',
      'Approved duplicate merge from group ' || merge_row.group_key,
      'games_library_private.apply_approved_game_duplicate_merges'
    )
    on conflict (from_game_id) do update set
      to_game_id = excluded.to_game_id,
      reason = excluded.reason,
      notes = excluded.notes,
      created_by = excluded.created_by,
      updated_at = now();
    get diagnostics v_count = row_count;
    v_redirects := v_redirects + v_count;

    delete from games_library.series_cleanup_applied
    where game_id = merge_row.loser_game_id;

    delete from games_library.game_duplicate_candidates
    where group_key = merge_row.group_key
      and game_id = merge_row.loser_game_id;

    delete from games_library.games
    where game_id = merge_row.loser_game_id;
    get diagnostics v_count = row_count;
    v_retired := v_retired + v_count;
  end loop;

  update games_library.game_duplicate_groups g
  set
    status = 'merged',
    review_notes = case
      when btrim(g.review_notes) = '' then 'Merged by run ' || v_run_id::text
      else g.review_notes || E'\nMerged by run ' || v_run_id::text
    end,
    reviewed_at = coalesce(g.reviewed_at, now()),
    updated_at = now()
  where g.status = 'approved'
    and exists (
      select 1
      from games_library_private.game_duplicate_merge_items i
      where i.run_id = v_run_id
        and i.group_key = g.group_key
    );
  get diagnostics v_groups = row_count;

  update games_library_private.game_duplicate_merge_runs
  set
    completed_at = now(),
    groups_processed = v_groups,
    games_retired = v_retired
  where game_duplicate_merge_runs.run_id = v_run_id;

  return query
  select
    v_run_id,
    v_groups,
    v_retired,
    v_redirects,
    v_platforms,
    v_tags,
    v_aliases,
    v_user_states;
end;
$$;

comment on function games_library_private.apply_approved_game_duplicate_merges(int) is
  'Executes explicitly approved duplicate groups: enriches the winner, moves joins/user state/external enrichment, creates redirects, audits snapshots, and deletes loser games.';

revoke all on function games_library_private.apply_approved_game_duplicate_merges(int)
  from public, anon, authenticated;
grant execute on function games_library_private.apply_approved_game_duplicate_merges(int)
  to service_role;

commit;

-- Down:
-- begin;
-- create or replace function games_library_private.apply_approved_game_duplicate_merges(int)
--   ... restore from migration 20260614000627_create_duplicate_merge_executor.sql if needed;
-- drop function if exists games_library_private.move_duplicate_enrichment_to_winner(text, text);
-- commit;
