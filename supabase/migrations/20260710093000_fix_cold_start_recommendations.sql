-- Two independent fixes required to let onboarding (platforms / loved games / missed
-- game) all be skippable without breaking cold-start recommendations:
--
--   1. accessible_games treated an empty p_accessible_platform_ids as "nothing is
--      accessible" (platform_id = any('{}') is false for every row) instead of "no
--      platform filter, everything with a platform assignment is accessible". Skipping
--      the Platforms step returned completely empty nextUp/resume/picks buckets, not
--      just weak ones, since on_platform/access_status/all three buckets gate on it.
--
--   2. game_quality_score only exposed critic_score/user_score, not the review-count
--      columns already present on games_library.game_scores, so the scoring function's
--      quality bonus couldn't distinguish a game with 1 review at 100 from one with 500
--      reviews at 95. This matters most for cold-start, where the quality bonus becomes
--      the dominant ranking signal once affinity/risk collapse to a flat baseline (no
--      taste data yet). Local dev DB critic_count distribution (non-null critic_score
--      rows): p10=2, p25=7, median=14, p75=26, p90=45, ~18% zero/null. A /10.0 trust
--      denominator gives median-count games full bonus trust and zero-count games none.
begin;

create or replace view games_library.game_quality_score as
 with critic_ranked as (
         select game_scores.game_id,
            game_scores.critic_score,
            game_scores.critic_count,
            row_number() over (partition by game_scores.game_id order by
                case game_scores.score_source
                    when 'metacritic'::text then 1
                    when 'metacritic_staging'::text then 2
                    when 'igdb'::text then 3
                    when 'rawg'::text then 4
                    when 'vgsales'::text then 5
                    when 'metacritic_review_sentiment'::text then 6
                    else 7
                end) as critic_rank
           from games_library.game_scores
          where (game_scores.critic_score is not null)
        ), user_ranked as (
         select game_scores.game_id,
            game_scores.user_score,
            game_scores.user_count,
            row_number() over (partition by game_scores.game_id order by
                case game_scores.score_source
                    when 'rawg'::text then 1
                    when 'metacritic'::text then 2
                    when 'igdb'::text then 3
                    when 'vgsales'::text then 4
                    when 'metacritic_staging'::text then 5
                    when 'metacritic_review_sentiment'::text then 6
                    else 7
                end) as user_rank
           from games_library.game_scores
          where (game_scores.user_score is not null)
        )
 select coalesce(c.game_id, u.game_id) as game_id,
    c.critic_score,
    u.user_score,
    c.critic_count,
    u.user_count
   from (( select critic_ranked.game_id,
            critic_ranked.critic_score,
            critic_ranked.critic_count,
            critic_ranked.critic_rank
           from critic_ranked
          where (critic_ranked.critic_rank = 1)) c
     full join ( select user_ranked.game_id,
            user_ranked.user_score,
            user_ranked.user_count,
            user_ranked.user_rank
           from user_ranked
          where (user_ranked.user_rank = 1)) u on ((u.game_id = c.game_id)));

create or replace function games_library.score_today_recommendations(p_liked_tags jsonb, p_disliked_tags jsonb, p_liked_genres text[], p_avoided_genres text[], p_rated_count integer, p_accessible_platform_ids text[], p_onboarding_liked_ids text[], p_onboarding_disliked_ids text[], p_game_states jsonb, p_skip_buckets text[] DEFAULT ARRAY[]::text[]) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_confidence_mult double precision;
  v_confidence_text text;
  v_result jsonb;
  v_skip text[] := coalesce(p_skip_buckets, array[]::text[]);
  v_liked_norm double precision;
  v_disliked_norm double precision;
begin
  v_confidence_text := games_library.confidence_label(p_rated_count);
  v_confidence_mult := case v_confidence_text
    when 'high' then 1.0
    when 'medium' then 0.9
    else 0.65
  end;
  v_liked_norm := games_library.tag_set_norm(p_liked_tags);
  v_disliked_norm := games_library.tag_set_norm(p_disliked_tags);

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

  accessible_games as (
    select game_id
    from games_library.game_platforms
    where p_accessible_platform_ids is null
       or array_length(p_accessible_platform_ids, 1) is null
       or platform_id = any(p_accessible_platform_ids)
    group by game_id
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
      coalesce(sims.sim_liked, 0) as sim_liked,
      coalesce(sims.sim_disliked, 0) as sim_disliked,
      coalesce(q.critic_score, q.user_score * 10) as quality_score,
      coalesce(q.critic_count, q.user_count) as quality_count,
      coalesce(g.genre_id = any(p_liked_genres), false) as genre_match,
      coalesce(g.genre_id = any(p_avoided_genres), false) as genre_avoid,
      coalesce(ap.game_id is not null, false) as on_platform,
      coalesce(array_length(g.tags, 1) > 0, false) as scorable,
      gs.game_status,
      gs.game_updated_at,
      coalesce(gs.game_excluded, false) as excluded,
      coalesce(gs.game_in_wishlist, false) as in_wishlist,
      coalesce(gs.game_in_playfit_picks, false) as in_playfit_picks
    from games_library.games g
    left join games_library.series s on s.id = g.series_id
    left join game_states_expanded gs on gs.game_id = g.game_id
    left join accessible_games ap on ap.game_id = g.game_id
    left join games_library.game_quality_score q on q.game_id = g.game_id
    left join lateral (
      select
        case when sum(w * w) = 0 or v_liked_norm = 0 then 0
          else sum(w * pcl * w) / (sqrt(sum(w * w) + 15.0) * sqrt(v_liked_norm))
        end as sim_liked,
        case when sum(w * w) = 0 or v_disliked_norm = 0 then 0
          else sum(w * pcd * w) / (sqrt(sum(w * w) + 15.0) * sqrt(v_disliked_norm))
        end as sim_disliked
      from (
        select
          coalesce(tw.weight, 2.0) as w,
          coalesce((p_liked_tags ->> t)::double precision, 0) as pcl,
          coalesce((p_disliked_tags ->> t)::double precision, 0) as pcd
        from unnest(g.tags) as t
        left join games_library.tag_weights tw on tw.tag_id = t
      ) twx
    ) sims on true
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
          15 + round(((15.0 + sim_liked * 85.0 + case when genre_match then 8.0 else 0.0 end
            + (case
                when quality_score is null then 0.0
                when quality_score >= 85 then 3.0
                when quality_score >= 70 then 1.0
                else 0.0
              end) * least(1.0, coalesce(quality_count, 0) / 10.0)
          ) - 15.0) * v_confidence_mult)
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
    'currentRun', case when 'currentRun' = any(v_skip)
      then '[]'::jsonb
      else coalesce((
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
          limit 20
        ) sub
      ), '[]'::jsonb)
    end,

    'nextUp', case when 'nextUp' = any(v_skip)
      then '[]'::jsonb
      else coalesce((
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
          limit 20
        ) sub
      ), '[]'::jsonb)
    end,

    'resume', case when 'resume' = any(v_skip)
      then '[]'::jsonb
      else coalesce((
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
          limit 20
        ) sub
      ), '[]'::jsonb)
    end,

    'picks', case when 'picks' = any(v_skip)
      then '[]'::jsonb
      else coalesce((
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
          limit 20
        ) sub
      ), '[]'::jsonb)
    end
  ) into v_result;

  return v_result;
end;
$$;

commit;
