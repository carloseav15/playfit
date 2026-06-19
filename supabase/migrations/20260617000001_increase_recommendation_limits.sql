-- Migration: Increase recommendation and picks limits
-- nextUp: 10 → 100, resume: 10 → 100, picks: 20 → 100

create or replace function games_library.score_today_recommendations(
  p_liked_tags jsonb,
  p_disliked_tags jsonb,
  p_liked_genres text[],
  p_avoided_genres text[],
  p_rated_count int,
  p_accessible_platform_ids text[],
  p_onboarding_liked_ids text[],
  p_onboarding_disliked_ids text[],
  p_game_states jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_confidence_mult double precision;
  v_confidence_text text;
  v_result jsonb;
begin
  v_confidence_text := games_library.confidence_label(p_rated_count);
  v_confidence_mult := case v_confidence_text
    when 'high' then 1.0
    when 'medium' then 0.9
    else 0.65
  end;

  with
  game_states_expanded as (
    select
      kv.key as game_id,
      kv.value ->> 'status' as game_status,
      kv.value ->> 'updatedAt' as game_updated_at,
      (kv.value ->> 'excluded')::boolean as game_excluded,
      (kv.value ->> 'inWishlist')::boolean as game_in_wishlist,
      (kv.value ->> 'inPlayfitPicks')::boolean as game_in_playfit_picks
    from jsonb_each(coalesce(p_game_states, '{}'::jsonb)) as kv(key, value)
  ),

  scored_games as (
    select
      g.game_id,
      g.title,
      g.tags,
      g.cover_url,
      g.genre_id,
      g.series_id,
      s.name as series_name,
      g.release_state,
      g.sort_date::text as sort_date,
      games_library.weighted_cosine_similarity(g.tags, p_liked_tags) as sim_liked,
      games_library.weighted_cosine_similarity(g.tags, p_disliked_tags) as sim_disliked,
      coalesce(g.genre_id = any(p_liked_genres), false) as genre_match,
      coalesce(g.genre_id = any(p_avoided_genres), false) as genre_avoid,
      coalesce(
        exists(
          select 1 from games_library.game_platforms gp
          where gp.game_id = g.game_id
          and gp.platform_id = any(p_accessible_platform_ids)
        ),
        false
      ) as on_platform,
      coalesce(array_length(g.tags, 1) > 0, false) as scorable,
      gs.game_status,
      gs.game_updated_at,
      coalesce(gs.game_excluded, false) as excluded,
      coalesce(gs.game_in_wishlist, false) as in_wishlist,
      coalesce(gs.game_in_playfit_picks, false) as in_playfit_picks
    from games_library.games g
    left join games_library.series s on s.id = g.series_id
    left join game_states_expanded gs on gs.game_id = g.game_id
    where (
      coalesce(p_liked_tags, '{}'::jsonb) = '{}'::jsonb
      and coalesce(p_disliked_tags, '{}'::jsonb) = '{}'::jsonb
    )
    or g.tags && array(
      select jsonb_object_keys(coalesce(p_liked_tags, '{}'::jsonb) || coalesce(p_disliked_tags, '{}'::jsonb))
    )
  ),

  computed as (
    select
      *,
      case when not scorable then 0
        else greatest(0, least(100, (
          15 + round(((15.0 + sim_liked * 85.0 + case when genre_match then 8.0 else 0.0 end) - 15.0) * v_confidence_mult)
        )::int))
      end as affinity_score,
      case when not scorable then 0
        else greatest(0, least(100, (
          10 + round(((10.0 + sim_disliked * 90.0 + case when genre_avoid then 6.0 else 0.0 end
            + case when g.tags @> array['souls_like', 'demanding']
                    and (coalesce((p_disliked_tags ->> 'souls_like')::int, 0)
                       + coalesce((p_disliked_tags ->> 'demanding')::int, 0)) > 0
              then 15.0 else 0.0 end
            + case when coalesce((p_disliked_tags ->> 'horror')::int, 0) > 0
                    and (g.tags && array['horror', 'dark'])
              then 12.0 else 0.0 end
          ) - 10.0) * v_confidence_mult)
        )::int))
      end as risk_score,
      case when not scorable then 'low' else v_confidence_text end as confidence,
      case
        when g.release_state = 'unreleased' then 'unreleased'
        when not on_platform then 'not_on_platforms'
        else 'playable'
      end as access_status,
      case
        when on_platform then 'available'
        else 'unavailable'
      end as platform_availability
    from scored_games g
  )

  select jsonb_build_object(
    'currentRun', coalesce((
      select jsonb_agg(sub.result)
      from (
        select jsonb_build_object(
          'game', jsonb_build_object(
            'gameId', c.game_id,
            'title', c.title,
            'coverPath', c.cover_url,
            'externalCoverUrl', null::text,
            'primaryGenre', c.genre_id,
            'genreId', c.genre_id,
            'series', coalesce(c.series_name, 'Unknown'),
            'seriesId', c.series_id,
            'tags', c.tags
          ),
          'affinityScore', c.affinity_score,
          'riskScore', c.risk_score,
          'confidence', c.confidence,
          'accessStatus', c.access_status,
          'platformAvailability', c.platform_availability,
          'inBacklog', false,
          'inWishlist', false,
          'inPlayfitPicks', false,
          'fitReasons', '[]'::jsonb,
          'cautionReasons', '[]'::jsonb,
          'similarGames', '[]'::jsonb
        ) as result
        from computed c
        where c.game_status = 'playing'
          and c.game_id <> all(p_onboarding_liked_ids || coalesce(p_onboarding_disliked_ids, array[]::text[]))
          and not c.excluded
        order by c.affinity_score desc, c.risk_score asc, c.game_updated_at desc nulls last
      ) sub
    ), '[]'::jsonb),

    'nextUp', coalesce((
      select jsonb_agg(sub.result)
      from (
        select jsonb_build_object(
          'game', jsonb_build_object(
            'gameId', c.game_id,
            'title', c.title,
            'coverPath', c.cover_url,
            'externalCoverUrl', null::text,
            'primaryGenre', c.genre_id,
            'genreId', c.genre_id,
            'series', coalesce(c.series_name, 'Unknown'),
            'seriesId', c.series_id,
            'tags', c.tags
          ),
          'affinityScore', c.affinity_score,
          'riskScore', c.risk_score,
          'confidence', c.confidence,
          'accessStatus', c.access_status,
          'platformAvailability', c.platform_availability,
          'inBacklog', false,
          'inWishlist', c.in_wishlist,
          'inPlayfitPicks', c.in_playfit_picks,
          'fitReasons', '[]'::jsonb,
          'cautionReasons', '[]'::jsonb,
          'similarGames', '[]'::jsonb
        ) as result
        from computed c
        where c.access_status = 'playable'
          and c.risk_score < 58
          and c.game_status is distinct from 'playing'
          and c.game_status is distinct from 'on_hold'
          and c.game_status is distinct from 'shelved'
          and c.game_status is distinct from 'abandoned'
          and c.game_status is distinct from 'completed'
          and c.game_status is distinct from 'beaten'
          and not c.excluded
          and not c.in_wishlist
          and not c.in_playfit_picks
          and c.game_id <> all(p_onboarding_liked_ids || coalesce(p_onboarding_disliked_ids, array[]::text[]))
        order by c.affinity_score desc, c.risk_score asc
        limit 100
      ) sub
    ), '[]'::jsonb),

    'resume', coalesce((
      select jsonb_agg(sub.result)
      from (
        select jsonb_build_object(
          'game', jsonb_build_object(
            'gameId', c.game_id,
            'title', c.title,
            'coverPath', c.cover_url,
            'externalCoverUrl', null::text,
            'primaryGenre', c.genre_id,
            'genreId', c.genre_id,
            'series', coalesce(c.series_name, 'Unknown'),
            'seriesId', c.series_id,
            'tags', c.tags
          ),
          'affinityScore', c.affinity_score,
          'riskScore', c.risk_score,
          'confidence', c.confidence,
          'accessStatus', c.access_status,
          'platformAvailability', c.platform_availability,
          'inBacklog', false,
          'inWishlist', false,
          'inPlayfitPicks', false,
          'fitReasons', '[]'::jsonb,
          'cautionReasons', '[]'::jsonb,
          'similarGames', '[]'::jsonb
        ) as result
        from computed c
        where c.access_status = 'playable'
          and (c.game_status = 'on_hold' or c.game_status = 'shelved')
          and (c.game_status is distinct from 'completed')
          and (c.game_status is distinct from 'beaten')
          and c.game_id <> all(p_onboarding_liked_ids || coalesce(p_onboarding_disliked_ids, array[]::text[]))
          and not c.excluded
        order by c.affinity_score desc
        limit 100
      ) sub
    ), '[]'::jsonb),

    'picks', coalesce((
      select jsonb_agg(sub.result)
      from (
        select jsonb_build_object(
          'game', jsonb_build_object(
            'gameId', c.game_id,
            'title', c.title,
            'coverPath', c.cover_url,
            'externalCoverUrl', null::text,
            'primaryGenre', c.genre_id,
            'genreId', c.genre_id,
            'series', coalesce(c.series_name, 'Unknown'),
            'seriesId', c.series_id,
            'tags', c.tags
          ),
          'affinityScore', c.affinity_score,
          'riskScore', c.risk_score,
          'confidence', c.confidence,
          'accessStatus', c.access_status,
          'platformAvailability', c.platform_availability,
          'inBacklog', false,
          'inWishlist', false,
          'inPlayfitPicks', true,
          'fitReasons', '[]'::jsonb,
          'cautionReasons', '[]'::jsonb,
          'similarGames', '[]'::jsonb
        ) as result
        from computed c
        where c.access_status = 'playable'
          and c.in_playfit_picks
          and c.game_status is distinct from 'completed'
          and c.game_status is distinct from 'beaten'
          and c.game_status is distinct from 'abandoned'
          and c.game_id <> all(p_onboarding_liked_ids || coalesce(p_onboarding_disliked_ids, array[]::text[]))
          and not c.excluded
        order by c.affinity_score desc, c.risk_score asc,
          case c.confidence
            when 'high' then 0
            when 'medium' then 1
            when 'low' then 2
          end asc
        limit 100
      ) sub
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function games_library.score_today_recommendations to anon, authenticated, service_role;

-- Down:
-- create or replace function games_library.score_today_recommendations(…)
-- with all limits reset to: nextUp 10, resume 10, picks 20
