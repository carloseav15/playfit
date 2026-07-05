-- Add a small, bounded quality bonus to affinity scoring using game_scores
-- (critic/user ratings from rawg/igdb/metacritic/vgsales), which sat
-- completely unused by the recommendation engine until now.
--
-- game_scores has multiple rows per game across sources, and some of them
-- overlap/duplicate the same underlying signal (metacritic_review_sentiment
-- and metacritic_staging both derive from Metacritic, not independent
-- opinions) -- naively averaging across score_source would double-count.
-- games_library.game_quality_score picks ONE critic_score and ONE user_score
-- per game via an explicit source priority instead.

begin;

create or replace view games_library.game_quality_score as
with critic_ranked as (
  select
    game_id,
    critic_score,
    row_number() over (
      partition by game_id
      order by case score_source
        when 'metacritic' then 1
        when 'metacritic_staging' then 2
        when 'igdb' then 3
        when 'rawg' then 4
        when 'vgsales' then 5
        when 'metacritic_review_sentiment' then 6
        else 7
      end
    ) as critic_rank
  from games_library.game_scores
  where critic_score is not null
),
user_ranked as (
  select
    game_id,
    user_score,
    row_number() over (
      partition by game_id
      order by case score_source
        when 'rawg' then 1
        when 'metacritic' then 2
        when 'igdb' then 3
        when 'vgsales' then 4
        when 'metacritic_staging' then 5
        when 'metacritic_review_sentiment' then 6
        else 7
      end
    ) as user_rank
  from games_library.game_scores
  where user_score is not null
)
select
  coalesce(c.game_id, u.game_id) as game_id,
  c.critic_score,
  u.user_score
from (select * from critic_ranked where critic_rank = 1) c
full outer join (select * from user_ranked where user_rank = 1) u on u.game_id = c.game_id;

grant select on games_library.game_quality_score to anon, authenticated, service_role;

-- score_today_recommendations: same as 20260705020000, plus a small bounded
-- affinity bonus from game_quality_score. Independent additive term -- does
-- not touch the tag-similarity math, so it can't reintroduce the Phase 1
-- performance problem (one row per game, no per-tag work).
create or replace function games_library.score_today_recommendations(
  p_liked_tags jsonb,
  p_disliked_tags jsonb,
  p_liked_genres text[],
  p_avoided_genres text[],
  p_rated_count int,
  p_accessible_platform_ids text[],
  p_onboarding_liked_ids text[],
  p_onboarding_disliked_ids text[],
  p_game_states jsonb,
  p_skip_buckets text[] default array[]::text[]
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
    where platform_id = any(p_accessible_platform_ids)
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
            + case
                when quality_score is null then 0.0
                when quality_score >= 85 then 3.0
                when quality_score >= 70 then 1.0
                else 0.0
              end
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

-- Down:
-- drop view if exists games_library.game_quality_score;
