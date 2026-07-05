-- Hybrid tag weights: keep the ~30 hand-curated weights (real design intent,
-- e.g. souls_like=4.0 reflects how much difficulty style matters), but stop
-- flattening every other real catalog tag to a generic fallback of 2.0.
--
-- Audit finding: of 78+ tags actually used across the catalog, only 25 were
-- covered by the old hardcoded CASE in tag_weight(); the other tags --
-- including the single most common tag in the catalog, retro_revival
-- (23,791 games) -- all fell back to the same flat 2.0, indistinguishable
-- from a tag used by a handful of games.
--
-- Fix: a real lookup table (games_library.tag_weights) with one row per tag.
-- Curated tags keep their hand-picked value. Everything else gets an
-- IDF-style weight (rarer tags = more discriminating = higher weight,
-- clamped to the same 1.0-4.0 range the curated weights already use).
--
-- Performance note: tag_weight() now depends on mutable table data, so it
-- must be STABLE, not IMMUTABLE. The hot path inside
-- score_today_recommendations does NOT call tag_weight() per tag -- it joins
-- games_library.tag_weights directly (a ~160-row table, trivially fast),
-- keeping the Phase 1 "no per-row function calls" property intact.

begin;

create table if not exists games_library.tag_weights (
  tag_id text primary key references games_library.tags(id) on delete cascade,
  weight double precision not null,
  is_curated boolean not null default false,
  updated_at timestamptz not null default now()
);

grant select on games_library.tag_weights to anon, authenticated, service_role;

create or replace function games_library.refresh_tag_weights()
returns void
language plpgsql
as $$
declare
  v_total_games double precision;
begin
  select count(*) into v_total_games from games_library.games;

  -- Curated weights: the original hand-picked ~30 tag CASE, preserved as-is.
  insert into games_library.tag_weights (tag_id, weight, is_curated)
  values
    ('story_rich', 3.0, true),
    ('lore_heavy', 2.5, true),
    ('minimalist_story', 1.0, true),
    ('branching_narrative', 3.0, true),
    ('text_based', 2.0, true),
    ('souls_like', 4.0, true),
    ('stealth', 3.0, true),
    ('puzzle', 2.5, true),
    ('rhythm', 2.5, true),
    ('tactical', 3.0, true),
    ('deck_building', 3.0, true),
    ('immersive_sim', 3.5, true),
    ('survival', 2.5, true),
    ('open_world', 2.0, true),
    ('linear', 1.5, true),
    ('hub_based', 1.5, true),
    ('roguelike', 2.5, true),
    ('metroidvania', 3.0, true),
    ('sandbox', 2.0, true),
    ('demanding', 3.0, true),
    ('unforgiving', 3.5, true),
    ('chill', 2.5, true),
    ('accessible', 2.0, true),
    ('short_sessions', 1.0, true),
    ('long_sessions', 1.5, true),
    ('pick_up_and_play', 2.0, true),
    ('dark', 1.5, true),
    ('lighthearted', 1.5, true),
    ('horror', 2.5, true),
    ('cozy', 2.0, true)
  on conflict (tag_id) do update
    set weight = excluded.weight, is_curated = true, updated_at = now();

  -- IDF-style weight for every other real tag: rarer tags carry more
  -- discriminating weight, clamped to the same 1.0-4.0 range as curated tags.
  insert into games_library.tag_weights (tag_id, weight, is_curated)
  select
    t.id,
    greatest(1.0, least(4.0,
      1.0 + 0.45 * ln(v_total_games / greatest(coalesce(freq.game_count, 0), 1))
    )),
    false
  from games_library.tags t
  left join (
    select tag_id, count(*) as game_count
    from games_library.game_tags
    group by tag_id
  ) freq on freq.tag_id = t.id
  where not exists (
    select 1 from games_library.tag_weights tw
    where tw.tag_id = t.id and tw.is_curated
  )
  on conflict (tag_id) do update
    set weight = excluded.weight, updated_at = now()
    where not games_library.tag_weights.is_curated;
end;
$$;

select games_library.refresh_tag_weights();

create or replace function games_library.tag_weight(p_tag text)
returns double precision
language sql
stable
parallel safe
as $$
  select coalesce(
    (select weight from games_library.tag_weights where tag_id = p_tag),
    2.0
  );
$$;

-- score_today_recommendations: same as 20260705000001, except the hot-path
-- LATERAL now joins games_library.tag_weights directly instead of calling
-- tag_weight() per tag -- avoids reintroducing a per-row function call now
-- that tag_weight() reads from a real table (STABLE, not inlinable).
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
-- restore games_library.tag_weight to the hardcoded 30-tag CASE with flat
-- 2.0 fallback (language sql immutable parallel safe), drop
-- refresh_tag_weights() and games_library.tag_weights.
