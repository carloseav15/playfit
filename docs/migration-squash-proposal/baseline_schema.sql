--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: games_library; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA games_library;


--
-- Name: SCHEMA games_library; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA games_library IS 'Playfit catalog and profile data.';


--
-- Name: games_library_private; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA games_library_private;


--
-- Name: SCHEMA games_library_private; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA games_library_private IS 'Private maintenance helpers for games_library. Not exposed through Supabase Data API.';


--
-- Name: igdb_raw; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA igdb_raw;


--
-- Name: SCHEMA igdb_raw; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA igdb_raw IS 'Private local mirror of metadata retrieved from the IGDB API.';


--
-- Name: build_game_states_json(uuid); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.build_game_states_json(p_user_id uuid) RETURNS jsonb
    LANGUAGE sql STABLE
    SET search_path TO 'pg_catalog'
    AS $$
  select coalesce(
    jsonb_object_agg(
      ugs.game_id,
      jsonb_strip_nulls(jsonb_build_object(
        'gameId', ugs.game_id,
        'title', coalesce(g.title, ugs.game_id),
        'status', ugs.status,
        'rating', ugs.rating,
        'inBacklog', ugs.in_backlog,
        'inWishlist', ugs.in_wishlist,
        'inPlayfitPicks', ugs.in_playfit_picks,
        'excluded', ugs.excluded,
        'source', ugs.source,
        'createdAt', ugs.created_at,
        'updatedAt', ugs.updated_at
      ))
      order by ugs.updated_at desc, ugs.game_id
    ),
    '{}'::jsonb
  )
  from games_library.user_game_states ugs
  left join games_library.games g on g.game_id = ugs.game_id
  where ugs.user_id = p_user_id;
$$;


--
-- Name: FUNCTION build_game_states_json(p_user_id uuid); Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON FUNCTION games_library.build_game_states_json(p_user_id uuid) IS 'Builds the profile.game_states compatibility JSON from normalized user_game_states.';


--
-- Name: check_rate_limit(text, text, integer, integer, text); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.check_rate_limit(p_ip_address text, p_endpoint text, p_max_requests integer, p_window_seconds integer, p_user_id text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_ip_address text := coalesce(nullif(btrim(p_ip_address), ''), 'unknown');
  v_user_id uuid := null;
  v_window_start timestamptz;
  v_ip_count integer;
  v_user_count integer;
begin
  if p_endpoint not in ('/api/profile', '/api/profile/games') then
    raise exception 'Unsupported rate limit endpoint';
  end if;

  if p_max_requests < 1 or p_max_requests > 1000 then
    raise exception 'Invalid rate limit maximum';
  end if;

  if p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'Invalid rate limit window';
  end if;

  if p_user_id is not null and btrim(p_user_id) <> '' then
    if p_user_id::uuid is distinct from auth.uid() then
      raise exception 'not authorized' using errcode = '42501';
    end if;
    v_user_id := p_user_id::uuid;
  end if;

  v_window_start := now() - make_interval(secs => p_window_seconds);

  select count(*)::integer
  into v_ip_count
  from games_library.rate_limits
  where ip_address = v_ip_address
    and endpoint = p_endpoint
    and requested_at >= v_window_start;

  if v_ip_count >= p_max_requests then
    return false;
  end if;

  if v_user_id is not null then
    select count(*)::integer
    into v_user_count
    from games_library.rate_limits
    where user_id = v_user_id
      and endpoint = p_endpoint
      and requested_at >= v_window_start;

    if v_user_count >= p_max_requests then
      return false;
    end if;
  end if;

  insert into games_library.rate_limits (ip_address, endpoint, user_id)
  values (v_ip_address, p_endpoint, v_user_id);

  return true;
end;
$$;


--
-- Name: FUNCTION check_rate_limit(p_ip_address text, p_endpoint text, p_max_requests integer, p_window_seconds integer, p_user_id text); Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON FUNCTION games_library.check_rate_limit(p_ip_address text, p_endpoint text, p_max_requests integer, p_window_seconds integer, p_user_id text) IS 'Checks and records API rate limits while binding any user bucket to auth.uid().';


--
-- Name: cleanup_audit_log(interval); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.cleanup_audit_log(p_older_than interval DEFAULT '30 days'::interval) RETURNS bigint
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  with deleted as (
    delete from games_library.audit_log
    where created_at < now() - p_older_than
    returning 1
  )
  select count(*)::bigint from deleted;
$$;


--
-- Name: cleanup_rate_limits(interval); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.cleanup_rate_limits(p_older_than interval DEFAULT '7 days'::interval) RETURNS bigint
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  with deleted as (
    delete from games_library.rate_limits
    where requested_at < now() - p_older_than
    returning 1
  )
  select count(*)::bigint from deleted;
$$;


--
-- Name: confidence_label(integer); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.confidence_label(p_rated_count integer) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'games_library', 'pg_temp'
    AS $$
  select case
    when p_rated_count >= 6 then 'high'
    when p_rated_count >= 3 then 'medium'
    else 'low'
  end;
$$;


--
-- Name: delete_game_state(text, text); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.delete_game_state(p_user_id text, p_game_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from games_library.user_game_states
  where user_id = p_user_id::uuid and game_id = p_game_id;
end;
$$;


--
-- Name: delete_profile(text); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.delete_profile(p_user_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from games_library.profiles where user_id = p_user_id::uuid;
end;
$$;


--
-- Name: format_trait(text); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.format_trait(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'games_library', 'pg_temp'
    AS $$
  select trim(regexp_replace(regexp_replace(p_value, '[_;]+', ' ', 'g'), '\s+', ' ', 'g'));
$$;


--
-- Name: get_audit_log(uuid, integer); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.get_audit_log(p_user_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 100) RETURNS jsonb
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  select jsonb_agg(to_jsonb(a) order by a.created_at desc)
  from games_library.audit_log a
  where (p_user_id is null or a.user_id = p_user_id)
  limit p_limit;
$$;


--
-- Name: get_cache(text); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.get_cache(p_key text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_value jsonb;
begin
  delete from games_library.api_cache
  where cache_key = p_key and expires_at <= now();

  select value into v_value
  from games_library.api_cache
  where cache_key = p_key;

  return v_value;
end;
$$;


--
-- Name: get_full_catalog(); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.get_full_catalog() RETURNS jsonb
    LANGUAGE sql
    SET search_path TO 'games_library', 'pg_temp'
    AS $$
  select jsonb_build_object(
    'games', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'game_id', g.game_id,
            'title', g.title,
            'aliases', g.aliases,
            'series_id', g.series_id,
            'genre_id', g.genre_id,
            'release_year', g.release_year,
            'release_state', g.release_state,
            'source_type', g.source_type,
            'source_ref', g.source_ref,
            'cover_url', g.cover_url,
            'tags', g.tags,
            'notes', g.notes,
            'sort_date', g.sort_date::text,
            'series', case when g.series_id is not null
              then jsonb_build_object('name', s.name)
              else null::jsonb
            end,
            'genre', case when g.genre_id is not null
              then jsonb_build_object('name', gn.name)
              else null::jsonb
            end
          )
          order by g.title
        )
        from games_library.games g
        left join games_library.series s on s.id = g.series_id
        left join games_library.genres gn on gn.id = g.genre_id
      ),
      '[]'::jsonb
    ),
    'platforms', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'game_id', gp.game_id,
            'platform_id', gp.platform_id,
            'platforms', jsonb_build_object('name', p.name)
          )
        )
        from games_library.game_platforms gp
        join games_library.platforms p on p.id = gp.platform_id
      ),
      '[]'::jsonb
    ),
    'aliases', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'game_id', ga.game_id,
            'alias', ga.alias
          )
        )
        from games_library.game_aliases ga
      ),
      '[]'::jsonb
    )
  );
$$;


--
-- Name: get_game_states(text); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.get_game_states(p_user_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return games_library.build_game_states_json(p_user_id::uuid);
end;
$$;


--
-- Name: get_genre_name(text); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.get_genre_name(p_id text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog'
    AS $$
  select name from games_library.genres where id = p_id;
$$;


--
-- Name: get_profile(text); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.get_profile(p_user_id text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'game_states', p.game_states,
      'profile', p.profile,
      'onboarding', p.onboarding,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    )
    from games_library.profiles p
    where p.user_id = p_user_id::uuid
  );
end;
$$;


--
-- Name: get_series_name(text); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.get_series_name(p_id text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog'
    AS $$
  select name from games_library.series where id = p_id;
$$;


--
-- Name: immutable_array_to_string(text[], text); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.immutable_array_to_string(arr text[], sep text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
  select pg_catalog.array_to_string(arr, sep);
$$;


--
-- Name: migrate_profile(text, text, jsonb); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.migrate_profile(p_from_user_id text, p_to_user_id text, p_onboarding jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if p_to_user_id is null or p_to_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into games_library.profiles (user_id, game_states, profile, onboarding)
  select p_to_user_id::uuid, game_states, profile, p_onboarding
  from games_library.profiles
  where user_id = p_from_user_id::uuid
  on conflict (user_id) do update set
    game_states = excluded.game_states,
    profile = excluded.profile,
    onboarding = excluded.onboarding,
    updated_at = now();
end;
$$;


--
-- Name: FUNCTION migrate_profile(p_from_user_id text, p_to_user_id text, p_onboarding jsonb); Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON FUNCTION games_library.migrate_profile(p_from_user_id text, p_to_user_id text, p_onboarding jsonb) IS 'Legacy device profile migration retained for rollback compatibility; not exposed through the Data API.';


--
-- Name: refresh_tag_weights(); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.refresh_tag_weights() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: score_today_recommendations(jsonb, jsonb, text[], text[], integer, text[], text[], text[], jsonb, text[]); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.score_today_recommendations(p_liked_tags jsonb, p_disliked_tags jsonb, p_liked_genres text[], p_avoided_genres text[], p_rated_count integer, p_accessible_platform_ids text[], p_onboarding_liked_ids text[], p_onboarding_disliked_ids text[], p_game_states jsonb, p_skip_buckets text[] DEFAULT ARRAY[]::text[]) RETURNS jsonb
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


--
-- Name: set_cache(text, jsonb, integer); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.set_cache(p_key text, p_value jsonb, p_ttl_seconds integer DEFAULT 300) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
  insert into games_library.api_cache (cache_key, value, expires_at)
  values (p_key, p_value, now() + make_interval(secs => p_ttl_seconds))
  on conflict (cache_key) do update set
    value      = excluded.value,
    expires_at = excluded.expires_at;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: sync_game_aliases(); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.sync_game_aliases() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if tg_op = 'INSERT' then
    update games_library.games
    set aliases = (
      select array_agg(alias order by alias)
      from games_library.game_aliases
      where game_id = new.game_id
    )
    where game_id = new.game_id;
    return new;
  elsif tg_op = 'DELETE' then
    update games_library.games
    set aliases = coalesce(
      (select array_agg(alias order by alias)
       from games_library.game_aliases
       where game_id = old.game_id),
      '{}'::text[]
    )
    where game_id = old.game_id;
    return old;
  end if;
  return null;
end;
$$;


--
-- Name: sync_game_aliases_from_array(); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.sync_game_aliases_from_array() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'games_library', 'pg_temp'
    AS $$
begin
  if new.aliases is null then
    return null;
  end if;

  insert into games_library.game_aliases (game_id, alias, game_ref)
  select new.game_id, a.alias, new.pk
  from (select distinct alias from unnest(new.aliases) as alias) a
  where not exists (
    select 1 from games_library.game_aliases ga
    where ga.game_id = new.game_id and lower(trim(ga.alias)) = lower(trim(a.alias))
  );

  return null;
end;
$$;


--
-- Name: FUNCTION sync_game_aliases_from_array(); Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON FUNCTION games_library.sync_game_aliases_from_array() IS 'Autofix temporal: si algo escribe directo en games.aliases (array) en vez de game_aliases (tabla), esto empuja lo nuevo hacia la tabla relacional. Los scripts de product/ (match-gamesdatabase-*.mjs, scrape-rawg.mjs, etc.) deberian actualizarse para escribir directo en game_aliases y dejar de depender de este trigger antes de que se les vuelva a usar.';


--
-- Name: sync_game_platforms_from_array(); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.sync_game_platforms_from_array() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'games_library', 'pg_temp'
    AS $$
begin
  if new.platforms is null then
    return null;
  end if;

  insert into games_library.game_platforms (game_id, platform_id, game_ref, platform_ref)
  select new.game_id, p.platform_id, new.pk, pl.pk
  from (select distinct platform_id from unnest(new.platforms) as platform_id) p
  join games_library.platforms pl on pl.id = p.platform_id
  where not exists (
    select 1 from games_library.game_platforms gp
    where gp.game_id = new.game_id and gp.platform_id = p.platform_id
  );

  return null;
end;
$$;


--
-- Name: FUNCTION sync_game_platforms_from_array(); Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON FUNCTION games_library.sync_game_platforms_from_array() IS 'Autofix temporal: si algo escribe directo en games.platforms (array) en vez de game_platforms (tabla), esto empuja lo nuevo hacia la tabla relacional. Los scripts de product/ deberian actualizarse para escribir directo en game_platforms y dejar de depender de este trigger antes de que se les vuelva a usar.';


--
-- Name: sync_game_tags(); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.sync_game_tags() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
begin
  if tg_op = 'INSERT' then
    update games_library.games
    set tags = (
      select array_agg(tag_id order by tag_id)
      from games_library.game_tags
      where game_id = new.game_id
    )
    where game_id = new.game_id;
    return new;
  elsif tg_op = 'DELETE' then
    update games_library.games
    set tags = coalesce(
      (select array_agg(tag_id order by tag_id)
       from games_library.game_tags
       where game_id = old.game_id),
      '{}'::text[]
    )
    where game_id = old.game_id;
    return old;
  end if;
  return null;
end;
$$;


--
-- Name: sync_game_tags_from_array(); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.sync_game_tags_from_array() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'games_library', 'pg_temp'
    AS $$
begin
  if new.tags is null then
    return null;
  end if;

  insert into games_library.game_tags (game_id, tag_id, game_ref)
  select new.game_id, t.tag_id, new.pk
  from (select distinct tag_id from unnest(new.tags) as tag_id) t
  where not exists (
    select 1 from games_library.game_tags gt
    where gt.game_id = new.game_id and gt.tag_id = t.tag_id
  );

  return null;
end;
$$;


--
-- Name: FUNCTION sync_game_tags_from_array(); Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON FUNCTION games_library.sync_game_tags_from_array() IS 'Autofix temporal: si algo escribe directo en games.tags (array) en vez de game_tags (tabla), esto empuja lo nuevo hacia la tabla relacional. Los scripts de product/scripts/ deberian escribir en game_tags directamente antes de volver a usarse.';


--
-- Name: sync_games_aliases_array(); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.sync_games_aliases_array() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'games_library', 'pg_temp'
    AS $$
declare
  v_game_id text;
begin
  v_game_id := coalesce(new.game_id, old.game_id);
  update games_library.games g
  set aliases = coalesce((
    select array_agg(distinct alias order by alias) from games_library.game_aliases ga where ga.game_id = v_game_id
  ), '{}')
  where g.game_id = v_game_id
    and g.aliases is distinct from coalesce((
      select array_agg(distinct alias order by alias) from games_library.game_aliases ga where ga.game_id = v_game_id
    ), '{}');
  return null;
end;
$$;


--
-- Name: sync_games_platforms_array(); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.sync_games_platforms_array() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'games_library', 'pg_temp'
    AS $$
declare
  v_game_id text;
  v_platform_ids text[];
begin
  v_game_id := coalesce(new.game_id, old.game_id);

  select array_agg(gp.platform_id order by p.gen desc, gp.platform_id)
  into v_platform_ids
  from games_library.game_platforms gp
  join games_library.platforms p on p.id = gp.platform_id
  where gp.game_id = v_game_id;

  update games_library.games g
  set platforms = coalesce(v_platform_ids, '{}')
  where g.game_id = v_game_id
    and g.platforms is distinct from coalesce(v_platform_ids, '{}');

  return null;
end;
$$;


--
-- Name: sync_games_tags_array(); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.sync_games_tags_array() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'games_library', 'pg_temp'
    AS $$
declare
  v_game_id text;
  v_tags text[];
begin
  v_game_id := coalesce(new.game_id, old.game_id);

  select array_agg(tag_id order by tag_id)
  into v_tags
  from games_library.game_tags
  where game_id = v_game_id;

  update games_library.games g
  set tags = coalesce(v_tags, '{}')
  where g.game_id = v_game_id
    and g.tags is distinct from coalesce(v_tags, '{}');

  return null;
end;
$$;


--
-- Name: sync_profile_game_states(); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.sync_profile_game_states() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_user_id uuid;
begin
  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;

  update games_library.profiles
  set
    game_states = games_library.build_game_states_json(v_user_id),
    updated_at = now()
  where user_id = v_user_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;


--
-- Name: tag_set_norm(jsonb); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.tag_set_norm(p_tags jsonb) RETURNS double precision
    LANGUAGE plpgsql STABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_norm double precision := 0;
  v_key text;
  v_weight double precision;
  v_count double precision;
begin
  if p_tags is null or p_tags = '{}'::jsonb then
    return 0;
  end if;

  for v_key in select jsonb_object_keys(p_tags)
  loop
    v_weight := games_library.tag_weight(v_key);
    v_count := (p_tags ->> v_key)::double precision;
    v_norm := v_norm + ((v_count * v_weight) * (v_count * v_weight));
  end loop;

  return v_norm;
end;
$$;


--
-- Name: tag_weight(text); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.tag_weight(p_tag text) RETURNS double precision
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog'
    AS $$
  select coalesce(
    (select weight from games_library.tag_weights where tag_id = p_tag),
    2.0
  );
$$;


--
-- Name: upsert_game_state(text, text, text, numeric, boolean, boolean, boolean, text); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.upsert_game_state(p_user_id text, p_game_id text, p_status text DEFAULT NULL::text, p_rating numeric DEFAULT NULL::numeric, p_in_backlog boolean DEFAULT NULL::boolean, p_in_wishlist boolean DEFAULT NULL::boolean, p_excluded boolean DEFAULT NULL::boolean, p_source text DEFAULT 'manual'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_game_ref bigint;
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select pk into v_game_ref
  from games_library.games
  where game_id = p_game_id;

  if v_game_ref is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  insert into games_library.user_game_states (
    user_id, game_id, game_ref, status, rating, in_backlog, in_wishlist, excluded, source
  )
  values (
    p_user_id::uuid, p_game_id, v_game_ref, p_status, p_rating,
    coalesce(p_in_backlog, false), coalesce(p_in_wishlist, false),
    coalesce(p_excluded, false), coalesce(p_source, 'manual')
  )
  on conflict (user_id, game_id) do update set
    game_ref = excluded.game_ref,
    status = coalesce(p_status, user_game_states.status),
    rating = coalesce(p_rating, user_game_states.rating),
    in_backlog = coalesce(p_in_backlog, user_game_states.in_backlog),
    in_wishlist = coalesce(p_in_wishlist, user_game_states.in_wishlist),
    excluded = coalesce(p_excluded, user_game_states.excluded),
    source = coalesce(p_source, user_game_states.source),
    updated_at = now();
end;
$$;


--
-- Name: upsert_game_state(text, text, text, numeric, boolean, boolean, boolean, boolean, text); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.upsert_game_state(p_user_id text, p_game_id text, p_status text DEFAULT NULL::text, p_rating numeric DEFAULT NULL::numeric, p_in_backlog boolean DEFAULT NULL::boolean, p_in_wishlist boolean DEFAULT NULL::boolean, p_in_playfit_picks boolean DEFAULT NULL::boolean, p_excluded boolean DEFAULT NULL::boolean, p_source text DEFAULT 'manual'::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_game_ref bigint;
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select pk into v_game_ref
  from games_library.games
  where game_id = p_game_id;

  if v_game_ref is null then
    raise exception 'game not found' using errcode = 'P0002';
  end if;

  insert into games_library.user_game_states (
    user_id, game_id, game_ref, status, rating, in_backlog, in_wishlist,
    in_playfit_picks, excluded, source
  )
  values (
    p_user_id::uuid, p_game_id, v_game_ref, p_status, p_rating,
    coalesce(p_in_backlog, false), coalesce(p_in_wishlist, false),
    coalesce(p_in_playfit_picks, false), coalesce(p_excluded, false),
    coalesce(p_source, 'manual')
  )
  on conflict (user_id, game_id) do update set
    game_ref = excluded.game_ref,
    status = coalesce(p_status, user_game_states.status),
    rating = coalesce(p_rating, user_game_states.rating),
    in_backlog = coalesce(p_in_backlog, user_game_states.in_backlog),
    in_wishlist = coalesce(p_in_wishlist, user_game_states.in_wishlist),
    in_playfit_picks = coalesce(p_in_playfit_picks, user_game_states.in_playfit_picks),
    excluded = coalesce(p_excluded, user_game_states.excluded),
    source = coalesce(p_source, user_game_states.source),
    updated_at = now();
end;
$$;


--
-- Name: upsert_profile(text, jsonb, jsonb, jsonb); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.upsert_profile(p_user_id text, p_game_states jsonb, p_profile jsonb, p_onboarding jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_user_id uuid;
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_user_id := p_user_id::uuid;

  insert into games_library.profiles (user_id, game_states, profile, onboarding)
  values (v_user_id, coalesce(p_game_states, '{}'::jsonb), p_profile, p_onboarding)
  on conflict (user_id) do update set
    game_states = excluded.game_states,
    profile = excluded.profile,
    onboarding = excluded.onboarding,
    updated_at = now();

  delete from games_library.user_game_states ugs
  where ugs.user_id = v_user_id
    and not exists (
      select 1
      from jsonb_each(coalesce(p_game_states, '{}'::jsonb)) as incoming(game_id, state)
      where incoming.game_id = ugs.game_id
    );

  insert into games_library.user_game_states (
    user_id, game_id, game_ref, status, rating, in_backlog, in_wishlist,
    in_playfit_picks, excluded, source, created_at, updated_at
  )
  select
    v_user_id,
    incoming.game_id,
    g.pk,
    case
      when incoming.state ->> 'status' in (
        'playing','on_hold','shelved','beaten','completed','abandoned','want_to_play'
      ) then incoming.state ->> 'status'
      else null
    end,
    case
      when incoming.state ->> 'rating' in ('0','0.5','1','1.5','2','2.5','3','3.5','4','4.5','5')
        then (incoming.state ->> 'rating')::numeric(2,1)
      else null
    end,
    case when incoming.state ->> 'inBacklog' in ('true','false')
      then (incoming.state ->> 'inBacklog')::boolean else false end,
    case when incoming.state ->> 'inWishlist' in ('true','false')
      then (incoming.state ->> 'inWishlist')::boolean else false end,
    case when incoming.state ->> 'inPlayfitPicks' in ('true','false')
      then (incoming.state ->> 'inPlayfitPicks')::boolean else false end,
    case when incoming.state ->> 'excluded' in ('true','false')
      then (incoming.state ->> 'excluded')::boolean else false end,
    case
      when incoming.state ->> 'source' in ('onboarding','finder','manual')
        then incoming.state ->> 'source'
      else 'manual'
    end,
    case
      when incoming.state ->> 'createdAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        then (incoming.state ->> 'createdAt')::timestamptz
      else now()
    end,
    case
      when incoming.state ->> 'updatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        then (incoming.state ->> 'updatedAt')::timestamptz
      else now()
    end
  from jsonb_each(coalesce(p_game_states, '{}'::jsonb)) as incoming(game_id, state)
  join games_library.games g on g.game_id = incoming.game_id
  on conflict (user_id, game_id) do update set
    game_ref = excluded.game_ref,
    status = excluded.status,
    rating = excluded.rating,
    in_backlog = excluded.in_backlog,
    in_wishlist = excluded.in_wishlist,
    in_playfit_picks = excluded.in_playfit_picks,
    excluded = excluded.excluded,
    source = excluded.source,
    created_at = least(games_library.user_game_states.created_at, excluded.created_at),
    updated_at = excluded.updated_at;

  update games_library.profiles
  set game_states = games_library.build_game_states_json(v_user_id),
      updated_at = now()
  where user_id = v_user_id;
end;
$$;


--
-- Name: weighted_cosine_similarity(text[], jsonb, double precision); Type: FUNCTION; Schema: games_library; Owner: -
--

CREATE FUNCTION games_library.weighted_cosine_similarity(p_game_tags text[], p_profile_tags jsonb, p_profile_norm double precision) RETURNS double precision
    LANGUAGE sql STABLE PARALLEL SAFE
    SET search_path TO 'pg_catalog'
    AS $$
  select case
    when p_game_tags is null or array_length(p_game_tags, 1) is null then 0
    when p_profile_tags is null or p_profile_tags = '{}'::jsonb then 0
    when p_profile_norm is null or p_profile_norm = 0 then 0
    else coalesce((
      select case when sum(w * w) = 0 then 0
        else sum(w * pc * w) / (sqrt(sum(w * w) + 15.0) * sqrt(p_profile_norm))
      end
      from (
        select
          games_library.tag_weight(t) as w,
          coalesce((p_profile_tags ->> t)::double precision, 0) as pc
        from unnest(p_game_tags) as t
      ) x
    ), 0)
  end;
$$;


--
-- Name: apply_approved_external_enrichment(integer); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.apply_approved_external_enrichment(p_limit integer DEFAULT 10000) RETURNS TABLE(candidates_applied integer, external_ids_inserted integer, releases_inserted integer, companies_inserted integer, scores_inserted integer, age_ratings_inserted integer, summaries_inserted integer, sales_snapshots_inserted integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: apply_approved_game_duplicate_merges(integer); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.apply_approved_game_duplicate_merges(p_limit integer DEFAULT NULL::integer) RETURNS TABLE(run_id uuid, groups_processed integer, games_retired integer, redirects_created integer, platforms_moved integer, tags_moved integer, aliases_moved integer, user_states_moved integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: FUNCTION apply_approved_game_duplicate_merges(p_limit integer); Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON FUNCTION games_library_private.apply_approved_game_duplicate_merges(p_limit integer) IS 'Executes explicitly approved duplicate groups: enriches the winner, moves joins/user state/external enrichment, creates redirects, audits snapshots, and deletes loser games.';


--
-- Name: apply_approved_metacritic_review_sentiment(integer); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.apply_approved_metacritic_review_sentiment(p_limit integer DEFAULT 10000) RETURNS TABLE(candidates_applied integer, external_ids_upserted integer, review_sentiment_snapshots_upserted integer, scores_upserted integer, age_ratings_upserted integer, companies_upserted integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: apply_generic_series_cleanup(); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.apply_generic_series_cleanup() RETURNS TABLE(candidates_refreshed integer, games_cleared integer)
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_candidates int := 0;
  v_games int := 0;
begin
  select games_library_private.refresh_series_cleanup_candidates()
  into v_candidates;

  with inserted as (
    insert into games_library.series_cleanup_applied (
      game_id,
      title_snapshot,
      old_series_id,
      old_series_name,
      reason
    )
    select
      g.game_id,
      g.title,
      g.series_id,
      c.series_name,
      'series_name_matches_genre'
    from games_library.games g
    join games_library.series_cleanup_candidates c
      on c.series_id = g.series_id
    where c.suggested_action = 'auto_clear_series_id'
      and c.status in ('approved_auto_clear', 'applied')
    on conflict (game_id) do nothing
    returning game_id, old_series_id
  ),
  cleared as (
    update games_library.games g
    set series_id = null
    from inserted i
    where g.game_id = i.game_id
      and g.series_id = i.old_series_id
    returning g.game_id
  )
  select count(*)::int into v_games from cleared;

  update games_library.series_cleanup_candidates c
  set
    status = case
      when c.suggested_action = 'auto_clear_series_id' then 'applied'
      else c.status
    end,
    applied_game_count = coalesce(a.applied_game_count, 0),
    applied_at = case
      when c.suggested_action = 'auto_clear_series_id'
       and coalesce(a.applied_game_count, 0) > 0
      then now()
      else c.applied_at
    end,
    updated_at = now()
  from (
    select old_series_id as series_id, count(*)::int as applied_game_count
    from games_library.series_cleanup_applied
    where restored_at is null
    group by old_series_id
  ) a
  where c.series_id = a.series_id;

  perform games_library_private.refresh_series_cleanup_candidates();

  return query select v_candidates, v_games;
end;
$$;


--
-- Name: FUNCTION apply_generic_series_cleanup(); Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON FUNCTION games_library_private.apply_generic_series_cleanup() IS 'Clears games.series_id only for review-approved generic series/genre matches and records every changed game for rollback.';


--
-- Name: approve_duplicate_group_full_merge(text, text, text, text); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.approve_duplicate_group_full_merge(p_group_key text, p_winner_game_id text, p_reviewed_by text DEFAULT 'manual_review'::text, p_review_notes text DEFAULT ''::text) RETURNS TABLE(group_key text, winner_game_id text, loser_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_candidate_count int := 0;
  v_loser_count int := 0;
  v_status text;
  v_reviewed_by text := coalesce(nullif(btrim(p_reviewed_by), ''), 'manual_review');
  v_note text := 'Approved full duplicate group merge to winner ' || p_winner_game_id;
begin
  if p_group_key is null or btrim(p_group_key) = '' then
    raise exception 'p_group_key is required';
  end if;

  if p_winner_game_id is null or btrim(p_winner_game_id) = '' then
    raise exception 'p_winner_game_id is required';
  end if;

  if btrim(coalesce(p_review_notes, '')) <> '' then
    v_note := v_note || ': ' || btrim(p_review_notes);
  end if;

  select g.status, g.candidate_count
  into v_status, v_candidate_count
  from games_library.game_duplicate_groups g
  where g.group_key = p_group_key
  for update;

  if not found then
    raise exception 'Duplicate group % does not exist', p_group_key;
  end if;

  if v_status <> 'needs_review' then
    raise exception 'Expected duplicate group % to be needs_review, found %', p_group_key, v_status;
  end if;

  if not exists (
    select 1
    from games_library.game_duplicate_candidates c
    where c.group_key = p_group_key
      and c.game_id = p_winner_game_id
  ) then
    raise exception 'Winner % is not a candidate in group %', p_winner_game_id, p_group_key;
  end if;

  select count(*)::int
  into v_loser_count
  from games_library.game_duplicate_candidates c
  where c.group_key = p_group_key
    and c.game_id <> p_winner_game_id;

  if v_candidate_count < 2 or v_loser_count < 1 then
    raise exception 'Duplicate group % does not have enough candidates to merge', p_group_key;
  end if;

  update games_library.game_duplicate_candidates c
  set
    proposed_action = case
      when c.game_id = p_winner_game_id then 'keep'
      else 'merge_into_winner'
    end,
    winner_game_id = case
      when c.game_id = p_winner_game_id then null
      else p_winner_game_id
    end,
    review_notes = case
      when btrim(c.review_notes) = '' then v_note
      else c.review_notes || E'\n' || v_note
    end,
    updated_at = now()
  where c.group_key = p_group_key;

  update games_library.game_duplicate_groups g
  set
    status = 'approved',
    reviewed_by = v_reviewed_by,
    reviewed_at = now(),
    review_notes = case
      when btrim(g.review_notes) = '' then v_note
      else g.review_notes || E'\n' || v_note
    end,
    updated_at = now()
  where g.group_key = p_group_key;

  return query select p_group_key, p_winner_game_id, v_loser_count;
end;
$$;


--
-- Name: FUNCTION approve_duplicate_group_full_merge(p_group_key text, p_winner_game_id text, p_reviewed_by text, p_review_notes text); Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON FUNCTION games_library_private.approve_duplicate_group_full_merge(p_group_key text, p_winner_game_id text, p_reviewed_by text, p_review_notes text) IS 'Marks a reviewed duplicate group as approved for a full merge into one winner. It does not execute the merge; run apply_approved_game_duplicate_merges after review.';


--
-- Name: backfill_aliases_from_external_matches(); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.backfill_aliases_from_external_matches() RETURNS TABLE(aliases_inserted integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
begin
  insert into games_library.game_aliases (game_id, alias)
  select distinct
    c.game_id,
    btrim(c.source_title) as alias
  from games_library.game_external_match_candidates c
  join games_library.games g on g.game_id = c.game_id
  where c.status in ('auto_approved', 'approved')
    and c.applied_at is not null
    and btrim(c.source_title) <> ''
    and c.source_title <> g.title
    and lower(btrim(c.source_title)) <> lower(btrim(g.title))
    and games_library_private.normalize_external_key(c.source_title)
      = games_library_private.normalize_external_key(g.title)
  on conflict (game_id, alias) do nothing;

  get diagnostics aliases_inserted = row_count;
  return next;
end;
$$;


--
-- Name: FUNCTION backfill_aliases_from_external_matches(); Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON FUNCTION games_library_private.backfill_aliases_from_external_matches() IS 'Adds punctuation/spacing/casing-safe aliases from already-applied external matches whose normalized title equals the canonical title.';


--
-- Name: canonicalize_duplicate_group_winner(text, text, text, text, text); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.canonicalize_duplicate_group_winner(p_group_key text, p_current_winner_game_id text, p_new_game_id text, p_reviewed_by text DEFAULT 'manual_review'::text, p_review_notes text DEFAULT ''::text) RETURNS TABLE(group_key text, old_game_id text, new_game_id text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $_$
declare
  v_status text;
  v_title text;
  v_reviewed_by text := coalesce(nullif(btrim(p_reviewed_by), ''), 'manual_review');
  v_note text := 'Canonicalized duplicate winner ID from ' || p_current_winner_game_id || ' to ' || p_new_game_id;
begin
  if p_group_key is null or btrim(p_group_key) = '' then
    raise exception 'p_group_key is required';
  end if;

  if p_current_winner_game_id is null or btrim(p_current_winner_game_id) = '' then
    raise exception 'p_current_winner_game_id is required';
  end if;

  if p_new_game_id is null or btrim(p_new_game_id) = '' then
    raise exception 'p_new_game_id is required';
  end if;

  if p_new_game_id !~ '^[a-z0-9][a-z0-9_]*[a-z0-9]$' then
    raise exception 'p_new_game_id must be a lowercase source-agnostic slug, got %', p_new_game_id;
  end if;

  if p_new_game_id ~ '^(rawg|steam|wiki)_' then
    raise exception 'p_new_game_id must not be source-prefixed, got %', p_new_game_id;
  end if;

  select g.status
  into v_status
  from games_library.game_duplicate_groups g
  where g.group_key = p_group_key
  for update;

  if not found then
    raise exception 'Duplicate group % does not exist', p_group_key;
  end if;

  if v_status <> 'needs_review' then
    raise exception 'Expected duplicate group % to be needs_review, found %', p_group_key, v_status;
  end if;

  select title
  into v_title
  from games_library.games
  where game_id = p_current_winner_game_id
  for update;

  if not found then
    raise exception 'Current winner % does not exist', p_current_winner_game_id;
  end if;

  v_note := v_note || ' (' || v_title || ')';

  if btrim(coalesce(p_review_notes, '')) <> '' then
    v_note := v_note || ': ' || btrim(p_review_notes);
  end if;

  if not exists (
    select 1
    from games_library.game_duplicate_candidates c
    where c.group_key = p_group_key
      and c.game_id = p_current_winner_game_id
  ) then
    raise exception 'Current winner % is not a candidate in group %', p_current_winner_game_id, p_group_key;
  end if;

  if exists (
    select 1
    from games_library.games
    where game_id = p_new_game_id
  ) then
    raise exception 'Cannot canonicalize % to %, target ID already exists', p_current_winner_game_id, p_new_game_id;
  end if;

  if exists (
    select 1
    from games_library.game_redirects
    where from_game_id = p_new_game_id
       or to_game_id = p_current_winner_game_id
  ) then
    raise exception 'Cannot canonicalize % to % because a conflicting redirect already exists', p_current_winner_game_id, p_new_game_id;
  end if;

  update games_library.games
  set game_id = p_new_game_id,
      updated_at = now()
  where game_id = p_current_winner_game_id;

  update games_library.profiles p
  set
    game_states = case
      when p.game_states ? p_new_game_id then p.game_states - p_current_winner_game_id
      else (p.game_states - p_current_winner_game_id) ||
        jsonb_build_object(
          p_new_game_id,
          jsonb_set(
            p.game_states -> p_current_winner_game_id,
            '{gameId}',
            to_jsonb(p_new_game_id)
          )
        )
    end,
    updated_at = now()
  where p.game_states ? p_current_winner_game_id;

  insert into games_library.game_redirects (
    from_game_id,
    to_game_id,
    reason,
    notes,
    created_by
  )
  values (
    p_current_winner_game_id,
    p_new_game_id,
    'manual_id_change',
    v_note,
    'games_library_private.canonicalize_duplicate_group_winner'
  );

  update games_library.game_duplicate_candidates c
  set
    review_notes = case
      when btrim(c.review_notes) = '' then v_note
      else c.review_notes || E'\n' || v_note
    end,
    updated_at = now()
  where c.group_key = p_group_key;

  update games_library.game_duplicate_groups g
  set
    reviewed_by = v_reviewed_by,
    review_notes = case
      when btrim(g.review_notes) = '' then v_note
      else g.review_notes || E'\n' || v_note
    end,
    updated_at = now()
  where g.group_key = p_group_key;

  return query select p_group_key, p_current_winner_game_id, p_new_game_id;
end;
$_$;


--
-- Name: FUNCTION canonicalize_duplicate_group_winner(p_group_key text, p_current_winner_game_id text, p_new_game_id text, p_reviewed_by text, p_review_notes text); Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON FUNCTION games_library_private.canonicalize_duplicate_group_winner(p_group_key text, p_current_winner_game_id text, p_new_game_id text, p_reviewed_by text, p_review_notes text) IS 'Renames a reviewed duplicate winner from a source-prefixed ID to a source-agnostic game_id and creates a redirect from the old ID.';


--
-- Name: extract_external_year(text); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.extract_external_year(p_value text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
  select case
    when p_value is null then null
    when substring(p_value from '([12][0-9]{3})') is null then null
    else substring(p_value from '([12][0-9]{3})')::int
  end;
$$;


--
-- Name: map_external_platform_id(text); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.map_external_platform_id(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: move_duplicate_enrichment_to_winner(text, text); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.move_duplicate_enrichment_to_winner(p_loser_game_id text, p_winner_game_id text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: FUNCTION move_duplicate_enrichment_to_winner(p_loser_game_id text, p_winner_game_id text); Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON FUNCTION games_library_private.move_duplicate_enrichment_to_winner(p_loser_game_id text, p_winner_game_id text) IS 'Moves external enrichment side-table rows from a duplicate loser game to the reviewed winner before the loser is deleted.';


--
-- Name: normalize_external_key(text); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.normalize_external_key(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
  select regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '', 'g');
$$;


--
-- Name: normalize_external_platform_key(text); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.normalize_external_platform_key(p_value text) RETURNS text
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $$
  select regexp_replace(lower(coalesce(p_value, '')), '[^a-z0-9]+', '', 'g');
$$;


--
-- Name: parse_external_int(text); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.parse_external_int(p_value text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $_$
  select case
    when p_value is null then null
    when btrim(p_value) = '' then null
    when lower(btrim(p_value)) in ('nan', 'tbd', 'not available', 'n/a') then null
    when btrim(p_value) ~ '^-?[0-9]+(\.0+)?$' then btrim(p_value)::numeric::int
    else null
  end;
$_$;


--
-- Name: parse_external_numeric(text); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.parse_external_numeric(p_value text) RETURNS numeric
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'pg_catalog'
    AS $_$
  select case
    when p_value is null then null
    when btrim(p_value) = '' then null
    when lower(btrim(p_value)) in ('nan', 'tbd', 'not available', 'n/a') then null
    when btrim(p_value) ~ '^-?[0-9]+(\.[0-9]+)?$' then btrim(p_value)::numeric
    else null
  end;
$_$;


--
-- Name: parse_metacritic_release_date(text); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.parse_metacritic_release_date(p_value text) RETURNS date
    LANGUAGE plpgsql STABLE
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: propose_game_duplicate_actions(); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.propose_game_duplicate_actions() RETURNS TABLE(groups_proposed integer, keep_rows integer, merge_rows integer)
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_groups int := 0;
  v_keep int := 0;
  v_merge int := 0;
begin
  perform * from games_library_private.refresh_game_duplicate_candidates();

  with proposed as (
    update games_library.game_duplicate_candidates c
    set
      proposed_action = p.recommended_action,
      winner_game_id = case
        when p.recommended_action = 'merge_into_winner'
        then p.recommended_winner_game_id
        else null
      end,
      updated_at = now()
    from games_library.game_duplicate_review_plan p
    where p.group_key = c.group_key
      and p.game_id = c.game_id
      and p.review_bucket = 'auto_proposable_same_title_year'
      and p.recommended_action in ('keep', 'merge_into_winner')
      and c.proposed_action = 'needs_review'
      and c.winner_game_id is null
    returning c.group_key, c.proposed_action
  )
  select
    count(distinct group_key)::int,
    count(*) filter (where proposed_action = 'keep')::int,
    count(*) filter (where proposed_action = 'merge_into_winner')::int
  into v_groups, v_keep, v_merge
  from proposed;

  return query select v_groups, v_keep, v_merge;
end;
$$;


--
-- Name: FUNCTION propose_game_duplicate_actions(); Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON FUNCTION games_library_private.propose_game_duplicate_actions() IS 'Fills duplicate review proposed_action and winner_game_id for conservative same-title/year groups. It does not merge, delete, or redirect games.';


--
-- Name: refresh_external_match_candidates(); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.refresh_external_match_candidates() RETURNS TABLE(inserted_or_updated integer, auto_approved integer, needs_review integer, low_confidence integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: refresh_game_duplicate_candidates(); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.refresh_game_duplicate_candidates() RETURNS TABLE(groups_upserted integer, candidates_upserted integer)
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_groups int := 0;
  v_candidates int := 0;
begin
  with source_groups as (
    select distinct
      group_key,
      candidate_count,
      known_year_count,
      source_type_count,
      has_group_edition_keyword,
      suggested_review
    from games_library.game_duplicate_candidate_source
  ),
  upserted as (
    insert into games_library.game_duplicate_groups (
      group_key,
      candidate_count,
      known_year_count,
      source_type_count,
      has_edition_keyword,
      suggested_review
    )
    select
      group_key,
      candidate_count,
      known_year_count,
      source_type_count,
      has_group_edition_keyword,
      suggested_review
    from source_groups
    on conflict (group_key) do update set
      candidate_count = excluded.candidate_count,
      known_year_count = excluded.known_year_count,
      source_type_count = excluded.source_type_count,
      has_edition_keyword = excluded.has_edition_keyword,
      suggested_review = excluded.suggested_review,
      updated_at = now()
    returning 1
  )
  select count(*)::int into v_groups from upserted;

  with upserted as (
    insert into games_library.game_duplicate_candidates (
      group_key,
      game_id,
      title,
      source_type,
      source_ref,
      release_year,
      has_edition_keyword,
      platform_count,
      tag_count,
      alias_count,
      has_cover
    )
    select
      group_key,
      game_id,
      title,
      source_type,
      source_ref,
      release_year,
      has_edition_keyword,
      platform_count,
      tag_count,
      alias_count,
      has_cover
    from games_library.game_duplicate_candidate_source
    on conflict (group_key, game_id) do update set
      title = excluded.title,
      source_type = excluded.source_type,
      source_ref = excluded.source_ref,
      release_year = excluded.release_year,
      has_edition_keyword = excluded.has_edition_keyword,
      platform_count = excluded.platform_count,
      tag_count = excluded.tag_count,
      alias_count = excluded.alias_count,
      has_cover = excluded.has_cover,
      updated_at = now()
    returning 1
  )
  select count(*)::int into v_candidates from upserted;

  return query select v_groups, v_candidates;
end;
$$;


--
-- Name: FUNCTION refresh_game_duplicate_candidates(); Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON FUNCTION games_library_private.refresh_game_duplicate_candidates() IS 'Refreshes duplicate review queue from live catalog without overwriting human review decisions.';


--
-- Name: refresh_metacritic_review_sentiment_candidates(); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.refresh_metacritic_review_sentiment_candidates() RETURNS TABLE(inserted_or_updated integer, auto_approved integer, needs_review integer, low_confidence integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
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


--
-- Name: refresh_series_cleanup_candidates(); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.refresh_series_cleanup_candidates() RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_upserted int := 0;
begin
  with genre_matches as (
    select
      s.id as series_id,
      array_agg(gr.id order by gr.id) as matching_genre_ids
    from games_library.series s
    join games_library.genres gr
      on lower(btrim(s.name)) = lower(btrim(gr.name))
    group by s.id
  ),
  tag_matches as (
    select
      s.id as series_id,
      array_agg(t.id order by t.id) as matching_tag_ids
    from games_library.series s
    join games_library.tags t
      on lower(btrim(s.name)) = lower(btrim(t.name))
    group by s.id
  ),
  source as (
    select
      s.id as series_id,
      s.name as series_name,
      case
        when gm.series_id is not null and tm.series_id is not null then 'genre_and_tag_name'
        when gm.series_id is not null then 'genre_name'
        else 'tag_name'
      end as match_kind,
      coalesce(gm.matching_genre_ids, array[]::text[]) as matching_genre_ids,
      coalesce(tm.matching_tag_ids, array[]::text[]) as matching_tag_ids,
      stats.current_game_count,
      coalesce(stats.sample_game_ids, array[]::text[]) as sample_game_ids,
      coalesce(stats.sample_titles, array[]::text[]) as sample_titles,
      case
        when gm.series_id is not null then 'auto_clear_series_id'
        else 'review_keep_or_clear'
      end as suggested_action,
      case
        when gm.series_id is not null then 'approved_auto_clear'
        else 'needs_review'
      end as initial_status
    from games_library.series s
    left join genre_matches gm on gm.series_id = s.id
    left join tag_matches tm on tm.series_id = s.id
    cross join lateral (
      select
        count(g.game_id)::int as current_game_count,
        (array_agg(g.game_id order by g.title, g.game_id))[1:20] as sample_game_ids,
        (array_agg(g.title order by g.title, g.game_id))[1:20] as sample_titles
      from games_library.games g
      where g.series_id = s.id
    ) stats
    where gm.series_id is not null
       or tm.series_id is not null
  ),
  upserted as (
    insert into games_library.series_cleanup_candidates (
      series_id,
      series_name,
      match_kind,
      matching_genre_ids,
      matching_tag_ids,
      current_game_count,
      sample_game_ids,
      sample_titles,
      suggested_action,
      status
    )
    select
      series_id,
      series_name,
      match_kind,
      matching_genre_ids,
      matching_tag_ids,
      current_game_count,
      sample_game_ids,
      sample_titles,
      suggested_action,
      initial_status
    from source
    on conflict (series_id) do update set
      series_name = excluded.series_name,
      match_kind = excluded.match_kind,
      matching_genre_ids = excluded.matching_genre_ids,
      matching_tag_ids = excluded.matching_tag_ids,
      current_game_count = excluded.current_game_count,
      sample_game_ids = excluded.sample_game_ids,
      sample_titles = excluded.sample_titles,
      suggested_action = excluded.suggested_action,
      updated_at = now()
    returning 1
  )
  select count(*)::int into v_upserted from upserted;

  return v_upserted;
end;
$$;


--
-- Name: FUNCTION refresh_series_cleanup_candidates(); Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON FUNCTION games_library_private.refresh_series_cleanup_candidates() IS 'Refreshes generic-vocabulary series cleanup candidates without overwriting human review status.';


--
-- Name: review_external_match_candidate(uuid, text, text, text); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.review_external_match_candidate(p_candidate_id uuid, p_decision text, p_reviewed_by text DEFAULT 'manual_review'::text, p_review_notes text DEFAULT ''::text) RETURNS TABLE(candidate_id uuid, new_status text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'pg_catalog'
    AS $$
declare
  v_status text;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reviewed_by text := coalesce(nullif(btrim(p_reviewed_by), ''), 'manual_review');
begin
  if p_candidate_id is null then
    raise exception 'p_candidate_id is required';
  end if;

  if v_decision not in ('approve', 'reject') then
    raise exception 'p_decision must be approve or reject';
  end if;

  select status
  into v_status
  from games_library.game_external_match_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'External match candidate % does not exist', p_candidate_id;
  end if;

  if v_status not in ('needs_review', 'low_confidence') then
    raise exception 'Candidate % is %, expected needs_review or low_confidence', p_candidate_id, v_status;
  end if;

  update games_library.game_external_match_candidates
  set
    status = case when v_decision = 'approve' then 'approved' else 'rejected' end,
    reviewed_by = v_reviewed_by,
    reviewed_at = now(),
    review_notes = case
      when btrim(coalesce(p_review_notes, '')) = '' then review_notes
      when btrim(review_notes) = '' then btrim(p_review_notes)
      else review_notes || E'\n' || btrim(p_review_notes)
    end,
    updated_at = now()
  where id = p_candidate_id
  returning id, status into candidate_id, new_status;

  return next;
end;
$$;


--
-- Name: FUNCTION review_external_match_candidate(p_candidate_id uuid, p_decision text, p_reviewed_by text, p_review_notes text); Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON FUNCTION games_library_private.review_external_match_candidate(p_candidate_id uuid, p_decision text, p_reviewed_by text, p_review_notes text) IS 'Sets a pending external match candidate to approved or rejected. Apply enrichment with the appropriate importer/apply function after approval.';


--
-- Name: slugify_game_id(text); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.slugify_game_id(p_title text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT
    SET search_path TO 'pg_catalog'
    AS $$
  select nullif(
    regexp_replace(
      trim(both '_' from regexp_replace(lower(p_title), '[^a-z0-9]+', '_', 'g')),
      '_+',
      '_',
      'g'
    ),
    ''
  )
$$;


--
-- Name: FUNCTION slugify_game_id(p_title text); Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON FUNCTION games_library_private.slugify_game_id(p_title text) IS 'Converts a title into the source-agnostic game_id format used by catalog cleanup helpers.';


--
-- Name: slugify_game_id_unaccent(text); Type: FUNCTION; Schema: games_library_private; Owner: -
--

CREATE FUNCTION games_library_private.slugify_game_id_unaccent(p_title text) RETURNS text
    LANGUAGE sql STABLE STRICT
    SET search_path TO 'pg_catalog', 'extensions'
    AS $$
  select nullif(
    regexp_replace(
      trim(
        both '_' from regexp_replace(
          lower(extensions.unaccent(regexp_replace(p_title, '[®™©℠]', '', 'g'))),
          '[^a-z0-9]+',
          '_',
          'g'
        )
      ),
      '_+',
      '_',
      'g'
    ),
    ''
  )
$$;


--
-- Name: FUNCTION slugify_game_id_unaccent(p_title text); Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON FUNCTION games_library_private.slugify_game_id_unaccent(p_title text) IS 'Converts a title into a source-agnostic ASCII game_id using unaccent transliteration and stripping legal marks.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: api_cache; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.api_cache (
    cache_key text NOT NULL,
    value jsonb NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.audit_log (
    id bigint NOT NULL,
    user_id uuid,
    action text NOT NULL,
    ip_address text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: games_library; Owner: -
--

ALTER TABLE games_library.audit_log ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: game_platforms; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_platforms (
    game_id text NOT NULL,
    platform_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint NOT NULL,
    platform_ref bigint NOT NULL
);


--
-- Name: TABLE game_platforms; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.game_platforms IS 'Many-to-many join: which games are available on which platforms';


--
-- Name: COLUMN game_platforms.game_id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_platforms.game_id IS 'FK to games table';


--
-- Name: COLUMN game_platforms.platform_id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_platforms.platform_id IS 'FK to platforms table';


--
-- Name: game_scores; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id text NOT NULL,
    platform_id text,
    score_source text NOT NULL,
    critic_score numeric,
    critic_count integer,
    user_score numeric,
    user_count integer,
    source_key text NOT NULL,
    match_candidate_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint NOT NULL,
    platform_ref bigint,
    CONSTRAINT game_scores_critic_score_0_100 CHECK (((critic_score IS NULL) OR ((critic_score >= (0)::numeric) AND (critic_score <= (100)::numeric)))),
    CONSTRAINT game_scores_review_counts_nonnegative CHECK ((((critic_count IS NULL) OR (critic_count >= 0)) AND ((user_count IS NULL) OR (user_count >= 0)))),
    CONSTRAINT game_scores_score_source_check CHECK ((score_source = ANY (ARRAY['rawg'::text, 'igdb'::text, 'metacritic'::text, 'vgsales'::text, 'metacritic_review_sentiment'::text, 'metacritic_staging'::text]))),
    CONSTRAINT game_scores_user_score_0_10 CHECK (((user_score IS NULL) OR ((user_score >= (0)::numeric) AND (user_score <= (10)::numeric))))
);


--
-- Name: COLUMN game_scores.critic_score; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_scores.critic_score IS 'Normalized critic score on a 0-100 scale.';


--
-- Name: COLUMN game_scores.user_score; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_scores.user_score IS 'Normalized user score on a 0-10 scale. Source raw values may be preserved in metadata.';


--
-- Name: games; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.games (
    game_id text NOT NULL,
    title text NOT NULL,
    aliases text[] DEFAULT '{}'::text[] NOT NULL,
    release_year integer,
    release_state text DEFAULT 'released'::text NOT NULL,
    source_type text DEFAULT 'finder'::text NOT NULL,
    source_ref text DEFAULT ''::text NOT NULL,
    cover_url text DEFAULT ''::text NOT NULL,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    sort_date date,
    genre_id text,
    series_id text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    search_document tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, ((((((COALESCE(title, ''::text) || ' '::text) || COALESCE(games_library.immutable_array_to_string(aliases, ' '::text), ''::text)) || ' '::text) || COALESCE(games_library.get_series_name(series_id), ''::text)) || ' '::text) || COALESCE(games_library.get_genre_name(genre_id), ''::text)))) STORED,
    platforms text[] DEFAULT '{}'::text[] NOT NULL,
    playtime integer,
    previous_cover_url text,
    pk bigint NOT NULL,
    genre_ref bigint,
    series_ref bigint,
    CONSTRAINT games_game_id_not_blank CHECK ((btrim(game_id) <> ''::text)),
    CONSTRAINT valid_release_state CHECK ((release_state = ANY (ARRAY['released'::text, 'unreleased'::text]))),
    CONSTRAINT valid_source_type CHECK ((source_type = ANY (ARRAY['catalog'::text, 'universe'::text, 'finder'::text])))
);


--
-- Name: TABLE games; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.games IS 'Master game catalog. Each row is a unique game title.';


--
-- Name: COLUMN games.game_id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.games.game_id IS 'Unique slug/identifier, e.g. rawg_zelda_breath_of_the_wild';


--
-- Name: COLUMN games.title; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.games.title IS 'Display title';


--
-- Name: COLUMN games.aliases; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.games.aliases IS 'Alternative names for search (denormalized cache of game_aliases)';


--
-- Name: COLUMN games.source_type; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.games.source_type IS 'Origin: catalog (verified), universe (expanded), finder (scraped)';


--
-- Name: COLUMN games.source_ref; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.games.source_ref IS 'External reference URL or ID (e.g. rawg:12345)';


--
-- Name: COLUMN games.cover_url; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.games.cover_url IS 'Cover image path or URL';


--
-- Name: COLUMN games.tags; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.games.tags IS 'Gameplay tags (denormalized cache of game_tags)';


--
-- Name: COLUMN games.sort_date; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.games.sort_date IS 'Sortable date for ordering in lists';


--
-- Name: COLUMN games.genre_id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.games.genre_id IS 'FK to genres table (normalized)';


--
-- Name: COLUMN games.series_id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.games.series_id IS 'FK to series table (normalized)';


--
-- Name: COLUMN games.created_at; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.games.created_at IS 'When the record was first inserted';


--
-- Name: COLUMN games.updated_at; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.games.updated_at IS 'When the record was last updated';


--
-- Name: COLUMN games.search_document; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.games.search_document IS 'Stored tsvector for full-text search on title, aliases, series name, and genre name';


--
-- Name: platforms; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.platforms (
    id text NOT NULL,
    name text NOT NULL,
    rawg_id integer,
    family text DEFAULT 'other'::text NOT NULL,
    vendor text DEFAULT 'Other'::text NOT NULL,
    kind text DEFAULT 'other'::text NOT NULL,
    gen integer DEFAULT 99 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pk bigint NOT NULL,
    igdb_id integer,
    CONSTRAINT platforms_kind_check CHECK ((kind = ANY (ARRAY['console'::text, 'handheld'::text, 'hybrid'::text, 'computer'::text, 'other'::text])))
);


--
-- Name: COLUMN platforms.family; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.platforms.family IS 'Platform family: nintendo, playstation, xbox, sega, pc, apple, google, snk, atari, other';


--
-- Name: COLUMN platforms.vendor; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.platforms.vendor IS 'Manufacturer display name';


--
-- Name: COLUMN platforms.kind; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.platforms.kind IS 'Form factor: console, handheld, hybrid, computer, other';


--
-- Name: COLUMN platforms.gen; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.platforms.gen IS 'Hardware generation number (0=non-console, 2-10)';


--
-- Name: cover_review_queue; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.cover_review_queue AS
 SELECT game_id,
    title,
    cover_url,
    ( SELECT max(gs.critic_score) AS max
           FROM games_library.game_scores gs
          WHERE ((gs.game_id = g.game_id) AND (gs.score_source = 'metacritic'::text))) AS metacritic_score,
    ( SELECT max(p.gen) AS max
           FROM (games_library.game_platforms gp
             JOIN games_library.platforms p ON ((p.id = gp.platform_id)))
          WHERE (gp.game_id = g.game_id)) AS max_platform_gen,
    ( SELECT array_agg(p.name ORDER BY p.gen DESC) AS array_agg
           FROM (games_library.game_platforms gp
             JOIN games_library.platforms p ON ((p.id = gp.platform_id)))
          WHERE (gp.game_id = g.game_id)) AS platform_names
   FROM games_library.games g
  WHERE ((cover_url IS NOT NULL) AND (cover_url <> ''::text));


--
-- Name: game_duplicate_candidates; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_duplicate_candidates (
    group_key text NOT NULL,
    game_id text NOT NULL,
    title text NOT NULL,
    source_type text NOT NULL,
    source_ref text DEFAULT ''::text NOT NULL,
    release_year integer NOT NULL,
    has_edition_keyword boolean DEFAULT false NOT NULL,
    platform_count integer DEFAULT 0 NOT NULL,
    tag_count integer DEFAULT 0 NOT NULL,
    alias_count integer DEFAULT 0 NOT NULL,
    has_cover boolean DEFAULT false NOT NULL,
    proposed_action text DEFAULT 'needs_review'::text NOT NULL,
    winner_game_id text,
    review_notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint NOT NULL,
    CONSTRAINT game_duplicate_candidates_alias_count_check CHECK ((alias_count >= 0)),
    CONSTRAINT game_duplicate_candidates_platform_count_check CHECK ((platform_count >= 0)),
    CONSTRAINT game_duplicate_candidates_proposed_action_check CHECK ((proposed_action = ANY (ARRAY['needs_review'::text, 'keep'::text, 'merge_into_winner'::text, 'preserve_edition'::text, 'not_duplicate'::text]))),
    CONSTRAINT game_duplicate_candidates_tag_count_check CHECK ((tag_count >= 0)),
    CONSTRAINT game_duplicate_candidates_winner_not_self CHECK (((winner_game_id IS NULL) OR (winner_game_id <> game_id)))
);


--
-- Name: TABLE game_duplicate_candidates; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.game_duplicate_candidates IS 'Per-game duplicate review queue. These rows protect games from casual hard deletes while review is pending.';


--
-- Name: COLUMN game_duplicate_candidates.proposed_action; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_duplicate_candidates.proposed_action IS 'Human-reviewed action. Refreshes update snapshots but do not overwrite this field.';


--
-- Name: COLUMN game_duplicate_candidates.winner_game_id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_duplicate_candidates.winner_game_id IS 'Canonical target when proposed_action is merge_into_winner.';


--
-- Name: game_duplicate_groups; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_duplicate_groups (
    group_key text NOT NULL,
    candidate_count integer NOT NULL,
    known_year_count integer DEFAULT 0 NOT NULL,
    source_type_count integer DEFAULT 0 NOT NULL,
    has_edition_keyword boolean DEFAULT false NOT NULL,
    suggested_review text DEFAULT 'needs_review'::text NOT NULL,
    status text DEFAULT 'needs_review'::text NOT NULL,
    review_notes text DEFAULT ''::text NOT NULL,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT game_duplicate_groups_candidate_count_check CHECK ((candidate_count > 1)),
    CONSTRAINT game_duplicate_groups_known_year_count_check CHECK ((known_year_count >= 0)),
    CONSTRAINT game_duplicate_groups_source_type_count_check CHECK ((source_type_count >= 0)),
    CONSTRAINT game_duplicate_groups_status_check CHECK ((status = ANY (ARRAY['needs_review'::text, 'reviewed'::text, 'approved'::text, 'merged'::text, 'rejected'::text, 'ignored'::text]))),
    CONSTRAINT game_duplicate_groups_suggested_review_check CHECK ((suggested_review = ANY (ARRAY['needs_review'::text, 'merge_candidate'::text, 'manual_year_review'::text, 'preserve_edition_review'::text])))
);


--
-- Name: TABLE game_duplicate_groups; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.game_duplicate_groups IS 'Review groups for source-agnostic, edition-aware game deduplication.';


--
-- Name: COLUMN game_duplicate_groups.group_key; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_duplicate_groups.group_key IS 'Normalized title key used to group candidate duplicates.';


--
-- Name: COLUMN game_duplicate_groups.suggested_review; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_duplicate_groups.suggested_review IS 'Machine-generated starting point. Human review controls final status.';


--
-- Name: profiles; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    game_states jsonb DEFAULT '{}'::jsonb NOT NULL,
    profile jsonb,
    onboarding jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE profiles; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.profiles IS 'Authenticated profiles use auth.uid() as user_id. Local anonymous profiles are browser device IDs and must only be accessed through the server API service-role boundary.';


--
-- Name: user_game_states; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.user_game_states (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    game_id text NOT NULL,
    status text,
    rating numeric(2,1),
    in_backlog boolean DEFAULT false NOT NULL,
    in_wishlist boolean DEFAULT false NOT NULL,
    excluded boolean DEFAULT false NOT NULL,
    source text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    in_playfit_picks boolean DEFAULT false NOT NULL,
    game_ref bigint NOT NULL,
    CONSTRAINT user_game_states_rating_check CHECK (((rating >= (0)::numeric) AND (rating <= (5)::numeric))),
    CONSTRAINT user_game_states_source_check CHECK ((source = ANY (ARRAY['onboarding'::text, 'finder'::text, 'manual'::text]))),
    CONSTRAINT user_game_states_status_check CHECK ((status = ANY (ARRAY['playing'::text, 'on_hold'::text, 'shelved'::text, 'beaten'::text, 'completed'::text, 'abandoned'::text, 'want_to_play'::text])))
);


--
-- Name: game_duplicate_review_plan; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.game_duplicate_review_plan WITH (security_invoker='true') AS
 WITH user_refs AS (
         SELECT user_game_states.game_id,
            (count(*))::integer AS ref_count
           FROM games_library.user_game_states
          GROUP BY user_game_states.game_id
        UNION ALL
         SELECT key.key AS game_id,
            (count(*))::integer AS ref_count
           FROM (games_library.profiles p
             CROSS JOIN LATERAL jsonb_object_keys(p.game_states) key(key))
          GROUP BY key.key
        ), refs AS (
         SELECT user_refs.game_id,
            (sum(user_refs.ref_count))::integer AS ref_count
           FROM user_refs
          GROUP BY user_refs.game_id
        ), ranked AS (
         SELECT c.group_key,
            c.game_id,
            c.title,
            c.source_type,
            c.source_ref,
            c.release_year,
            c.has_edition_keyword,
            c.platform_count,
            c.tag_count,
            c.alias_count,
            c.has_cover,
            c.proposed_action,
            c.winner_game_id,
            g.candidate_count,
            g.known_year_count,
            g.source_type_count,
            g.has_edition_keyword AS group_has_edition_keyword,
            g.suggested_review,
            g.status AS group_status,
            COALESCE(r_1.ref_count, 0) AS user_ref_count,
            sum(COALESCE(r_1.ref_count, 0)) OVER (PARTITION BY c.group_key) AS group_user_ref_count,
            (c.game_id !~ '^(rawg|steam|wiki)_'::text) AS has_stable_catalog_id,
            row_number() OVER (PARTITION BY c.group_key ORDER BY COALESCE(r_1.ref_count, 0) DESC, (c.game_id !~ '^(rawg|steam|wiki)_'::text) DESC, (c.source_type = 'catalog'::text) DESC, (c.release_year <> 0) DESC, c.platform_count DESC, c.tag_count DESC, c.alias_count DESC, c.has_cover DESC, c.game_id) AS candidate_rank
           FROM ((games_library.game_duplicate_candidates c
             JOIN games_library.game_duplicate_groups g USING (group_key))
             LEFT JOIN refs r_1 ON ((r_1.game_id = c.game_id)))
        ), winners AS (
         SELECT ranked.group_key,
            ranked.game_id AS recommended_winner_game_id,
            ranked.title AS recommended_winner_title
           FROM ranked
          WHERE (ranked.candidate_rank = 1)
        )
 SELECT r.group_key,
    r.game_id,
    r.title,
    r.source_type,
    r.source_ref,
    r.release_year,
    r.has_edition_keyword,
    r.platform_count,
    r.tag_count,
    r.alias_count,
    r.has_cover,
    r.user_ref_count,
    r.group_user_ref_count,
    r.has_stable_catalog_id,
    r.candidate_rank,
    r.candidate_count,
    r.known_year_count,
    r.source_type_count,
    r.group_has_edition_keyword,
    r.suggested_review,
    r.group_status,
    r.proposed_action,
    r.winner_game_id,
    w.recommended_winner_game_id,
    w.recommended_winner_title,
        CASE
            WHEN (r.suggested_review <> 'merge_candidate'::text) THEN 'manual_review'::text
            WHEN (r.group_status <> 'needs_review'::text) THEN 'manual_review'::text
            WHEN (r.group_user_ref_count > 0) THEN 'manual_user_references'::text
            WHEN r.group_has_edition_keyword THEN 'manual_edition_or_remaster'::text
            WHEN (r.known_year_count > 1) THEN 'manual_multiple_known_years'::text
            ELSE 'auto_proposable_same_title_year'::text
        END AS review_bucket,
        CASE
            WHEN ((r.suggested_review = 'merge_candidate'::text) AND (r.group_status = 'needs_review'::text) AND (r.group_user_ref_count = 0) AND (NOT r.group_has_edition_keyword) AND (r.known_year_count <= 1) AND (r.candidate_rank = 1)) THEN 'keep'::text
            WHEN ((r.suggested_review = 'merge_candidate'::text) AND (r.group_status = 'needs_review'::text) AND (r.group_user_ref_count = 0) AND (NOT r.group_has_edition_keyword) AND (r.known_year_count <= 1)) THEN 'merge_into_winner'::text
            ELSE 'needs_review'::text
        END AS recommended_action
   FROM (ranked r
     JOIN winners w USING (group_key));


--
-- Name: VIEW game_duplicate_review_plan; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON VIEW games_library.game_duplicate_review_plan IS 'Read-only duplicate review plan. It proposes source-agnostic merges only for same normalized-title groups without user refs, multiple known years, or edition/remaster signals.';


--
-- Name: COLUMN game_duplicate_review_plan.recommended_winner_game_id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_duplicate_review_plan.recommended_winner_game_id IS 'Recommended stable winner. Ranking prioritizes user references, stable non-source-prefixed IDs, catalog rows, known years, and metadata richness.';


--
-- Name: COLUMN game_duplicate_review_plan.review_bucket; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_duplicate_review_plan.review_bucket IS 'Why a row can be auto-proposed or why it must stay manual review.';


--
-- Name: duplicate_manual_review_triage; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.duplicate_manual_review_triage WITH (security_invoker='true') AS
 WITH group_profile AS (
         SELECT p.group_key,
            count(*) AS candidate_rows,
            count(DISTINCT NULLIF(p.release_year, 0)) AS known_year_count,
            min(NULLIF(p.release_year, 0)) AS min_known_year,
            max(NULLIF(p.release_year, 0)) AS max_known_year,
            bool_or(p.group_has_edition_keyword) AS has_edition_keyword,
            max(p.group_user_ref_count) AS group_user_ref_count,
            max(p.candidate_count) AS candidate_count,
            jsonb_agg(jsonb_build_object('game_id', p.game_id, 'title', p.title, 'release_year', p.release_year, 'source_type', p.source_type, 'source_ref', p.source_ref, 'platform_count', p.platform_count, 'tag_count', p.tag_count, 'alias_count', p.alias_count, 'has_cover', p.has_cover) ORDER BY p.release_year, p.title, p.game_id) AS candidates
           FROM (games_library.game_duplicate_review_plan p
             JOIN games_library.game_duplicate_groups g ON ((g.group_key = p.group_key)))
          WHERE (g.status = 'needs_review'::text)
          GROUP BY p.group_key
        )
 SELECT group_key,
    candidate_rows,
    candidate_count,
    known_year_count,
    min_known_year,
    max_known_year,
    has_edition_keyword,
    group_user_ref_count,
        CASE
            WHEN (group_user_ref_count > 0) THEN 'manual_user_refs'::text
            WHEN has_edition_keyword THEN 'manual_edition_or_remaster'::text
            WHEN (candidate_rows > 2) THEN 'manual_large_collision'::text
            WHEN (known_year_count > 1) THEN 'manual_different_known_years'::text
            ELSE 'manual_other'::text
        END AS triage_bucket,
        CASE
            WHEN (group_user_ref_count > 0) THEN 'Review user state before merging or preserving.'::text
            WHEN has_edition_keyword THEN 'Check whether entries are editions/remasters/remakes that should remain playable separately.'::text
            WHEN (candidate_rows > 2) THEN 'Resolve canonical identity one candidate at a time; avoid group-wide merge.'::text
            WHEN (known_year_count > 1) THEN 'Different known years can be ports, reboots, sequels, or data errors; verify source metadata first.'::text
            ELSE 'Manual source check required.'::text
        END AS triage_instruction,
    candidates
   FROM group_profile;


--
-- Name: VIEW duplicate_manual_review_triage; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON VIEW games_library.duplicate_manual_review_triage IS 'Remaining duplicate groups after conservative post-ingest merge processing, bucketed for manual review.';


--
-- Name: game_external_match_candidates; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_external_match_candidates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source text NOT NULL,
    source_dataset text NOT NULL,
    source_key text NOT NULL,
    source_row_id bigint NOT NULL,
    source_title text NOT NULL,
    source_platform_text text,
    source_platform_id text,
    source_release_year integer,
    game_id text NOT NULL,
    confidence_score integer NOT NULL,
    matched_by text NOT NULL,
    status text DEFAULT 'needs_review'::text NOT NULL,
    signals jsonb DEFAULT '{}'::jsonb NOT NULL,
    raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    applied_at timestamp with time zone,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    review_notes text DEFAULT ''::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint,
    CONSTRAINT game_external_match_candidates_confidence_score_check CHECK (((confidence_score >= 0) AND (confidence_score <= 100))),
    CONSTRAINT game_external_match_candidates_source_check CHECK ((source = ANY (ARRAY['metacritic'::text, 'vgsales'::text]))),
    CONSTRAINT game_external_match_candidates_status_check CHECK ((status = ANY (ARRAY['auto_approved'::text, 'needs_review'::text, 'low_confidence'::text, 'approved'::text, 'rejected'::text, 'superseded'::text, 'archived_stale'::text])))
);


--
-- Name: TABLE game_external_match_candidates; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.game_external_match_candidates IS 'Review queue for matching external CSV rows to canonical Playfit game IDs. This table is non-destructive and does not mutate games.';


--
-- Name: external_match_candidate_summary; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.external_match_candidate_summary WITH (security_invoker='true') AS
 SELECT source,
    source_dataset,
    status,
    count(*) AS candidate_count,
    round(avg(confidence_score), 2) AS avg_confidence,
    count(DISTINCT game_id) AS distinct_games,
    count(*) FILTER (WHERE (applied_at IS NOT NULL)) AS applied_count
   FROM games_library.game_external_match_candidates
  GROUP BY source, source_dataset, status;


--
-- Name: external_match_review_queue; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.external_match_review_queue WITH (security_invoker='true') AS
 SELECT c.id AS candidate_id,
    c.source,
    c.source_dataset,
    c.source_key,
    c.source_row_id,
    c.status,
    c.confidence_score,
    c.matched_by,
    c.source_title,
    c.source_platform_text,
    c.source_platform_id,
    sp.name AS source_platform_name,
    c.source_release_year,
    c.game_id,
    g.title AS game_title,
    g.release_year AS game_release_year,
    g.source_type AS game_source_type,
    g.source_ref AS game_source_ref,
    g.cover_url AS game_cover_url,
    c.signals,
    c.raw_payload,
    ((c.signals ->> 'title_group_count'::text))::integer AS title_group_count,
    ((c.signals ->> 'platform_match'::text))::boolean AS platform_match,
    (c.signals ->> 'year_signal'::text) AS year_signal,
        CASE
            WHEN (c.status <> 'needs_review'::text) THEN 'not_pending'::text
            WHEN (COALESCE(((c.signals ->> 'title_group_count'::text))::integer, 0) > 1) THEN 'ambiguous_catalog_title'::text
            WHEN ((c.signals ->> 'year_signal'::text) = 'year_conflict'::text) THEN 'year_conflict'::text
            WHEN (c.matched_by = 'exact_title_platform'::text) THEN 'platform_match_year_missing_or_weak'::text
            WHEN (c.matched_by = 'exact_title_year'::text) THEN 'year_match_platform_missing_or_mismatch'::text
            WHEN (c.matched_by = 'exact_title_review_required'::text) THEN 'multi_signal_manual_review'::text
            ELSE 'manual_review'::text
        END AS review_lane,
        CASE
            WHEN (c.status <> 'needs_review'::text) THEN 999
            WHEN (COALESCE(((c.signals ->> 'title_group_count'::text))::integer, 0) > 1) THEN 10
            WHEN ((c.signals ->> 'year_signal'::text) = 'year_conflict'::text) THEN 20
            WHEN (c.matched_by = 'exact_title_year'::text) THEN 30
            WHEN (c.matched_by = 'exact_title_platform'::text) THEN 40
            ELSE 50
        END AS review_priority,
        CASE
            WHEN (c.status <> 'needs_review'::text) THEN 'Already reviewed or not pending.'::text
            WHEN (COALESCE(((c.signals ->> 'title_group_count'::text))::integer, 0) > 1) THEN 'Do not batch approve. Pick the exact canonical game among same-title catalog rows, then approve only that candidate.'::text
            WHEN ((c.signals ->> 'year_signal'::text) = 'year_conflict'::text) THEN 'Reject unless source proves this is the same playable entry and the catalog year is wrong.'::text
            WHEN (c.matched_by = 'exact_title_year'::text) THEN 'Check platform compatibility. Approve only if the source platform should belong to this game.'::text
            WHEN (c.matched_by = 'exact_title_platform'::text) THEN 'Check release date/year. Approve if title and platform are the same playable entry and catalog year is missing or acceptable.'::text
            ELSE 'Review title, platform, year, edition/remaster wording, and raw payload before approving.'::text
        END AS review_instruction,
    c.created_at,
    c.updated_at
   FROM ((games_library.game_external_match_candidates c
     JOIN games_library.games g ON ((g.game_id = c.game_id)))
     LEFT JOIN games_library.platforms sp ON ((sp.id = c.source_platform_id)))
  WHERE (c.status = 'needs_review'::text);


--
-- Name: VIEW external_match_review_queue; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON VIEW games_library.external_match_review_queue IS 'Human review queue for external match candidates that did not satisfy auto-approval rules.';


--
-- Name: COLUMN external_match_review_queue.review_lane; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.external_match_review_queue.review_lane IS 'Reason the candidate needs manual review before it can enrich the catalog.';


--
-- Name: COLUMN external_match_review_queue.review_instruction; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.external_match_review_queue.review_instruction IS 'Reviewer guidance for approving or rejecting the candidate.';


--
-- Name: external_match_review_lane_summary; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.external_match_review_lane_summary WITH (security_invoker='true') AS
 SELECT source,
    source_dataset,
    review_lane,
    review_priority,
    count(*) AS candidate_count,
    count(DISTINCT game_id) AS distinct_games,
    round(avg(confidence_score), 2) AS avg_confidence
   FROM games_library.external_match_review_queue
  GROUP BY source, source_dataset, review_lane, review_priority;


--
-- Name: game_age_ratings; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_age_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id text NOT NULL,
    platform_id text,
    rating_board text NOT NULL,
    rating text NOT NULL,
    descriptors text,
    source text NOT NULL,
    source_key text NOT NULL,
    match_candidate_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint NOT NULL,
    platform_ref bigint
);


--
-- Name: game_aliases; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_aliases (
    game_id text NOT NULL,
    alias text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint NOT NULL
);


--
-- Name: TABLE game_aliases; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.game_aliases IS 'Alternative/search names for games';


--
-- Name: COLUMN game_aliases.game_id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_aliases.game_id IS 'FK to games table';


--
-- Name: COLUMN game_aliases.alias; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_aliases.alias IS 'Alternative name for search';


--
-- Name: game_companies; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id text NOT NULL,
    company_name text NOT NULL,
    role text NOT NULL,
    source text NOT NULL,
    source_key text NOT NULL,
    match_candidate_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint NOT NULL,
    CONSTRAINT game_companies_role_check CHECK ((role = ANY (ARRAY['developer'::text, 'publisher'::text])))
);


--
-- Name: game_companies_preferred; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.game_companies_preferred AS
 SELECT DISTINCT ON (game_id, (lower(TRIM(BOTH FROM company_name))), role) id,
    game_id,
    company_name,
    role,
    source,
    source_key,
    game_ref
   FROM games_library.game_companies
  ORDER BY game_id, (lower(TRIM(BOTH FROM company_name))), role,
        CASE source
            WHEN 'igdb'::text THEN 1
            WHEN 'gamesdatabase'::text THEN 2
            WHEN 'psxdatacenter'::text THEN 3
            WHEN 'metacritic'::text THEN 4
            WHEN 'rawg'::text THEN 5
            WHEN 'vgsales'::text THEN 6
            ELSE 7
        END;


--
-- Name: VIEW game_companies_preferred; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON VIEW games_library.game_companies_preferred IS 'Una fila por (game_id, company_name, role), resolviendo duplicados entre providers. Precedencia: igdb > gamesdatabase > psxdatacenter > metacritic > rawg > vgsales.';


--
-- Name: game_tags; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_tags (
    game_id text NOT NULL,
    tag_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint NOT NULL
);


--
-- Name: TABLE game_tags; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.game_tags IS 'Many-to-many join: which tags apply to which games';


--
-- Name: COLUMN game_tags.game_id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_tags.game_id IS 'FK to games table';


--
-- Name: COLUMN game_tags.tag_id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_tags.tag_id IS 'FK to tags table';


--
-- Name: game_duplicate_candidate_source; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.game_duplicate_candidate_source WITH (security_invoker='true') AS
 WITH norm AS (
         SELECT g_1.game_id,
            g_1.title,
            g_1.source_type,
            g_1.source_ref,
            COALESCE(g_1.release_year, 0) AS release_year,
            regexp_replace(lower(g_1.title), '[^a-z0-9]+'::text, ''::text, 'g'::text) AS group_key,
            ((lower(g_1.title) ~ '(^|[^a-z0-9])(remaster|remastered|remake|definitive|collection|trilogy|anniversary|special|deluxe|complete|enhanced|goty)([^a-z0-9]|$)'::text) OR (lower(g_1.title) ~ '(^|[^a-z0-9])(director.?s cut|final cut|game of the year)([^a-z0-9]|$)'::text) OR (lower(g_1.title) ~ '(^|[^a-z0-9])hd([^a-z0-9]|$)'::text)) AS has_edition_keyword,
            COALESCE(pc.platform_count, 0) AS platform_count,
            COALESCE(tc.tag_count, 0) AS tag_count,
            (COALESCE(ac.alias_count, 0) + cardinality(g_1.aliases)) AS alias_count,
            (COALESCE(g_1.cover_url, ''::text) <> ''::text) AS has_cover
           FROM (((games_library.games g_1
             LEFT JOIN ( SELECT game_platforms.game_id,
                    (count(*))::integer AS platform_count
                   FROM games_library.game_platforms
                  GROUP BY game_platforms.game_id) pc USING (game_id))
             LEFT JOIN ( SELECT game_tags.game_id,
                    (count(*))::integer AS tag_count
                   FROM games_library.game_tags
                  GROUP BY game_tags.game_id) tc USING (game_id))
             LEFT JOIN ( SELECT game_aliases.game_id,
                    (count(*))::integer AS alias_count
                   FROM games_library.game_aliases
                  GROUP BY game_aliases.game_id) ac USING (game_id))
        ), groups AS (
         SELECT norm.group_key,
            (count(*))::integer AS candidate_count,
            (count(DISTINCT NULLIF(norm.release_year, 0)))::integer AS known_year_count,
            (count(DISTINCT norm.source_type))::integer AS source_type_count,
            bool_or(norm.has_edition_keyword) AS group_has_edition_keyword
           FROM norm
          GROUP BY norm.group_key
         HAVING (count(*) > 1)
        )
 SELECT n.group_key,
    n.game_id,
    n.title,
    n.source_type,
    n.source_ref,
    n.release_year,
    n.has_edition_keyword,
    n.platform_count,
    n.tag_count,
    n.alias_count,
    n.has_cover,
    g.candidate_count,
    g.known_year_count,
    g.source_type_count,
    g.group_has_edition_keyword AS has_group_edition_keyword,
        CASE
            WHEN g.group_has_edition_keyword THEN 'preserve_edition_review'::text
            WHEN (g.known_year_count > 1) THEN 'manual_year_review'::text
            ELSE 'merge_candidate'::text
        END AS suggested_review
   FROM (norm n
     JOIN groups g USING (group_key));


--
-- Name: VIEW game_duplicate_candidate_source; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON VIEW games_library.game_duplicate_candidate_source IS 'Live source query for duplicate review candidates. Uses normalized title keys and maps null release_year to unknown sentinel 0; review required before merge/delete.';


--
-- Name: game_duplicate_manual_review_queue; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.game_duplicate_manual_review_queue WITH (security_invoker='true') AS
 WITH group_rows AS (
         SELECT p.group_key,
            max(p.candidate_count) AS candidate_count,
            max(p.known_year_count) AS known_year_count,
            max(p.source_type_count) AS source_type_count,
            bool_or(p.group_has_edition_keyword) AS group_has_edition_keyword,
            (max(p.group_user_ref_count))::integer AS group_user_ref_count,
            max(p.suggested_review) AS suggested_review,
            max(p.review_bucket) AS review_bucket,
            max(p.recommended_winner_game_id) AS recommended_winner_game_id,
            max(p.recommended_winner_title) AS recommended_winner_title,
            (count(*) FILTER (WHERE (p.recommended_action = 'keep'::text)))::integer AS recommended_keep_rows,
            (count(*) FILTER (WHERE (p.recommended_action = 'merge_into_winner'::text)))::integer AS recommended_merge_rows,
            (count(*) FILTER (WHERE ((p.proposed_action = p.recommended_action) AND (p.recommended_action = ANY (ARRAY['keep'::text, 'merge_into_winner'::text])))))::integer AS prefilled_action_rows,
            bool_or(((p.recommended_action = 'keep'::text) AND (p.game_id ~ '^(rawg|steam|wiki)_'::text))) AS recommended_winner_is_source_prefixed,
            bool_or(((p.recommended_action = 'merge_into_winner'::text) AND (p.game_id !~ '^(rawg|steam|wiki)_'::text))) AS has_stable_loser,
            COALESCE(array_agg(DISTINCT NULLIF(p.release_year, 0) ORDER BY NULLIF(p.release_year, 0)) FILTER (WHERE (NULLIF(p.release_year, 0) IS NOT NULL)), '{}'::integer[]) AS release_years,
            array_agg(DISTINCT p.source_type ORDER BY p.source_type) AS source_types,
            array_agg(p.game_id ORDER BY p.candidate_rank, p.game_id) AS candidate_game_ids,
            jsonb_agg(jsonb_build_object('game_id', p.game_id, 'title', p.title, 'source_type', p.source_type, 'source_ref', p.source_ref, 'release_year', p.release_year, 'platform_count', p.platform_count, 'tag_count', p.tag_count, 'alias_count', p.alias_count, 'has_cover', p.has_cover, 'has_edition_keyword', p.has_edition_keyword, 'has_stable_catalog_id', p.has_stable_catalog_id, 'candidate_rank', p.candidate_rank, 'proposed_action', p.proposed_action, 'recommended_action', p.recommended_action, 'winner_game_id', p.winner_game_id) ORDER BY p.candidate_rank, p.game_id) AS candidates
           FROM games_library.game_duplicate_review_plan p
          WHERE (p.group_status = 'needs_review'::text)
          GROUP BY p.group_key
        )
 SELECT group_key,
        CASE
            WHEN (group_user_ref_count > 0) THEN 'manual_user_references'::text
            WHEN (group_has_edition_keyword OR (suggested_review = 'preserve_edition_review'::text)) THEN 'preserve_edition_review'::text
            WHEN ((known_year_count > 1) OR (suggested_review = 'manual_year_review'::text)) THEN 'manual_year_review'::text
            WHEN has_stable_loser THEN 'review_stable_id_collision'::text
            WHEN (candidate_count > 2) THEN 'review_multi_candidate_merge'::text
            WHEN recommended_winner_is_source_prefixed THEN 'choose_canonical_id'::text
            WHEN (review_bucket = 'auto_proposable_same_title_year'::text) THEN 'approve_merge_candidate'::text
            ELSE 'manual_review'::text
        END AS review_lane,
        CASE
            WHEN (group_user_ref_count > 0) THEN 10
            WHEN (group_has_edition_keyword OR (suggested_review = 'preserve_edition_review'::text)) THEN 20
            WHEN ((known_year_count > 1) OR (suggested_review = 'manual_year_review'::text)) THEN 30
            WHEN has_stable_loser THEN 40
            WHEN (candidate_count > 2) THEN 50
            WHEN recommended_winner_is_source_prefixed THEN 60
            WHEN (review_bucket = 'auto_proposable_same_title_year'::text) THEN 70
            ELSE 90
        END AS review_priority,
        CASE
            WHEN (group_user_ref_count > 0) THEN 'Review user references before approval; the merge executor can move state, but the identity decision affects saved users.'::text
            WHEN (group_has_edition_keyword OR (suggested_review = 'preserve_edition_review'::text)) THEN 'Preserve by default. Only approve a merge if the rows are proven source duplicates of the same playable edition.'::text
            WHEN ((known_year_count > 1) OR (suggested_review = 'manual_year_review'::text)) THEN 'Different known release years. Compare title, edition, platforms, and source notes before merging.'::text
            WHEN has_stable_loser THEN 'At least one merge candidate has a stable-looking catalog ID. Confirm the winner before approving.'::text
            WHEN (candidate_count > 2) THEN 'More than two rows. Pick exactly one winner and confirm every other row is the same playable entry.'::text
            WHEN recommended_winner_is_source_prefixed THEN 'Recommended winner is source-prefixed. Decide whether to accept that ID or create a stable catalog ID before approving.'::text
            WHEN (review_bucket = 'auto_proposable_same_title_year'::text) THEN 'Ready for human approval; same normalized title/year with no edition or user-reference blockers.'::text
            ELSE 'Manual review required.'::text
        END AS review_instruction,
    candidate_count,
    known_year_count,
    source_type_count,
    group_has_edition_keyword,
    group_user_ref_count,
    suggested_review,
    review_bucket,
    recommended_winner_game_id,
    recommended_winner_title,
    recommended_keep_rows,
    recommended_merge_rows,
    prefilled_action_rows,
    recommended_winner_is_source_prefixed,
    has_stable_loser,
    release_years,
    source_types,
    candidate_game_ids,
    candidates
   FROM group_rows;


--
-- Name: VIEW game_duplicate_manual_review_queue; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON VIEW games_library.game_duplicate_manual_review_queue IS 'One row per remaining duplicate group, with review lane, priority, instructions, and candidate evidence. Non-destructive.';


--
-- Name: COLUMN game_duplicate_manual_review_queue.review_lane; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_duplicate_manual_review_queue.review_lane IS 'Actionable reason this duplicate group still needs human review.';


--
-- Name: COLUMN game_duplicate_manual_review_queue.review_priority; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_duplicate_manual_review_queue.review_priority IS 'Lower numbers should be reviewed first because the decision has higher risk.';


--
-- Name: COLUMN game_duplicate_manual_review_queue.candidates; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_duplicate_manual_review_queue.candidates IS 'Candidate evidence as compact JSON for reviewer tooling or CSV export.';


--
-- Name: game_engines; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_engines (
    pk bigint NOT NULL,
    id text NOT NULL,
    name text NOT NULL,
    igdb_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: game_engines_pk_seq; Type: SEQUENCE; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_engines ALTER COLUMN pk ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library.game_engines_pk_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: game_external_ids; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_external_ids (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id text NOT NULL,
    provider text NOT NULL,
    provider_game_key text NOT NULL,
    source_title text DEFAULT ''::text NOT NULL,
    source_platform_id text,
    confidence_score integer NOT NULL,
    match_candidate_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint NOT NULL,
    CONSTRAINT game_external_ids_confidence_score_check CHECK (((confidence_score >= 0) AND (confidence_score <= 100))),
    CONSTRAINT game_external_ids_provider_check CHECK ((provider = ANY (ARRAY['legacy_game_id'::text, 'igdb'::text, 'wikipedia'::text, 'rawg'::text, 'vgsales'::text, 'metacritic'::text, 'metacritic_review_sentiment'::text, 'steam'::text, 'reddit'::text, 'grouvee'::text])))
);


--
-- Name: game_game_engines; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_game_engines (
    game_ref bigint NOT NULL,
    engine_ref bigint NOT NULL,
    game_id text NOT NULL,
    engine_id text NOT NULL,
    source text DEFAULT 'igdb'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: game_game_modes; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_game_modes (
    game_ref bigint NOT NULL,
    mode_ref bigint NOT NULL,
    game_id text NOT NULL,
    mode_id text NOT NULL,
    source text DEFAULT 'igdb'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: game_genres; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_genres (
    game_ref bigint NOT NULL,
    genre_ref bigint NOT NULL,
    game_id text NOT NULL,
    genre_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE game_genres; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.game_genres IS 'Relacion many-to-many para juegos con mas de un genero real (ej. Card+RPG, Strategy+Adventure). games.genre_id sigue existiendo como genero primario/legacy para compatibilidad; esta tabla es la fuente completa cuando un juego tiene 2+ generos.';


--
-- Name: game_modes; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_modes (
    pk bigint NOT NULL,
    id text NOT NULL,
    name text NOT NULL,
    igdb_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: game_modes_pk_seq; Type: SEQUENCE; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_modes ALTER COLUMN pk ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library.game_modes_pk_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: game_multiplayer_modes; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_multiplayer_modes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_ref bigint NOT NULL,
    game_id text NOT NULL,
    platform_ref bigint,
    platform_id text,
    campaign_coop boolean,
    drop_in boolean,
    lan_coop boolean,
    offline_coop boolean,
    offline_coop_max integer,
    offline_max integer,
    online_coop boolean,
    online_max integer,
    splitscreen boolean,
    source text DEFAULT 'igdb'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: game_perspectives; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_perspectives (
    game_ref bigint NOT NULL,
    perspective_ref bigint NOT NULL,
    game_id text NOT NULL,
    perspective_id text NOT NULL,
    source text DEFAULT 'igdb'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: game_quality_score; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.game_quality_score AS
 WITH critic_ranked AS (
         SELECT game_scores.game_id,
            game_scores.critic_score,
            row_number() OVER (PARTITION BY game_scores.game_id ORDER BY
                CASE game_scores.score_source
                    WHEN 'metacritic'::text THEN 1
                    WHEN 'metacritic_staging'::text THEN 2
                    WHEN 'igdb'::text THEN 3
                    WHEN 'rawg'::text THEN 4
                    WHEN 'vgsales'::text THEN 5
                    WHEN 'metacritic_review_sentiment'::text THEN 6
                    ELSE 7
                END) AS critic_rank
           FROM games_library.game_scores
          WHERE (game_scores.critic_score IS NOT NULL)
        ), user_ranked AS (
         SELECT game_scores.game_id,
            game_scores.user_score,
            row_number() OVER (PARTITION BY game_scores.game_id ORDER BY
                CASE game_scores.score_source
                    WHEN 'rawg'::text THEN 1
                    WHEN 'metacritic'::text THEN 2
                    WHEN 'igdb'::text THEN 3
                    WHEN 'vgsales'::text THEN 4
                    WHEN 'metacritic_staging'::text THEN 5
                    WHEN 'metacritic_review_sentiment'::text THEN 6
                    ELSE 7
                END) AS user_rank
           FROM games_library.game_scores
          WHERE (game_scores.user_score IS NOT NULL)
        )
 SELECT COALESCE(c.game_id, u.game_id) AS game_id,
    c.critic_score,
    u.user_score
   FROM (( SELECT critic_ranked.game_id,
            critic_ranked.critic_score,
            critic_ranked.critic_rank
           FROM critic_ranked
          WHERE (critic_ranked.critic_rank = 1)) c
     FULL JOIN ( SELECT user_ranked.game_id,
            user_ranked.user_score,
            user_ranked.user_rank
           FROM user_ranked
          WHERE (user_ranked.user_rank = 1)) u ON ((u.game_id = c.game_id)));


--
-- Name: game_review_sentiment_snapshots; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_review_sentiment_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id text NOT NULL,
    platform_id text,
    source text DEFAULT 'metacritic'::text NOT NULL,
    source_dataset text DEFAULT 'metacritic_review_sentiment'::text NOT NULL,
    source_key text NOT NULL,
    source_release_date date,
    source_release_year integer,
    metascore integer,
    user_score_100 integer,
    positive_critics integer DEFAULT 0 NOT NULL,
    neutral_critics integer DEFAULT 0 NOT NULL,
    negative_critics integer DEFAULT 0 NOT NULL,
    critic_review_count integer GENERATED ALWAYS AS (((positive_critics + neutral_critics) + negative_critics)) STORED,
    positive_users integer DEFAULT 0 NOT NULL,
    neutral_users integer DEFAULT 0 NOT NULL,
    negative_users integer DEFAULT 0 NOT NULL,
    user_review_count integer GENERATED ALWAYS AS (((positive_users + neutral_users) + negative_users)) STORED,
    developer_text text,
    genre_text text,
    number_players_text text,
    rating_board text,
    rating text,
    match_candidate_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint NOT NULL,
    platform_ref bigint,
    CONSTRAINT game_review_sentiment_snapshots_metascore_check CHECK (((metascore IS NULL) OR ((metascore >= 0) AND (metascore <= 100)))),
    CONSTRAINT game_review_sentiment_snapshots_negative_critics_check CHECK ((negative_critics >= 0)),
    CONSTRAINT game_review_sentiment_snapshots_negative_users_check CHECK ((negative_users >= 0)),
    CONSTRAINT game_review_sentiment_snapshots_neutral_critics_check CHECK ((neutral_critics >= 0)),
    CONSTRAINT game_review_sentiment_snapshots_neutral_users_check CHECK ((neutral_users >= 0)),
    CONSTRAINT game_review_sentiment_snapshots_positive_critics_check CHECK ((positive_critics >= 0)),
    CONSTRAINT game_review_sentiment_snapshots_positive_users_check CHECK ((positive_users >= 0)),
    CONSTRAINT game_review_sentiment_snapshots_source_check CHECK ((source = 'metacritic'::text)),
    CONSTRAINT game_review_sentiment_snapshots_user_score_100_check CHECK (((user_score_100 IS NULL) OR ((user_score_100 >= 0) AND (user_score_100 <= 100))))
);


--
-- Name: TABLE game_review_sentiment_snapshots; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.game_review_sentiment_snapshots IS 'Metacritic critic/user positive-neutral-negative counts and score snapshots from external CSV sources. This table is non-destructive and does not mutate games.';


--
-- Name: game_sales_snapshots; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_sales_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id text NOT NULL,
    platform_id text,
    source text NOT NULL,
    source_key text NOT NULL,
    snapshot_date date NOT NULL,
    na_sales_millions numeric,
    eu_sales_millions numeric,
    jp_sales_millions numeric,
    other_sales_millions numeric,
    global_sales_millions numeric,
    match_candidate_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint NOT NULL,
    platform_ref bigint
);


--
-- Name: game_summaries; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_summaries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id text NOT NULL,
    summary text NOT NULL,
    source text NOT NULL,
    source_key text NOT NULL,
    match_candidate_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint NOT NULL
);


--
-- Name: game_recommendation_enrichment_signals; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.game_recommendation_enrichment_signals WITH (security_invoker='true') AS
 WITH score_agg AS (
         SELECT game_scores.game_id,
            max(game_scores.critic_score) FILTER (WHERE (game_scores.critic_score IS NOT NULL)) AS best_critic_score,
            max(game_scores.user_score) FILTER (WHERE (game_scores.user_score IS NOT NULL)) AS best_user_score,
            (sum(COALESCE(game_scores.critic_count, 0)))::integer AS critic_review_count,
            (sum(COALESCE(game_scores.user_count, 0)))::integer AS user_review_count
           FROM games_library.game_scores
          GROUP BY game_scores.game_id
        ), sentiment_agg AS (
         SELECT game_review_sentiment_snapshots.game_id,
            (sum(game_review_sentiment_snapshots.positive_critics))::integer AS positive_critics,
            (sum(game_review_sentiment_snapshots.neutral_critics))::integer AS neutral_critics,
            (sum(game_review_sentiment_snapshots.negative_critics))::integer AS negative_critics,
            (sum(game_review_sentiment_snapshots.critic_review_count))::integer AS sentiment_critic_reviews,
            (sum(game_review_sentiment_snapshots.positive_users))::integer AS positive_users,
            (sum(game_review_sentiment_snapshots.neutral_users))::integer AS neutral_users,
            (sum(game_review_sentiment_snapshots.negative_users))::integer AS negative_users,
            (sum(game_review_sentiment_snapshots.user_review_count))::integer AS sentiment_user_reviews
           FROM games_library.game_review_sentiment_snapshots
          GROUP BY game_review_sentiment_snapshots.game_id
        ), sales_agg AS (
         SELECT game_sales_snapshots.game_id,
            max(game_sales_snapshots.global_sales_millions) AS max_global_sales_millions,
            sum(game_sales_snapshots.global_sales_millions) AS total_global_sales_millions
           FROM games_library.game_sales_snapshots
          GROUP BY game_sales_snapshots.game_id
        ), coverage AS (
         SELECT g_1.game_id,
            (EXISTS ( SELECT 1
                   FROM games_library.game_external_ids e
                  WHERE (e.game_id = g_1.game_id))) AS has_external_id,
            (EXISTS ( SELECT 1
                   FROM games_library.game_companies c_1
                  WHERE (c_1.game_id = g_1.game_id))) AS has_company,
            (EXISTS ( SELECT 1
                   FROM games_library.game_age_ratings r
                  WHERE (r.game_id = g_1.game_id))) AS has_age_rating,
            (EXISTS ( SELECT 1
                   FROM games_library.game_summaries s
                  WHERE (s.game_id = g_1.game_id))) AS has_summary,
            (EXISTS ( SELECT 1
                   FROM games_library.game_sales_snapshots ss
                  WHERE (ss.game_id = g_1.game_id))) AS has_sales,
            (EXISTS ( SELECT 1
                   FROM games_library.game_review_sentiment_snapshots rs
                  WHERE (rs.game_id = g_1.game_id))) AS has_review_sentiment
           FROM games_library.games g_1
        )
 SELECT g.game_id,
    g.title,
    g.release_year,
    g.genre_id,
    cardinality(g.tags) AS tag_count,
    COALESCE(sa.best_critic_score, NULL::numeric) AS best_critic_score,
    COALESCE(sa.best_user_score, NULL::numeric) AS best_user_score,
    COALESCE(sa.critic_review_count, 0) AS critic_review_count,
    COALESCE(sa.user_review_count, 0) AS user_review_count,
    COALESCE(se.sentiment_critic_reviews, 0) AS sentiment_critic_reviews,
    COALESCE(se.sentiment_user_reviews, 0) AS sentiment_user_reviews,
    round(COALESCE(((se.positive_critics)::numeric / (NULLIF(se.sentiment_critic_reviews, 0))::numeric), NULL::numeric), 4) AS critic_positive_ratio,
    round(COALESCE(((se.positive_users)::numeric / (NULLIF(se.sentiment_user_reviews, 0))::numeric), NULL::numeric), 4) AS user_positive_ratio,
    COALESCE(va.max_global_sales_millions, (0)::numeric) AS max_global_sales_millions,
    COALESCE(va.total_global_sales_millions, (0)::numeric) AS total_global_sales_millions,
    c.has_external_id,
    c.has_company,
    c.has_age_rating,
    c.has_summary,
    c.has_sales,
    c.has_review_sentiment,
    (((((((((
        CASE
            WHEN (cardinality(g.tags) > 0) THEN 20
            ELSE 0
        END +
        CASE
            WHEN (g.genre_id IS NOT NULL) THEN 10
            ELSE 0
        END) +
        CASE
            WHEN (btrim(g.cover_url) <> ''::text) THEN 10
            ELSE 0
        END) +
        CASE
            WHEN c.has_external_id THEN 10
            ELSE 0
        END) +
        CASE
            WHEN c.has_company THEN 10
            ELSE 0
        END) +
        CASE
            WHEN ((sa.best_critic_score IS NOT NULL) OR (sa.best_user_score IS NOT NULL)) THEN 15
            ELSE 0
        END) +
        CASE
            WHEN c.has_age_rating THEN 5
            ELSE 0
        END) +
        CASE
            WHEN c.has_summary THEN 10
            ELSE 0
        END) +
        CASE
            WHEN c.has_sales THEN 5
            ELSE 0
        END) +
        CASE
            WHEN c.has_review_sentiment THEN 5
            ELSE 0
        END) AS data_confidence_score,
    LEAST(8, GREATEST('-8'::integer, (round((((COALESCE(((sa.best_critic_score - (70)::numeric) / 10.0), (0)::numeric) + COALESCE(((sa.best_user_score - (7)::numeric) * 0.8), (0)::numeric)) + COALESCE(((((se.positive_users)::numeric / (NULLIF(se.sentiment_user_reviews, 0))::numeric) - 0.65) * 6.0), (0)::numeric)) + LEAST(2.0, (ln(((1)::numeric + COALESCE(va.total_global_sales_millions, (0)::numeric))) * 0.4)))))::integer)) AS suggested_quality_adjustment
   FROM ((((games_library.games g
     LEFT JOIN score_agg sa ON ((sa.game_id = g.game_id)))
     LEFT JOIN sentiment_agg se ON ((se.game_id = g.game_id)))
     LEFT JOIN sales_agg va ON ((va.game_id = g.game_id)))
     JOIN coverage c ON ((c.game_id = g.game_id)));


--
-- Name: VIEW game_recommendation_enrichment_signals; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON VIEW games_library.game_recommendation_enrichment_signals IS 'Read-only quality/popularity/enrichment signals for recommendation experiments. suggested_quality_adjustment is capped and should not override taste fit.';


--
-- Name: game_redirects; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_redirects (
    from_game_id text NOT NULL,
    to_game_id text NOT NULL,
    reason text DEFAULT 'duplicate_merge'::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    created_by text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT game_redirects_ids_not_blank CHECK (((btrim(from_game_id) <> ''::text) AND (btrim(to_game_id) <> ''::text))),
    CONSTRAINT game_redirects_no_self_redirect CHECK ((from_game_id <> to_game_id)),
    CONSTRAINT game_redirects_reason_check CHECK ((reason = ANY (ARRAY['duplicate_merge'::text, 'manual_id_change'::text, 'source_cleanup'::text, 'catalog_retirement'::text])))
);


--
-- Name: TABLE game_redirects; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.game_redirects IS 'Maps retired game IDs to canonical game IDs after reviewed catalog cleanup.';


--
-- Name: COLUMN game_redirects.from_game_id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_redirects.from_game_id IS 'Retired or non-canonical game ID. No FK by design so redirects survive hard deletes.';


--
-- Name: COLUMN game_redirects.to_game_id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.game_redirects.to_game_id IS 'Canonical live games.game_id target.';


--
-- Name: game_releases; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_releases (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    game_id text NOT NULL,
    platform_id text,
    release_date date,
    release_year integer,
    source text NOT NULL,
    source_key text NOT NULL,
    match_candidate_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint NOT NULL,
    platform_ref bigint
);


--
-- Name: game_scores_preferred; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.game_scores_preferred AS
 SELECT DISTINCT ON (game_id, platform_id) game_id,
    platform_id,
    score_source,
    critic_score,
    critic_count,
    user_score,
    user_count
   FROM games_library.game_scores
  ORDER BY game_id, platform_id,
        CASE score_source
            WHEN 'igdb'::text THEN 1
            WHEN 'metacritic'::text THEN 2
            WHEN 'metacritic_review_sentiment'::text THEN 3
            WHEN 'metacritic_staging'::text THEN 4
            WHEN 'rawg'::text THEN 5
            WHEN 'vgsales'::text THEN 6
            ELSE 7
        END;


--
-- Name: VIEW game_scores_preferred; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON VIEW games_library.game_scores_preferred IS 'Un score por (game_id, platform_id), resolviendo conflictos entre providers. Precedencia: igdb > metacritic > metacritic_review_sentiment > metacritic_staging > rawg > vgsales.';


--
-- Name: game_similar_games; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_similar_games (
    game_ref bigint NOT NULL,
    similar_game_ref bigint NOT NULL,
    game_id text NOT NULL,
    similar_game_id text NOT NULL,
    source text DEFAULT 'igdb'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT game_similar_games_check CHECK ((game_ref <> similar_game_ref))
);


--
-- Name: game_themes; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.game_themes (
    game_ref bigint NOT NULL,
    theme_ref bigint NOT NULL,
    game_id text NOT NULL,
    theme_id text NOT NULL,
    source text DEFAULT 'igdb'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: games_pk_seq; Type: SEQUENCE; Schema: games_library; Owner: -
--

ALTER TABLE games_library.games ALTER COLUMN pk ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library.games_pk_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: genres; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.genres (
    id text NOT NULL,
    name text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pk bigint NOT NULL
);


--
-- Name: TABLE genres; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.genres IS 'Controlled vocabulary of game genres';


--
-- Name: COLUMN genres.id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.genres.id IS 'URL-safe slug, e.g. role_playing_games_rpg';


--
-- Name: COLUMN genres.name; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.genres.name IS 'Display name, e.g. Role-Playing Games (RPG)';


--
-- Name: tags; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.tags (
    id text NOT NULL,
    name text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE tags; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.tags IS 'Controlled vocabulary of gameplay/style tags';


--
-- Name: genre_backfill_review_candidates; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.genre_backfill_review_candidates WITH (security_invoker='true') AS
 WITH candidates AS (
         SELECT g.game_id,
            g.title,
            g.release_year,
            array_agg(DISTINCT t.name ORDER BY t.name) AS matching_tag_names,
            min(ge.id) AS candidate_genre_id,
            min(ge.name) AS candidate_genre_name,
            count(DISTINCT ge.id) AS candidate_genre_count
           FROM (((games_library.games g
             JOIN games_library.game_tags gt ON ((gt.game_id = g.game_id)))
             JOIN games_library.tags t ON ((t.id = gt.tag_id)))
             JOIN games_library.genres ge ON ((lower(ge.name) = lower(t.name))))
          WHERE (g.genre_id IS NULL)
          GROUP BY g.game_id, g.title, g.release_year
        )
 SELECT game_id,
    title,
    release_year,
    matching_tag_names,
    candidate_genre_id,
    candidate_genre_name,
    'review_required_tag_genre_inference'::text AS review_lane,
    'Do not auto-apply: tag-derived genre can be wrong for hybrids. Review title/source metadata first.'::text AS review_instruction
   FROM candidates
  WHERE (candidate_genre_count = 1);


--
-- Name: VIEW genre_backfill_review_candidates; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON VIEW games_library.genre_backfill_review_candidates IS 'Review-only candidates where a missing game genre has exactly one tag matching a genre name. Not auto-applied because tag-derived genre inference can be wrong.';


--
-- Name: genres_pk_seq; Type: SEQUENCE; Schema: games_library; Owner: -
--

ALTER TABLE games_library.genres ALTER COLUMN pk ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library.genres_pk_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: perspectives; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.perspectives (
    pk bigint NOT NULL,
    id text NOT NULL,
    name text NOT NULL,
    igdb_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: perspectives_pk_seq; Type: SEQUENCE; Schema: games_library; Owner: -
--

ALTER TABLE games_library.perspectives ALTER COLUMN pk ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library.perspectives_pk_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: platforms_pk_seq; Type: SEQUENCE; Schema: games_library; Owner: -
--

ALTER TABLE games_library.platforms ALTER COLUMN pk ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library.platforms_pk_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: rate_limits; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.rate_limits (
    id bigint NOT NULL,
    ip_address text NOT NULL,
    endpoint text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    user_id uuid
);


--
-- Name: rate_limits_id_seq; Type: SEQUENCE; Schema: games_library; Owner: -
--

ALTER TABLE games_library.rate_limits ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library.rate_limits_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: review_sentiment_enrichment_summary; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.review_sentiment_enrichment_summary WITH (security_invoker='true') AS
 SELECT source,
    source_dataset,
    count(*) AS snapshot_count,
    count(DISTINCT game_id) AS distinct_games,
    count(DISTINCT platform_id) AS distinct_platforms,
    round(avg(metascore), 2) AS avg_metascore,
    round(avg(user_score_100), 2) AS avg_user_score_100,
    sum(critic_review_count) AS total_critic_reviews,
    sum(user_review_count) AS total_user_reviews
   FROM games_library.game_review_sentiment_snapshots
  GROUP BY source, source_dataset;


--
-- Name: series; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.series (
    id text NOT NULL,
    name text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    pk bigint NOT NULL
);


--
-- Name: TABLE series; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.series IS 'Game series/franchises controlled vocabulary';


--
-- Name: COLUMN series.id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.series.id IS 'URL-safe slug, e.g. the_legend_of_zelda';


--
-- Name: COLUMN series.name; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.series.name IS 'Display name, e.g. The Legend of Zelda';


--
-- Name: series_cleanup_applied; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.series_cleanup_applied (
    game_id text NOT NULL,
    title_snapshot text NOT NULL,
    old_series_id text NOT NULL,
    old_series_name text NOT NULL,
    reason text NOT NULL,
    applied_by text DEFAULT 'migration_20260613235057'::text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    restored_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    game_ref bigint NOT NULL,
    CONSTRAINT series_cleanup_applied_reason_check CHECK ((reason = 'series_name_matches_genre'::text))
);


--
-- Name: TABLE series_cleanup_applied; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.series_cleanup_applied IS 'Rollback ledger for games whose series_id was cleared because the series name matched generic genre vocabulary.';


--
-- Name: COLUMN series_cleanup_applied.old_series_id; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.series_cleanup_applied.old_series_id IS 'Original games.series_id value before cleanup. Use this to restore if needed.';


--
-- Name: series_cleanup_candidates; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.series_cleanup_candidates (
    series_id text NOT NULL,
    series_name text NOT NULL,
    match_kind text NOT NULL,
    matching_genre_ids text[] DEFAULT '{}'::text[] NOT NULL,
    matching_tag_ids text[] DEFAULT '{}'::text[] NOT NULL,
    current_game_count integer DEFAULT 0 NOT NULL,
    sample_game_ids text[] DEFAULT '{}'::text[] NOT NULL,
    sample_titles text[] DEFAULT '{}'::text[] NOT NULL,
    suggested_action text NOT NULL,
    status text NOT NULL,
    applied_game_count integer DEFAULT 0 NOT NULL,
    review_notes text DEFAULT ''::text NOT NULL,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    applied_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    series_ref bigint,
    CONSTRAINT series_cleanup_candidates_applied_game_count_check CHECK ((applied_game_count >= 0)),
    CONSTRAINT series_cleanup_candidates_current_game_count_check CHECK ((current_game_count >= 0)),
    CONSTRAINT series_cleanup_candidates_match_kind_check CHECK ((match_kind = ANY (ARRAY['genre_name'::text, 'tag_name'::text, 'genre_and_tag_name'::text]))),
    CONSTRAINT series_cleanup_candidates_status_check CHECK ((status = ANY (ARRAY['needs_review'::text, 'approved_auto_clear'::text, 'applied'::text, 'ignored'::text, 'restored'::text]))),
    CONSTRAINT series_cleanup_candidates_suggested_action_check CHECK ((suggested_action = ANY (ARRAY['auto_clear_series_id'::text, 'review_keep_or_clear'::text])))
);


--
-- Name: TABLE series_cleanup_candidates; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON TABLE games_library.series_cleanup_candidates IS 'Review and audit queue for series rows that look like generic genre/tag vocabulary rather than franchises.';


--
-- Name: COLUMN series_cleanup_candidates.suggested_action; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON COLUMN games_library.series_cleanup_candidates.suggested_action IS 'Exact genre-name matches are safe to clear automatically; tag-only matches require review because some tags can also be IP/franchise names.';


--
-- Name: series_pk_seq; Type: SEQUENCE; Schema: games_library; Owner: -
--

ALTER TABLE games_library.series ALTER COLUMN pk ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library.series_pk_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tag_quality_profile; Type: VIEW; Schema: games_library; Owner: -
--

CREATE VIEW games_library.tag_quality_profile WITH (security_invoker='true') AS
 WITH catalog AS (
         SELECT (count(*))::numeric AS total_games
           FROM games_library.games
        ), tag_counts AS (
         SELECT t.id AS tag_id,
            t.name,
            (count(gt.game_id))::integer AS game_count
           FROM (games_library.tags t
             LEFT JOIN games_library.game_tags gt ON ((gt.tag_id = t.id)))
          GROUP BY t.id, t.name
        )
 SELECT tag_id,
    name,
    game_count,
    round((((100)::numeric * (game_count)::numeric) / NULLIF(( SELECT catalog.total_games
           FROM catalog), (0)::numeric)), 2) AS catalog_pct,
        CASE
            WHEN (game_count = 0) THEN 'unused_tag'::text
            WHEN (((game_count)::numeric / NULLIF(( SELECT catalog.total_games
               FROM catalog), (0)::numeric)) >= 0.30) THEN 'too_broad_downweight'::text
            WHEN (((game_count)::numeric / NULLIF(( SELECT catalog.total_games
               FROM catalog), (0)::numeric)) >= 0.10) THEN 'broad_review'::text
            WHEN (game_count <= 5) THEN 'too_sparse_review'::text
            ELSE 'usable'::text
        END AS quality_lane,
        CASE
            WHEN (game_count = 0) THEN 0.0
            WHEN (((game_count)::numeric / NULLIF(( SELECT catalog.total_games
               FROM catalog), (0)::numeric)) >= 0.30) THEN 0.25
            WHEN (((game_count)::numeric / NULLIF(( SELECT catalog.total_games
               FROM catalog), (0)::numeric)) >= 0.10) THEN 0.50
            WHEN (game_count <= 5) THEN 0.75
            ELSE 1.00
        END AS suggested_weight_multiplier
   FROM tag_counts;


--
-- Name: VIEW tag_quality_profile; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON VIEW games_library.tag_quality_profile IS 'Tag coverage profile for recommendation weighting. Broad tags like catalog-wide retro labels should be downweighted rather than treated as strong taste signals.';


--
-- Name: tag_weights; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.tag_weights (
    tag_id text NOT NULL,
    weight double precision NOT NULL,
    is_curated boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: themes; Type: TABLE; Schema: games_library; Owner: -
--

CREATE TABLE games_library.themes (
    pk bigint NOT NULL,
    id text NOT NULL,
    name text NOT NULL,
    igdb_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: themes_pk_seq; Type: SEQUENCE; Schema: games_library; Owner: -
--

ALTER TABLE games_library.themes ALTER COLUMN pk ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library.themes_pk_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: duplicate_queue_refresh_runs; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.duplicate_queue_refresh_runs (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_key text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'started'::text NOT NULL,
    groups_upserted integer DEFAULT 0 NOT NULL,
    candidates_upserted integer DEFAULT 0 NOT NULL,
    groups_reactivated integer DEFAULT 0 NOT NULL,
    stale_candidates_deleted integer DEFAULT 0 NOT NULL,
    stale_groups_ignored integer DEFAULT 0 NOT NULL,
    groups_proposed integer DEFAULT 0 NOT NULL,
    keep_rows integer DEFAULT 0 NOT NULL,
    merge_rows integer DEFAULT 0 NOT NULL,
    active_live_group_misses integer DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT duplicate_queue_refresh_runs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: game_duplicate_merge_items; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.game_duplicate_merge_items (
    run_id uuid NOT NULL,
    group_key text NOT NULL,
    loser_game_id text NOT NULL,
    winner_game_id text NOT NULL,
    loser_snapshot jsonb NOT NULL,
    winner_snapshot_before jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE game_duplicate_merge_items; Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON TABLE games_library_private.game_duplicate_merge_items IS 'Per-loser snapshot audit for duplicate merges. Loser IDs are text by design because loser games can be deleted after redirect creation.';


--
-- Name: game_duplicate_merge_runs; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.game_duplicate_merge_runs (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    groups_processed integer DEFAULT 0 NOT NULL,
    games_retired integer DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT game_duplicate_merge_runs_games_retired_check CHECK ((games_retired >= 0)),
    CONSTRAINT game_duplicate_merge_runs_groups_processed_check CHECK ((groups_processed >= 0))
);


--
-- Name: TABLE game_duplicate_merge_runs; Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON TABLE games_library_private.game_duplicate_merge_runs IS 'Private audit record for reviewed duplicate merge executions.';


--
-- Name: game_id_canonicalization_map; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.game_id_canonicalization_map (
    old_game_id text NOT NULL,
    new_game_id text NOT NULL,
    run_id uuid NOT NULL,
    title text NOT NULL,
    release_year integer,
    source_type text DEFAULT ''::text NOT NULL,
    source_ref text DEFAULT ''::text NOT NULL,
    base_game_id text NOT NULL,
    initial_target_game_id text NOT NULL,
    target_rank integer NOT NULL,
    rename_reason text NOT NULL,
    applied_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT game_id_canonicalization_map_check CHECK ((old_game_id <> new_game_id))
);


--
-- Name: TABLE game_id_canonicalization_map; Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON TABLE games_library_private.game_id_canonicalization_map IS 'One row per renamed game_id, preserving the old source-prefixed ID and final Playfit-owned ID.';


--
-- Name: game_id_canonicalization_runs; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.game_id_canonicalization_runs (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_key text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'started'::text NOT NULL,
    profiles_deleted integer DEFAULT 0 NOT NULL,
    user_game_states_deleted integer DEFAULT 0 NOT NULL,
    api_cache_rows_deleted integer DEFAULT 0 NOT NULL,
    games_renamed integer DEFAULT 0 NOT NULL,
    redirects_created integer DEFAULT 0 NOT NULL,
    source_refs_preserved integer DEFAULT 0 NOT NULL,
    legacy_ids_preserved integer DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT game_id_canonicalization_runs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: TABLE game_id_canonicalization_runs; Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON TABLE games_library_private.game_id_canonicalization_runs IS 'Private audit runs for source-prefixed game_id cleanup into Playfit-owned IDs.';


--
-- Name: game_id_diacritic_cleanup_map; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.game_id_diacritic_cleanup_map (
    previous_game_id text NOT NULL,
    new_game_id text NOT NULL,
    run_id uuid NOT NULL,
    title text NOT NULL,
    release_year integer,
    base_game_id text NOT NULL,
    initial_target_game_id text NOT NULL,
    target_rank integer NOT NULL,
    applied_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT game_id_diacritic_cleanup_map_check CHECK ((previous_game_id <> new_game_id))
);


--
-- Name: game_id_diacritic_cleanup_runs; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.game_id_diacritic_cleanup_runs (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_key text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'started'::text NOT NULL,
    games_renamed integer DEFAULT 0 NOT NULL,
    redirects_created integer DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT game_id_diacritic_cleanup_runs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: game_id_slug_cleanup_map; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.game_id_slug_cleanup_map (
    previous_game_id text NOT NULL,
    new_game_id text NOT NULL,
    run_id uuid NOT NULL,
    title text NOT NULL,
    release_year integer,
    clean_slug text NOT NULL,
    applied_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT game_id_slug_cleanup_map_check CHECK ((previous_game_id <> new_game_id))
);


--
-- Name: TABLE game_id_slug_cleanup_map; Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON TABLE games_library_private.game_id_slug_cleanup_map IS 'One row per unambiguous internal game_id slug rename.';


--
-- Name: game_id_slug_cleanup_runs; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.game_id_slug_cleanup_runs (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_key text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'started'::text NOT NULL,
    games_renamed integer DEFAULT 0 NOT NULL,
    redirects_created integer DEFAULT 0 NOT NULL,
    skipped_collision_or_existing_target integer DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT game_id_slug_cleanup_runs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: TABLE game_id_slug_cleanup_runs; Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON TABLE games_library_private.game_id_slug_cleanup_runs IS 'Private audit runs for unambiguous Playfit-owned slug cleanup.';


--
-- Name: game_sales_snapshot_dedupe_audit; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.game_sales_snapshot_dedupe_audit (
    audit_id uuid DEFAULT gen_random_uuid() NOT NULL,
    deleted_snapshot_id uuid NOT NULL,
    kept_snapshot_id uuid NOT NULL,
    game_id text NOT NULL,
    platform_id text,
    source text NOT NULL,
    snapshot_date date NOT NULL,
    deleted_snapshot jsonb NOT NULL,
    kept_snapshot jsonb NOT NULL,
    reason text DEFAULT 'duplicate_business_grain_keep_highest_global_sales'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE game_sales_snapshot_dedupe_audit; Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON TABLE games_library_private.game_sales_snapshot_dedupe_audit IS 'Audit snapshots for deleted duplicate sales rows at game/platform/source/date grain.';


--
-- Name: game_score_scale_normalization_runs; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.game_score_scale_normalization_runs (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_key text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'started'::text NOT NULL,
    rawg_rows_normalized integer DEFAULT 0 NOT NULL,
    invalid_score_rows_after integer DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT game_score_scale_normalization_runs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: post_ingest_duplicate_processing_runs; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.post_ingest_duplicate_processing_runs (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_key text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'started'::text NOT NULL,
    clear_merge_groups integer DEFAULT 0 NOT NULL,
    clear_merge_retirees integer DEFAULT 0 NOT NULL,
    canonical_clean_groups integer DEFAULT 0 NOT NULL,
    canonical_clean_retirees integer DEFAULT 0 NOT NULL,
    manual_safe_groups integer DEFAULT 0 NOT NULL,
    manual_safe_retirees integer DEFAULT 0 NOT NULL,
    groups_approved integer DEFAULT 0 NOT NULL,
    merge_pairs integer DEFAULT 0 NOT NULL,
    redirects_retargeted integer DEFAULT 0 NOT NULL,
    redirect_self_edges_deleted integer DEFAULT 0 NOT NULL,
    audit_winner_refs_retargeted integer DEFAULT 0 NOT NULL,
    groups_merged integer DEFAULT 0 NOT NULL,
    games_retired integer DEFAULT 0 NOT NULL,
    redirects_created integer DEFAULT 0 NOT NULL,
    title_aliases_deleted integer DEFAULT 0 NOT NULL,
    alias_cache_synced integer DEFAULT 0 NOT NULL,
    tag_cache_synced integer DEFAULT 0 NOT NULL,
    remaining_manual_groups integer DEFAULT 0 NOT NULL,
    remaining_manual_rows integer DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT post_ingest_duplicate_processing_runs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: redirect_chain_compression_runs; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.redirect_chain_compression_runs (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_key text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'started'::text NOT NULL,
    update_iterations integer DEFAULT 0 NOT NULL,
    redirects_updated integer DEFAULT 0 NOT NULL,
    self_redirects_deleted integer DEFAULT 0 NOT NULL,
    chains_remaining integer DEFAULT 0 NOT NULL,
    missing_targets_remaining integer DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT redirect_chain_compression_runs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: redundant_alias_cleanup_runs; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.redundant_alias_cleanup_runs (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_key text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'started'::text NOT NULL,
    title_aliases_deleted integer DEFAULT 0 NOT NULL,
    games_alias_cache_synced integer DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT redundant_alias_cleanup_runs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: safe_alias_backfill_runs; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.safe_alias_backfill_runs (
    run_id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_key text NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status text DEFAULT 'started'::text NOT NULL,
    aliases_inserted integer DEFAULT 0 NOT NULL,
    games_alias_cache_synced integer DEFAULT 0 NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    CONSTRAINT safe_alias_backfill_runs_status_check CHECK ((status = ANY (ARRAY['started'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: staging_metacritic_games_archived_20260704; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.staging_metacritic_games_archived_20260704 (
    staging_row_id bigint NOT NULL,
    source_dataset text DEFAULT 'metacritic_games_master'::text NOT NULL,
    source_file text DEFAULT ''::text NOT NULL,
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
    release_year integer,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staging_metacritic_games_staging_row_id_seq; Type: SEQUENCE; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.staging_metacritic_games_archived_20260704 ALTER COLUMN staging_row_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library_private.staging_metacritic_games_staging_row_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: staging_metacritic_review_sentiment_archived_20260704; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.staging_metacritic_review_sentiment_archived_20260704 (
    staging_row_id bigint NOT NULL,
    source_dataset text DEFAULT 'metacritic_review_sentiment'::text NOT NULL,
    source_file text DEFAULT ''::text NOT NULL,
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
    release_year integer,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staging_metacritic_review_sentiment_staging_row_id_seq; Type: SEQUENCE; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.staging_metacritic_review_sentiment_archived_20260704 ALTER COLUMN staging_row_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library_private.staging_metacritic_review_sentiment_staging_row_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: staging_metacritic_reviews_archived_20260704; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.staging_metacritic_reviews_archived_20260704 (
    staging_row_id bigint NOT NULL,
    source_dataset text DEFAULT 'metacritic_reviews_master'::text NOT NULL,
    source_file text DEFAULT ''::text NOT NULL,
    csv_row_index text,
    reviewer_id text,
    game_title text,
    rating_text text,
    review_text text,
    normalized_title_key text,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staging_metacritic_reviews_staging_row_id_seq; Type: SEQUENCE; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.staging_metacritic_reviews_archived_20260704 ALTER COLUMN staging_row_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library_private.staging_metacritic_reviews_staging_row_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: staging_vgsales_archived_20260704; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.staging_vgsales_archived_20260704 (
    staging_row_id bigint NOT NULL,
    source_dataset text DEFAULT 'vgsales_2016'::text NOT NULL,
    source_file text DEFAULT ''::text NOT NULL,
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
    release_year integer,
    imported_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: staging_vgsales_staging_row_id_seq; Type: SEQUENCE; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.staging_vgsales_archived_20260704 ALTER COLUMN staging_row_id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME games_library_private.staging_vgsales_staging_row_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: tmp_gap_missing; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.tmp_gap_missing (
    igdb_id bigint,
    title text,
    total_rating_count integer
);


--
-- Name: tmp_gap_universe; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.tmp_gap_universe (
    igdb_id bigint,
    title text,
    first_release_epoch bigint,
    platforms jsonb,
    genre_ids jsonb,
    involved_company_ids jsonb,
    total_rating_count integer,
    rating numeric,
    aggregated_rating numeric,
    cover_id bigint,
    summary text
);


--
-- Name: tmp_igdb_map; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.tmp_igdb_map (
    igdb_id bigint,
    game_ref bigint
);


--
-- Name: user_data_reset_backups; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.user_data_reset_backups (
    reset_id uuid NOT NULL,
    source_table text NOT NULL,
    row_data jsonb NOT NULL,
    backed_up_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE user_data_reset_backups; Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON TABLE games_library_private.user_data_reset_backups IS 'Private row-level backup captured before user/profile/operational state resets.';


--
-- Name: user_data_reset_runs; Type: TABLE; Schema: games_library_private; Owner: -
--

CREATE TABLE games_library_private.user_data_reset_runs (
    reset_id uuid DEFAULT gen_random_uuid() NOT NULL,
    reset_reason text DEFAULT 'fresh_start_user_state_reset'::text NOT NULL,
    profiles_deleted integer DEFAULT 0 NOT NULL,
    user_game_states_deleted integer DEFAULT 0 NOT NULL,
    rate_limits_deleted integer DEFAULT 0 NOT NULL,
    audit_log_deleted integer DEFAULT 0 NOT NULL,
    api_cache_deleted integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_data_reset_runs_api_cache_deleted_check CHECK ((api_cache_deleted >= 0)),
    CONSTRAINT user_data_reset_runs_audit_log_deleted_check CHECK ((audit_log_deleted >= 0)),
    CONSTRAINT user_data_reset_runs_profiles_deleted_check CHECK ((profiles_deleted >= 0)),
    CONSTRAINT user_data_reset_runs_rate_limits_deleted_check CHECK ((rate_limits_deleted >= 0)),
    CONSTRAINT user_data_reset_runs_user_game_states_deleted_check CHECK ((user_game_states_deleted >= 0))
);


--
-- Name: TABLE user_data_reset_runs; Type: COMMENT; Schema: games_library_private; Owner: -
--

COMMENT ON TABLE games_library_private.user_data_reset_runs IS 'Private audit records for user/profile/operational state resets.';


--
-- Name: endpoint_runs; Type: TABLE; Schema: igdb_raw; Owner: -
--

CREATE TABLE igdb_raw.endpoint_runs (
    run_id uuid NOT NULL,
    endpoint text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    expected_count bigint,
    last_igdb_id bigint DEFAULT '-1'::integer NOT NULL,
    rows_fetched bigint DEFAULT 0 NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    error text,
    CONSTRAINT endpoint_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'failed'::text, 'skipped'::text])))
);


--
-- Name: endpoint_state; Type: TABLE; Schema: igdb_raw; Owner: -
--

CREATE TABLE igdb_raw.endpoint_state (
    endpoint text NOT NULL,
    supports_updated_at boolean,
    active_rows bigint DEFAULT 0 NOT NULL,
    max_source_updated_at bigint,
    last_full_sync_at timestamp with time zone,
    last_incremental_sync_at timestamp with time zone,
    last_successful_run_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: entities; Type: TABLE; Schema: igdb_raw; Owner: -
--

CREATE TABLE igdb_raw.entities (
    endpoint text NOT NULL,
    igdb_id bigint NOT NULL,
    payload jsonb NOT NULL,
    checksum text,
    source_created_at bigint,
    source_updated_at bigint,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_run_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: TABLE entities; Type: COMMENT; Schema: igdb_raw; Owner: -
--

COMMENT ON TABLE igdb_raw.entities IS 'One JSONB row per enumerable IGDB endpoint entity; binary media is not stored.';


--
-- Name: sync_runs; Type: TABLE; Schema: igdb_raw; Owner: -
--

CREATE TABLE igdb_raw.sync_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    mode text NOT NULL,
    status text DEFAULT 'running'::text NOT NULL,
    requested_endpoints text[] NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone,
    rows_fetched bigint DEFAULT 0 NOT NULL,
    errors jsonb DEFAULT '[]'::jsonb NOT NULL,
    CONSTRAINT sync_runs_mode_check CHECK ((mode = ANY (ARRAY['full'::text, 'incremental'::text]))),
    CONSTRAINT sync_runs_status_check CHECK ((status = ANY (ARRAY['running'::text, 'completed'::text, 'completed_with_errors'::text, 'failed'::text])))
);


--
-- Name: api_cache api_cache_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.api_cache
    ADD CONSTRAINT api_cache_pkey PRIMARY KEY (cache_key);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: game_age_ratings game_age_ratings_game_id_platform_id_rating_board_source_so_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_age_ratings
    ADD CONSTRAINT game_age_ratings_game_id_platform_id_rating_board_source_so_key UNIQUE (game_id, platform_id, rating_board, source, source_key);


--
-- Name: game_age_ratings game_age_ratings_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_age_ratings
    ADD CONSTRAINT game_age_ratings_pkey PRIMARY KEY (id);


--
-- Name: game_aliases game_aliases_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_aliases
    ADD CONSTRAINT game_aliases_pkey PRIMARY KEY (game_id, alias);


--
-- Name: game_companies game_companies_game_id_company_name_role_source_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_companies
    ADD CONSTRAINT game_companies_game_id_company_name_role_source_key UNIQUE (game_id, company_name, role, source);


--
-- Name: game_companies game_companies_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_companies
    ADD CONSTRAINT game_companies_pkey PRIMARY KEY (id);


--
-- Name: game_duplicate_candidates game_duplicate_candidates_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_duplicate_candidates
    ADD CONSTRAINT game_duplicate_candidates_pkey PRIMARY KEY (group_key, game_id);


--
-- Name: game_duplicate_groups game_duplicate_groups_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_duplicate_groups
    ADD CONSTRAINT game_duplicate_groups_pkey PRIMARY KEY (group_key);


--
-- Name: game_engines game_engines_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_engines
    ADD CONSTRAINT game_engines_id_key UNIQUE (id);


--
-- Name: game_engines game_engines_igdb_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_engines
    ADD CONSTRAINT game_engines_igdb_id_key UNIQUE (igdb_id);


--
-- Name: game_engines game_engines_name_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_engines
    ADD CONSTRAINT game_engines_name_key UNIQUE (name);


--
-- Name: game_engines game_engines_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_engines
    ADD CONSTRAINT game_engines_pkey PRIMARY KEY (pk);


--
-- Name: game_external_ids game_external_ids_game_id_provider_provider_game_key_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_external_ids
    ADD CONSTRAINT game_external_ids_game_id_provider_provider_game_key_key UNIQUE (game_id, provider, provider_game_key);


--
-- Name: game_external_ids game_external_ids_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_external_ids
    ADD CONSTRAINT game_external_ids_pkey PRIMARY KEY (id);


--
-- Name: game_external_match_candidates game_external_match_candidates_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_external_match_candidates
    ADD CONSTRAINT game_external_match_candidates_pkey PRIMARY KEY (id);


--
-- Name: game_external_match_candidates game_external_match_candidates_source_source_key_game_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_external_match_candidates
    ADD CONSTRAINT game_external_match_candidates_source_source_key_game_id_key UNIQUE (source, source_key, game_id);


--
-- Name: game_game_engines game_game_engines_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_game_engines
    ADD CONSTRAINT game_game_engines_pkey PRIMARY KEY (game_ref, engine_ref);


--
-- Name: game_game_modes game_game_modes_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_game_modes
    ADD CONSTRAINT game_game_modes_pkey PRIMARY KEY (game_ref, mode_ref);


--
-- Name: game_genres game_genres_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_genres
    ADD CONSTRAINT game_genres_pkey PRIMARY KEY (game_ref, genre_ref);


--
-- Name: game_modes game_modes_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_modes
    ADD CONSTRAINT game_modes_id_key UNIQUE (id);


--
-- Name: game_modes game_modes_igdb_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_modes
    ADD CONSTRAINT game_modes_igdb_id_key UNIQUE (igdb_id);


--
-- Name: game_modes game_modes_name_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_modes
    ADD CONSTRAINT game_modes_name_key UNIQUE (name);


--
-- Name: game_modes game_modes_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_modes
    ADD CONSTRAINT game_modes_pkey PRIMARY KEY (pk);


--
-- Name: game_multiplayer_modes game_multiplayer_modes_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_multiplayer_modes
    ADD CONSTRAINT game_multiplayer_modes_pkey PRIMARY KEY (id);


--
-- Name: game_perspectives game_perspectives_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_perspectives
    ADD CONSTRAINT game_perspectives_pkey PRIMARY KEY (game_ref, perspective_ref);


--
-- Name: game_platforms game_platforms_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_platforms
    ADD CONSTRAINT game_platforms_pkey PRIMARY KEY (game_id, platform_id);


--
-- Name: game_redirects game_redirects_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_redirects
    ADD CONSTRAINT game_redirects_pkey PRIMARY KEY (from_game_id);


--
-- Name: game_releases game_releases_game_id_platform_id_source_source_key_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_releases
    ADD CONSTRAINT game_releases_game_id_platform_id_source_source_key_key UNIQUE (game_id, platform_id, source, source_key);


--
-- Name: game_releases game_releases_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_releases
    ADD CONSTRAINT game_releases_pkey PRIMARY KEY (id);


--
-- Name: game_review_sentiment_snapshots game_review_sentiment_snapsho_game_id_platform_id_source_da_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_review_sentiment_snapshots
    ADD CONSTRAINT game_review_sentiment_snapsho_game_id_platform_id_source_da_key UNIQUE (game_id, platform_id, source_dataset, source_key);


--
-- Name: game_review_sentiment_snapshots game_review_sentiment_snapshots_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_review_sentiment_snapshots
    ADD CONSTRAINT game_review_sentiment_snapshots_pkey PRIMARY KEY (id);


--
-- Name: game_sales_snapshots game_sales_snapshots_game_id_platform_id_source_source_key__key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_sales_snapshots
    ADD CONSTRAINT game_sales_snapshots_game_id_platform_id_source_source_key__key UNIQUE (game_id, platform_id, source, source_key, snapshot_date);


--
-- Name: game_sales_snapshots game_sales_snapshots_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_sales_snapshots
    ADD CONSTRAINT game_sales_snapshots_pkey PRIMARY KEY (id);


--
-- Name: game_scores game_scores_game_id_platform_id_score_source_source_key_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_scores
    ADD CONSTRAINT game_scores_game_id_platform_id_score_source_source_key_key UNIQUE (game_id, platform_id, score_source, source_key);


--
-- Name: game_scores game_scores_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_scores
    ADD CONSTRAINT game_scores_pkey PRIMARY KEY (id);


--
-- Name: game_similar_games game_similar_games_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_similar_games
    ADD CONSTRAINT game_similar_games_pkey PRIMARY KEY (game_ref, similar_game_ref);


--
-- Name: game_summaries game_summaries_game_id_source_source_key_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_summaries
    ADD CONSTRAINT game_summaries_game_id_source_source_key_key UNIQUE (game_id, source, source_key);


--
-- Name: game_summaries game_summaries_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_summaries
    ADD CONSTRAINT game_summaries_pkey PRIMARY KEY (id);


--
-- Name: game_tags game_tags_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_tags
    ADD CONSTRAINT game_tags_pkey PRIMARY KEY (game_id, tag_id);


--
-- Name: game_themes game_themes_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_themes
    ADD CONSTRAINT game_themes_pkey PRIMARY KEY (game_ref, theme_ref);


--
-- Name: games games_game_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.games
    ADD CONSTRAINT games_game_id_key UNIQUE (game_id);


--
-- Name: games games_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.games
    ADD CONSTRAINT games_pkey PRIMARY KEY (pk);


--
-- Name: genres genres_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.genres
    ADD CONSTRAINT genres_id_key UNIQUE (id);


--
-- Name: genres genres_name_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.genres
    ADD CONSTRAINT genres_name_key UNIQUE (name);


--
-- Name: genres genres_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.genres
    ADD CONSTRAINT genres_pkey PRIMARY KEY (pk);


--
-- Name: perspectives perspectives_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.perspectives
    ADD CONSTRAINT perspectives_id_key UNIQUE (id);


--
-- Name: perspectives perspectives_igdb_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.perspectives
    ADD CONSTRAINT perspectives_igdb_id_key UNIQUE (igdb_id);


--
-- Name: perspectives perspectives_name_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.perspectives
    ADD CONSTRAINT perspectives_name_key UNIQUE (name);


--
-- Name: perspectives perspectives_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.perspectives
    ADD CONSTRAINT perspectives_pkey PRIMARY KEY (pk);


--
-- Name: platforms platforms_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.platforms
    ADD CONSTRAINT platforms_id_key UNIQUE (id);


--
-- Name: platforms platforms_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.platforms
    ADD CONSTRAINT platforms_pkey PRIMARY KEY (pk);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_user_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.profiles
    ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);


--
-- Name: rate_limits rate_limits_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.rate_limits
    ADD CONSTRAINT rate_limits_pkey PRIMARY KEY (id);


--
-- Name: series_cleanup_applied series_cleanup_applied_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.series_cleanup_applied
    ADD CONSTRAINT series_cleanup_applied_pkey PRIMARY KEY (game_id);


--
-- Name: series_cleanup_candidates series_cleanup_candidates_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.series_cleanup_candidates
    ADD CONSTRAINT series_cleanup_candidates_pkey PRIMARY KEY (series_id);


--
-- Name: series series_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.series
    ADD CONSTRAINT series_id_key UNIQUE (id);


--
-- Name: series series_name_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.series
    ADD CONSTRAINT series_name_key UNIQUE (name);


--
-- Name: series series_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.series
    ADD CONSTRAINT series_pkey PRIMARY KEY (pk);


--
-- Name: tag_weights tag_weights_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.tag_weights
    ADD CONSTRAINT tag_weights_pkey PRIMARY KEY (tag_id);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: themes themes_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.themes
    ADD CONSTRAINT themes_id_key UNIQUE (id);


--
-- Name: themes themes_igdb_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.themes
    ADD CONSTRAINT themes_igdb_id_key UNIQUE (igdb_id);


--
-- Name: themes themes_name_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.themes
    ADD CONSTRAINT themes_name_key UNIQUE (name);


--
-- Name: themes themes_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.themes
    ADD CONSTRAINT themes_pkey PRIMARY KEY (pk);


--
-- Name: user_game_states user_game_states_pkey; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.user_game_states
    ADD CONSTRAINT user_game_states_pkey PRIMARY KEY (id);


--
-- Name: user_game_states user_game_states_user_id_game_id_key; Type: CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.user_game_states
    ADD CONSTRAINT user_game_states_user_id_game_id_key UNIQUE (user_id, game_id);


--
-- Name: duplicate_queue_refresh_runs duplicate_queue_refresh_runs_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.duplicate_queue_refresh_runs
    ADD CONSTRAINT duplicate_queue_refresh_runs_pkey PRIMARY KEY (run_id);


--
-- Name: duplicate_queue_refresh_runs duplicate_queue_refresh_runs_run_key_key; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.duplicate_queue_refresh_runs
    ADD CONSTRAINT duplicate_queue_refresh_runs_run_key_key UNIQUE (run_key);


--
-- Name: game_duplicate_merge_items game_duplicate_merge_items_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_duplicate_merge_items
    ADD CONSTRAINT game_duplicate_merge_items_pkey PRIMARY KEY (run_id, loser_game_id);


--
-- Name: game_duplicate_merge_runs game_duplicate_merge_runs_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_duplicate_merge_runs
    ADD CONSTRAINT game_duplicate_merge_runs_pkey PRIMARY KEY (run_id);


--
-- Name: game_id_canonicalization_map game_id_canonicalization_map_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_id_canonicalization_map
    ADD CONSTRAINT game_id_canonicalization_map_pkey PRIMARY KEY (old_game_id);


--
-- Name: game_id_canonicalization_runs game_id_canonicalization_runs_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_id_canonicalization_runs
    ADD CONSTRAINT game_id_canonicalization_runs_pkey PRIMARY KEY (run_id);


--
-- Name: game_id_canonicalization_runs game_id_canonicalization_runs_run_key_key; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_id_canonicalization_runs
    ADD CONSTRAINT game_id_canonicalization_runs_run_key_key UNIQUE (run_key);


--
-- Name: game_id_diacritic_cleanup_map game_id_diacritic_cleanup_map_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_id_diacritic_cleanup_map
    ADD CONSTRAINT game_id_diacritic_cleanup_map_pkey PRIMARY KEY (previous_game_id);


--
-- Name: game_id_diacritic_cleanup_runs game_id_diacritic_cleanup_runs_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_id_diacritic_cleanup_runs
    ADD CONSTRAINT game_id_diacritic_cleanup_runs_pkey PRIMARY KEY (run_id);


--
-- Name: game_id_diacritic_cleanup_runs game_id_diacritic_cleanup_runs_run_key_key; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_id_diacritic_cleanup_runs
    ADD CONSTRAINT game_id_diacritic_cleanup_runs_run_key_key UNIQUE (run_key);


--
-- Name: game_id_slug_cleanup_map game_id_slug_cleanup_map_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_id_slug_cleanup_map
    ADD CONSTRAINT game_id_slug_cleanup_map_pkey PRIMARY KEY (previous_game_id);


--
-- Name: game_id_slug_cleanup_runs game_id_slug_cleanup_runs_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_id_slug_cleanup_runs
    ADD CONSTRAINT game_id_slug_cleanup_runs_pkey PRIMARY KEY (run_id);


--
-- Name: game_id_slug_cleanup_runs game_id_slug_cleanup_runs_run_key_key; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_id_slug_cleanup_runs
    ADD CONSTRAINT game_id_slug_cleanup_runs_run_key_key UNIQUE (run_key);


--
-- Name: game_sales_snapshot_dedupe_audit game_sales_snapshot_dedupe_audit_deleted_snapshot_id_key; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_sales_snapshot_dedupe_audit
    ADD CONSTRAINT game_sales_snapshot_dedupe_audit_deleted_snapshot_id_key UNIQUE (deleted_snapshot_id);


--
-- Name: game_sales_snapshot_dedupe_audit game_sales_snapshot_dedupe_audit_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_sales_snapshot_dedupe_audit
    ADD CONSTRAINT game_sales_snapshot_dedupe_audit_pkey PRIMARY KEY (audit_id);


--
-- Name: game_score_scale_normalization_runs game_score_scale_normalization_runs_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_score_scale_normalization_runs
    ADD CONSTRAINT game_score_scale_normalization_runs_pkey PRIMARY KEY (run_id);


--
-- Name: game_score_scale_normalization_runs game_score_scale_normalization_runs_run_key_key; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_score_scale_normalization_runs
    ADD CONSTRAINT game_score_scale_normalization_runs_run_key_key UNIQUE (run_key);


--
-- Name: post_ingest_duplicate_processing_runs post_ingest_duplicate_processing_runs_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.post_ingest_duplicate_processing_runs
    ADD CONSTRAINT post_ingest_duplicate_processing_runs_pkey PRIMARY KEY (run_id);


--
-- Name: post_ingest_duplicate_processing_runs post_ingest_duplicate_processing_runs_run_key_key; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.post_ingest_duplicate_processing_runs
    ADD CONSTRAINT post_ingest_duplicate_processing_runs_run_key_key UNIQUE (run_key);


--
-- Name: redirect_chain_compression_runs redirect_chain_compression_runs_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.redirect_chain_compression_runs
    ADD CONSTRAINT redirect_chain_compression_runs_pkey PRIMARY KEY (run_id);


--
-- Name: redirect_chain_compression_runs redirect_chain_compression_runs_run_key_key; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.redirect_chain_compression_runs
    ADD CONSTRAINT redirect_chain_compression_runs_run_key_key UNIQUE (run_key);


--
-- Name: redundant_alias_cleanup_runs redundant_alias_cleanup_runs_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.redundant_alias_cleanup_runs
    ADD CONSTRAINT redundant_alias_cleanup_runs_pkey PRIMARY KEY (run_id);


--
-- Name: redundant_alias_cleanup_runs redundant_alias_cleanup_runs_run_key_key; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.redundant_alias_cleanup_runs
    ADD CONSTRAINT redundant_alias_cleanup_runs_run_key_key UNIQUE (run_key);


--
-- Name: safe_alias_backfill_runs safe_alias_backfill_runs_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.safe_alias_backfill_runs
    ADD CONSTRAINT safe_alias_backfill_runs_pkey PRIMARY KEY (run_id);


--
-- Name: safe_alias_backfill_runs safe_alias_backfill_runs_run_key_key; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.safe_alias_backfill_runs
    ADD CONSTRAINT safe_alias_backfill_runs_run_key_key UNIQUE (run_key);


--
-- Name: staging_metacritic_games_archived_20260704 staging_metacritic_games_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.staging_metacritic_games_archived_20260704
    ADD CONSTRAINT staging_metacritic_games_pkey PRIMARY KEY (staging_row_id);


--
-- Name: staging_metacritic_review_sentiment_archived_20260704 staging_metacritic_review_sentiment_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.staging_metacritic_review_sentiment_archived_20260704
    ADD CONSTRAINT staging_metacritic_review_sentiment_pkey PRIMARY KEY (staging_row_id);


--
-- Name: staging_metacritic_reviews_archived_20260704 staging_metacritic_reviews_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.staging_metacritic_reviews_archived_20260704
    ADD CONSTRAINT staging_metacritic_reviews_pkey PRIMARY KEY (staging_row_id);


--
-- Name: staging_vgsales_archived_20260704 staging_vgsales_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.staging_vgsales_archived_20260704
    ADD CONSTRAINT staging_vgsales_pkey PRIMARY KEY (staging_row_id);


--
-- Name: user_data_reset_runs user_data_reset_runs_pkey; Type: CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.user_data_reset_runs
    ADD CONSTRAINT user_data_reset_runs_pkey PRIMARY KEY (reset_id);


--
-- Name: endpoint_runs endpoint_runs_pkey; Type: CONSTRAINT; Schema: igdb_raw; Owner: -
--

ALTER TABLE ONLY igdb_raw.endpoint_runs
    ADD CONSTRAINT endpoint_runs_pkey PRIMARY KEY (run_id, endpoint);


--
-- Name: endpoint_state endpoint_state_pkey; Type: CONSTRAINT; Schema: igdb_raw; Owner: -
--

ALTER TABLE ONLY igdb_raw.endpoint_state
    ADD CONSTRAINT endpoint_state_pkey PRIMARY KEY (endpoint);


--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: igdb_raw; Owner: -
--

ALTER TABLE ONLY igdb_raw.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (endpoint, igdb_id);


--
-- Name: sync_runs sync_runs_pkey; Type: CONSTRAINT; Schema: igdb_raw; Owner: -
--

ALTER TABLE ONLY igdb_raw.sync_runs
    ADD CONSTRAINT sync_runs_pkey PRIMARY KEY (id);


--
-- Name: api_cache_expires_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX api_cache_expires_idx ON games_library.api_cache USING btree (expires_at);


--
-- Name: audit_log_action_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX audit_log_action_idx ON games_library.audit_log USING btree (action, created_at);


--
-- Name: audit_log_user_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX audit_log_user_idx ON games_library.audit_log USING btree (user_id);


--
-- Name: game_age_ratings_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_age_ratings_game_idx ON games_library.game_age_ratings USING btree (game_id);


--
-- Name: game_age_ratings_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_age_ratings_game_ref_idx ON games_library.game_age_ratings USING btree (game_ref);


--
-- Name: game_age_ratings_match_candidate_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_age_ratings_match_candidate_id_idx ON games_library.game_age_ratings USING btree (match_candidate_id);


--
-- Name: game_age_ratings_platform_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_age_ratings_platform_ref_idx ON games_library.game_age_ratings USING btree (platform_ref);


--
-- Name: game_aliases_alias_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_aliases_alias_idx ON games_library.game_aliases USING btree (alias);


--
-- Name: game_aliases_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_aliases_game_idx ON games_library.game_aliases USING btree (game_id);


--
-- Name: game_aliases_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_aliases_game_ref_idx ON games_library.game_aliases USING btree (game_ref);


--
-- Name: game_companies_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_companies_game_idx ON games_library.game_companies USING btree (game_id);


--
-- Name: game_companies_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_companies_game_ref_idx ON games_library.game_companies USING btree (game_ref);


--
-- Name: game_companies_match_candidate_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_companies_match_candidate_id_idx ON games_library.game_companies USING btree (match_candidate_id);


--
-- Name: game_duplicate_candidates_action_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_duplicate_candidates_action_idx ON games_library.game_duplicate_candidates USING btree (proposed_action, group_key);


--
-- Name: game_duplicate_candidates_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_duplicate_candidates_game_idx ON games_library.game_duplicate_candidates USING btree (game_id);


--
-- Name: game_duplicate_candidates_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_duplicate_candidates_game_ref_idx ON games_library.game_duplicate_candidates USING btree (game_ref);


--
-- Name: game_duplicate_candidates_winner_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_duplicate_candidates_winner_idx ON games_library.game_duplicate_candidates USING btree (winner_game_id) WHERE (winner_game_id IS NOT NULL);


--
-- Name: game_external_ids_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_external_ids_game_idx ON games_library.game_external_ids USING btree (game_id);


--
-- Name: game_external_ids_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_external_ids_game_ref_idx ON games_library.game_external_ids USING btree (game_ref);


--
-- Name: game_external_ids_match_candidate_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_external_ids_match_candidate_id_idx ON games_library.game_external_ids USING btree (match_candidate_id);


--
-- Name: game_external_ids_source_platform_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_external_ids_source_platform_id_idx ON games_library.game_external_ids USING btree (source_platform_id);


--
-- Name: game_external_match_candidates_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_external_match_candidates_game_idx ON games_library.game_external_match_candidates USING btree (game_id);


--
-- Name: game_external_match_candidates_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_external_match_candidates_game_ref_idx ON games_library.game_external_match_candidates USING btree (game_ref);


--
-- Name: game_external_match_candidates_source_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_external_match_candidates_source_idx ON games_library.game_external_match_candidates USING btree (source, source_dataset);


--
-- Name: game_external_match_candidates_source_platform_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_external_match_candidates_source_platform_id_idx ON games_library.game_external_match_candidates USING btree (source_platform_id);


--
-- Name: game_external_match_candidates_status_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_external_match_candidates_status_idx ON games_library.game_external_match_candidates USING btree (status, confidence_score DESC);


--
-- Name: game_game_engines_engine_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_game_engines_engine_ref_idx ON games_library.game_game_engines USING btree (engine_ref);


--
-- Name: game_game_engines_game_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_game_engines_game_id_idx ON games_library.game_game_engines USING btree (game_id);


--
-- Name: game_game_modes_mode_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_game_modes_mode_ref_idx ON games_library.game_game_modes USING btree (mode_ref);


--
-- Name: game_genres_game_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_genres_game_id_idx ON games_library.game_genres USING btree (game_id);


--
-- Name: game_genres_genre_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_genres_genre_ref_idx ON games_library.game_genres USING btree (genre_ref);


--
-- Name: game_multiplayer_modes_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_multiplayer_modes_game_ref_idx ON games_library.game_multiplayer_modes USING btree (game_ref);


--
-- Name: game_multiplayer_modes_platform_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_multiplayer_modes_platform_ref_idx ON games_library.game_multiplayer_modes USING btree (platform_ref);


--
-- Name: game_perspectives_perspective_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_perspectives_perspective_ref_idx ON games_library.game_perspectives USING btree (perspective_ref);


--
-- Name: game_platforms_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_platforms_game_idx ON games_library.game_platforms USING btree (game_id);


--
-- Name: game_platforms_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_platforms_game_ref_idx ON games_library.game_platforms USING btree (game_ref);


--
-- Name: game_platforms_platform_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_platforms_platform_game_idx ON games_library.game_platforms USING btree (platform_id, game_id);


--
-- Name: game_platforms_platform_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_platforms_platform_idx ON games_library.game_platforms USING btree (platform_id);


--
-- Name: game_platforms_platform_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_platforms_platform_ref_idx ON games_library.game_platforms USING btree (platform_ref);


--
-- Name: game_redirects_to_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_redirects_to_game_idx ON games_library.game_redirects USING btree (to_game_id);


--
-- Name: game_releases_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_releases_game_idx ON games_library.game_releases USING btree (game_id);


--
-- Name: game_releases_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_releases_game_ref_idx ON games_library.game_releases USING btree (game_ref);


--
-- Name: game_releases_match_candidate_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_releases_match_candidate_id_idx ON games_library.game_releases USING btree (match_candidate_id);


--
-- Name: game_releases_platform_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_releases_platform_ref_idx ON games_library.game_releases USING btree (platform_ref);


--
-- Name: game_review_sentiment_snapshots_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_review_sentiment_snapshots_game_idx ON games_library.game_review_sentiment_snapshots USING btree (game_id);


--
-- Name: game_review_sentiment_snapshots_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_review_sentiment_snapshots_game_ref_idx ON games_library.game_review_sentiment_snapshots USING btree (game_ref);


--
-- Name: game_review_sentiment_snapshots_match_candidate_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_review_sentiment_snapshots_match_candidate_id_idx ON games_library.game_review_sentiment_snapshots USING btree (match_candidate_id);


--
-- Name: game_review_sentiment_snapshots_platform_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_review_sentiment_snapshots_platform_idx ON games_library.game_review_sentiment_snapshots USING btree (platform_id);


--
-- Name: game_review_sentiment_snapshots_platform_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_review_sentiment_snapshots_platform_ref_idx ON games_library.game_review_sentiment_snapshots USING btree (platform_ref);


--
-- Name: game_review_sentiment_snapshots_reviews_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_review_sentiment_snapshots_reviews_idx ON games_library.game_review_sentiment_snapshots USING btree (critic_review_count DESC, user_review_count DESC);


--
-- Name: game_review_sentiment_snapshots_source_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_review_sentiment_snapshots_source_idx ON games_library.game_review_sentiment_snapshots USING btree (source, source_dataset);


--
-- Name: game_sales_snapshots_business_grain_uidx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE UNIQUE INDEX game_sales_snapshots_business_grain_uidx ON games_library.game_sales_snapshots USING btree (game_id, platform_id, source, snapshot_date) NULLS NOT DISTINCT;


--
-- Name: game_sales_snapshots_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_sales_snapshots_game_idx ON games_library.game_sales_snapshots USING btree (game_id);


--
-- Name: game_sales_snapshots_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_sales_snapshots_game_ref_idx ON games_library.game_sales_snapshots USING btree (game_ref);


--
-- Name: game_sales_snapshots_match_candidate_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_sales_snapshots_match_candidate_id_idx ON games_library.game_sales_snapshots USING btree (match_candidate_id);


--
-- Name: game_sales_snapshots_platform_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_sales_snapshots_platform_ref_idx ON games_library.game_sales_snapshots USING btree (platform_ref);


--
-- Name: game_scores_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_scores_game_idx ON games_library.game_scores USING btree (game_id);


--
-- Name: game_scores_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_scores_game_ref_idx ON games_library.game_scores USING btree (game_ref);


--
-- Name: game_scores_match_candidate_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_scores_match_candidate_id_idx ON games_library.game_scores USING btree (match_candidate_id);


--
-- Name: game_scores_platform_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_scores_platform_ref_idx ON games_library.game_scores USING btree (platform_ref);


--
-- Name: game_similar_games_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_similar_games_game_ref_idx ON games_library.game_similar_games USING btree (game_ref);


--
-- Name: game_similar_games_similar_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_similar_games_similar_game_ref_idx ON games_library.game_similar_games USING btree (similar_game_ref);


--
-- Name: game_summaries_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_summaries_game_idx ON games_library.game_summaries USING btree (game_id);


--
-- Name: game_summaries_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_summaries_game_ref_idx ON games_library.game_summaries USING btree (game_ref);


--
-- Name: game_summaries_match_candidate_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_summaries_match_candidate_id_idx ON games_library.game_summaries USING btree (match_candidate_id);


--
-- Name: game_tags_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_tags_game_idx ON games_library.game_tags USING btree (game_id);


--
-- Name: game_tags_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_tags_game_ref_idx ON games_library.game_tags USING btree (game_ref);


--
-- Name: game_tags_tag_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_tags_tag_idx ON games_library.game_tags USING btree (tag_id);


--
-- Name: game_themes_theme_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX game_themes_theme_ref_idx ON games_library.game_themes USING btree (theme_ref);


--
-- Name: games_genre_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX games_genre_id_idx ON games_library.games USING btree (genre_id);


--
-- Name: games_genre_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX games_genre_ref_idx ON games_library.games USING btree (genre_ref);


--
-- Name: games_release_state_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX games_release_state_idx ON games_library.games USING btree (release_state);


--
-- Name: games_release_year_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX games_release_year_idx ON games_library.games USING btree (release_year);


--
-- Name: games_search_doc_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX games_search_doc_idx ON games_library.games USING gin (search_document);


--
-- Name: games_series_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX games_series_id_idx ON games_library.games USING btree (series_id);


--
-- Name: games_series_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX games_series_ref_idx ON games_library.games USING btree (series_ref);


--
-- Name: games_source_type_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX games_source_type_idx ON games_library.games USING btree (source_type);


--
-- Name: games_tags_gin_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX games_tags_gin_idx ON games_library.games USING gin (tags);


--
-- Name: games_title_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX games_title_idx ON games_library.games USING btree (title);


--
-- Name: platforms_igdb_id_key; Type: INDEX; Schema: games_library; Owner: -
--

CREATE UNIQUE INDEX platforms_igdb_id_key ON games_library.platforms USING btree (igdb_id) WHERE (igdb_id IS NOT NULL);


--
-- Name: profiles_user_id_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX profiles_user_id_idx ON games_library.profiles USING btree (user_id);


--
-- Name: rate_limits_cleanup_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX rate_limits_cleanup_idx ON games_library.rate_limits USING btree (requested_at);


--
-- Name: rate_limits_lookup_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX rate_limits_lookup_idx ON games_library.rate_limits USING btree (ip_address, endpoint, requested_at);


--
-- Name: rate_limits_user_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX rate_limits_user_idx ON games_library.rate_limits USING btree (user_id, endpoint, requested_at);


--
-- Name: series_cleanup_applied_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX series_cleanup_applied_game_ref_idx ON games_library.series_cleanup_applied USING btree (game_ref);


--
-- Name: series_cleanup_applied_old_series_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX series_cleanup_applied_old_series_idx ON games_library.series_cleanup_applied USING btree (old_series_id);


--
-- Name: series_cleanup_candidates_series_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX series_cleanup_candidates_series_ref_idx ON games_library.series_cleanup_candidates USING btree (series_ref);


--
-- Name: series_cleanup_candidates_status_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX series_cleanup_candidates_status_idx ON games_library.series_cleanup_candidates USING btree (status, suggested_action);


--
-- Name: user_game_states_game_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX user_game_states_game_idx ON games_library.user_game_states USING btree (game_id);


--
-- Name: user_game_states_game_ref_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX user_game_states_game_ref_idx ON games_library.user_game_states USING btree (game_ref);


--
-- Name: user_game_states_status_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX user_game_states_status_idx ON games_library.user_game_states USING btree (user_id, status);


--
-- Name: user_game_states_user_idx; Type: INDEX; Schema: games_library; Owner: -
--

CREATE INDEX user_game_states_user_idx ON games_library.user_game_states USING btree (user_id);


--
-- Name: game_duplicate_merge_items_winner_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX game_duplicate_merge_items_winner_idx ON games_library_private.game_duplicate_merge_items USING btree (winner_game_id);


--
-- Name: game_id_canonicalization_map_new_game_id_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX game_id_canonicalization_map_new_game_id_idx ON games_library_private.game_id_canonicalization_map USING btree (new_game_id);


--
-- Name: game_id_canonicalization_map_run_id_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX game_id_canonicalization_map_run_id_idx ON games_library_private.game_id_canonicalization_map USING btree (run_id);


--
-- Name: game_id_diacritic_cleanup_map_new_game_id_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX game_id_diacritic_cleanup_map_new_game_id_idx ON games_library_private.game_id_diacritic_cleanup_map USING btree (new_game_id);


--
-- Name: game_id_diacritic_cleanup_map_run_id_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX game_id_diacritic_cleanup_map_run_id_idx ON games_library_private.game_id_diacritic_cleanup_map USING btree (run_id);


--
-- Name: game_id_slug_cleanup_map_new_game_id_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX game_id_slug_cleanup_map_new_game_id_idx ON games_library_private.game_id_slug_cleanup_map USING btree (new_game_id);


--
-- Name: game_id_slug_cleanup_map_run_id_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX game_id_slug_cleanup_map_run_id_idx ON games_library_private.game_id_slug_cleanup_map USING btree (run_id);


--
-- Name: staging_metacritic_games_platform_year_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX staging_metacritic_games_platform_year_idx ON games_library_private.staging_metacritic_games_archived_20260704 USING btree (normalized_platform_id, release_year);


--
-- Name: staging_metacritic_games_title_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX staging_metacritic_games_title_idx ON games_library_private.staging_metacritic_games_archived_20260704 USING btree (normalized_title_key);


--
-- Name: staging_metacritic_review_sentiment_platform_year_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX staging_metacritic_review_sentiment_platform_year_idx ON games_library_private.staging_metacritic_review_sentiment_archived_20260704 USING btree (normalized_platform_id, release_year);


--
-- Name: staging_metacritic_review_sentiment_title_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX staging_metacritic_review_sentiment_title_idx ON games_library_private.staging_metacritic_review_sentiment_archived_20260704 USING btree (normalized_title_key);


--
-- Name: staging_metacritic_reviews_title_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX staging_metacritic_reviews_title_idx ON games_library_private.staging_metacritic_reviews_archived_20260704 USING btree (normalized_title_key);


--
-- Name: staging_vgsales_platform_year_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX staging_vgsales_platform_year_idx ON games_library_private.staging_vgsales_archived_20260704 USING btree (normalized_platform_id, release_year);


--
-- Name: staging_vgsales_title_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX staging_vgsales_title_idx ON games_library_private.staging_vgsales_archived_20260704 USING btree (normalized_title_key);


--
-- Name: tmp_gap_universe_igdb_id_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX tmp_gap_universe_igdb_id_idx ON games_library_private.tmp_gap_universe USING btree (igdb_id);


--
-- Name: tmp_igdb_map_igdb_id_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX tmp_igdb_map_igdb_id_idx ON games_library_private.tmp_igdb_map USING btree (igdb_id);


--
-- Name: user_data_reset_backups_reset_idx; Type: INDEX; Schema: games_library_private; Owner: -
--

CREATE INDEX user_data_reset_backups_reset_idx ON games_library_private.user_data_reset_backups USING btree (reset_id, source_table);


--
-- Name: igdb_raw_entities_endpoint_updated_idx; Type: INDEX; Schema: igdb_raw; Owner: -
--

CREATE INDEX igdb_raw_entities_endpoint_updated_idx ON igdb_raw.entities USING btree (endpoint, source_updated_at) WHERE (source_updated_at IS NOT NULL);


--
-- Name: igdb_raw_entities_last_run_idx; Type: INDEX; Schema: igdb_raw; Owner: -
--

CREATE INDEX igdb_raw_entities_last_run_idx ON igdb_raw.entities USING btree (last_seen_run_id);


--
-- Name: game_age_ratings game_age_ratings_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_age_ratings_set_updated_at BEFORE UPDATE ON games_library.game_age_ratings FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_aliases game_aliases_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_aliases_set_updated_at BEFORE UPDATE ON games_library.game_aliases FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_aliases game_aliases_sync; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_aliases_sync AFTER INSERT OR DELETE ON games_library.game_aliases FOR EACH ROW EXECUTE FUNCTION games_library.sync_game_aliases();


--
-- Name: game_aliases game_aliases_sync_games; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_aliases_sync_games AFTER INSERT OR DELETE OR UPDATE ON games_library.game_aliases FOR EACH ROW EXECUTE FUNCTION games_library.sync_games_aliases_array();


--
-- Name: game_companies game_companies_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_companies_set_updated_at BEFORE UPDATE ON games_library.game_companies FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_duplicate_candidates game_duplicate_candidates_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_duplicate_candidates_set_updated_at BEFORE UPDATE ON games_library.game_duplicate_candidates FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_duplicate_groups game_duplicate_groups_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_duplicate_groups_set_updated_at BEFORE UPDATE ON games_library.game_duplicate_groups FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_external_ids game_external_ids_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_external_ids_set_updated_at BEFORE UPDATE ON games_library.game_external_ids FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_external_match_candidates game_external_match_candidates_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_external_match_candidates_set_updated_at BEFORE UPDATE ON games_library.game_external_match_candidates FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_platforms game_platforms_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_platforms_set_updated_at BEFORE UPDATE ON games_library.game_platforms FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_platforms game_platforms_sync_games; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_platforms_sync_games AFTER INSERT OR DELETE OR UPDATE ON games_library.game_platforms FOR EACH ROW EXECUTE FUNCTION games_library.sync_games_platforms_array();


--
-- Name: game_redirects game_redirects_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_redirects_set_updated_at BEFORE UPDATE ON games_library.game_redirects FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_releases game_releases_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_releases_set_updated_at BEFORE UPDATE ON games_library.game_releases FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_review_sentiment_snapshots game_review_sentiment_snapshots_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_review_sentiment_snapshots_set_updated_at BEFORE UPDATE ON games_library.game_review_sentiment_snapshots FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_sales_snapshots game_sales_snapshots_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_sales_snapshots_set_updated_at BEFORE UPDATE ON games_library.game_sales_snapshots FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_scores game_scores_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_scores_set_updated_at BEFORE UPDATE ON games_library.game_scores FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_summaries game_summaries_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_summaries_set_updated_at BEFORE UPDATE ON games_library.game_summaries FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_tags game_tags_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_tags_set_updated_at BEFORE UPDATE ON games_library.game_tags FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_tags game_tags_sync; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_tags_sync AFTER INSERT OR DELETE ON games_library.game_tags FOR EACH ROW EXECUTE FUNCTION games_library.sync_game_tags();


--
-- Name: game_tags game_tags_sync_games; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER game_tags_sync_games AFTER INSERT OR DELETE OR UPDATE ON games_library.game_tags FOR EACH ROW EXECUTE FUNCTION games_library.sync_games_tags_array();


--
-- Name: games games_aliases_array_sync; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER games_aliases_array_sync AFTER INSERT OR UPDATE OF aliases ON games_library.games FOR EACH ROW EXECUTE FUNCTION games_library.sync_game_aliases_from_array();


--
-- Name: games games_platforms_array_sync; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER games_platforms_array_sync AFTER INSERT OR UPDATE OF platforms ON games_library.games FOR EACH ROW EXECUTE FUNCTION games_library.sync_game_platforms_from_array();


--
-- Name: games games_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER games_set_updated_at BEFORE UPDATE ON games_library.games FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: games games_tags_array_sync; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER games_tags_array_sync AFTER INSERT OR UPDATE OF tags ON games_library.games FOR EACH ROW EXECUTE FUNCTION games_library.sync_game_tags_from_array();


--
-- Name: genres genres_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER genres_set_updated_at BEFORE UPDATE ON games_library.genres FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: platforms platforms_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER platforms_set_updated_at BEFORE UPDATE ON games_library.platforms FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: profiles profiles_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON games_library.profiles FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: series_cleanup_applied series_cleanup_applied_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER series_cleanup_applied_set_updated_at BEFORE UPDATE ON games_library.series_cleanup_applied FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: series_cleanup_candidates series_cleanup_candidates_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER series_cleanup_candidates_set_updated_at BEFORE UPDATE ON games_library.series_cleanup_candidates FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: series series_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER series_set_updated_at BEFORE UPDATE ON games_library.series FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: user_game_states sync_profile_game_states_trigger; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER sync_profile_game_states_trigger AFTER INSERT OR DELETE OR UPDATE ON games_library.user_game_states FOR EACH ROW EXECUTE FUNCTION games_library.sync_profile_game_states();


--
-- Name: tags tags_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER tags_set_updated_at BEFORE UPDATE ON games_library.tags FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: user_game_states user_game_states_set_updated_at; Type: TRIGGER; Schema: games_library; Owner: -
--

CREATE TRIGGER user_game_states_set_updated_at BEFORE UPDATE ON games_library.user_game_states FOR EACH ROW EXECUTE FUNCTION games_library.set_updated_at();


--
-- Name: game_age_ratings game_age_ratings_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_age_ratings
    ADD CONSTRAINT game_age_ratings_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_age_ratings game_age_ratings_match_candidate_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_age_ratings
    ADD CONSTRAINT game_age_ratings_match_candidate_id_fkey FOREIGN KEY (match_candidate_id) REFERENCES games_library.game_external_match_candidates(id) ON DELETE SET NULL;


--
-- Name: game_age_ratings game_age_ratings_platform_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_age_ratings
    ADD CONSTRAINT game_age_ratings_platform_ref_fkey FOREIGN KEY (platform_ref) REFERENCES games_library.platforms(pk) ON DELETE SET NULL;


--
-- Name: game_aliases game_aliases_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_aliases
    ADD CONSTRAINT game_aliases_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_companies game_companies_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_companies
    ADD CONSTRAINT game_companies_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_companies game_companies_match_candidate_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_companies
    ADD CONSTRAINT game_companies_match_candidate_id_fkey FOREIGN KEY (match_candidate_id) REFERENCES games_library.game_external_match_candidates(id) ON DELETE SET NULL;


--
-- Name: game_duplicate_candidates game_duplicate_candidates_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_duplicate_candidates
    ADD CONSTRAINT game_duplicate_candidates_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE RESTRICT;


--
-- Name: game_duplicate_candidates game_duplicate_candidates_group_key_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_duplicate_candidates
    ADD CONSTRAINT game_duplicate_candidates_group_key_fkey FOREIGN KEY (group_key) REFERENCES games_library.game_duplicate_groups(group_key) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: game_duplicate_candidates game_duplicate_candidates_winner_game_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_duplicate_candidates
    ADD CONSTRAINT game_duplicate_candidates_winner_game_id_fkey FOREIGN KEY (winner_game_id) REFERENCES games_library.games(game_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: game_external_ids game_external_ids_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_external_ids
    ADD CONSTRAINT game_external_ids_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_external_ids game_external_ids_match_candidate_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_external_ids
    ADD CONSTRAINT game_external_ids_match_candidate_id_fkey FOREIGN KEY (match_candidate_id) REFERENCES games_library.game_external_match_candidates(id) ON DELETE SET NULL;


--
-- Name: game_external_ids game_external_ids_source_platform_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_external_ids
    ADD CONSTRAINT game_external_ids_source_platform_id_fkey FOREIGN KEY (source_platform_id) REFERENCES games_library.platforms(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: game_external_match_candidates game_external_match_candidates_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_external_match_candidates
    ADD CONSTRAINT game_external_match_candidates_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE RESTRICT;


--
-- Name: game_external_match_candidates game_external_match_candidates_source_platform_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_external_match_candidates
    ADD CONSTRAINT game_external_match_candidates_source_platform_id_fkey FOREIGN KEY (source_platform_id) REFERENCES games_library.platforms(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: game_game_engines game_game_engines_engine_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_game_engines
    ADD CONSTRAINT game_game_engines_engine_ref_fkey FOREIGN KEY (engine_ref) REFERENCES games_library.game_engines(pk) ON DELETE CASCADE;


--
-- Name: game_game_engines game_game_engines_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_game_engines
    ADD CONSTRAINT game_game_engines_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_game_modes game_game_modes_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_game_modes
    ADD CONSTRAINT game_game_modes_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_game_modes game_game_modes_mode_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_game_modes
    ADD CONSTRAINT game_game_modes_mode_ref_fkey FOREIGN KEY (mode_ref) REFERENCES games_library.game_modes(pk) ON DELETE CASCADE;


--
-- Name: game_genres game_genres_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_genres
    ADD CONSTRAINT game_genres_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_genres game_genres_genre_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_genres
    ADD CONSTRAINT game_genres_genre_ref_fkey FOREIGN KEY (genre_ref) REFERENCES games_library.genres(pk) ON DELETE CASCADE;


--
-- Name: game_multiplayer_modes game_multiplayer_modes_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_multiplayer_modes
    ADD CONSTRAINT game_multiplayer_modes_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_multiplayer_modes game_multiplayer_modes_platform_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_multiplayer_modes
    ADD CONSTRAINT game_multiplayer_modes_platform_ref_fkey FOREIGN KEY (platform_ref) REFERENCES games_library.platforms(pk) ON DELETE SET NULL;


--
-- Name: game_perspectives game_perspectives_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_perspectives
    ADD CONSTRAINT game_perspectives_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_perspectives game_perspectives_perspective_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_perspectives
    ADD CONSTRAINT game_perspectives_perspective_ref_fkey FOREIGN KEY (perspective_ref) REFERENCES games_library.perspectives(pk) ON DELETE CASCADE;


--
-- Name: game_platforms game_platforms_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_platforms
    ADD CONSTRAINT game_platforms_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_platforms game_platforms_platform_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_platforms
    ADD CONSTRAINT game_platforms_platform_ref_fkey FOREIGN KEY (platform_ref) REFERENCES games_library.platforms(pk) ON DELETE CASCADE;


--
-- Name: game_redirects game_redirects_to_game_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_redirects
    ADD CONSTRAINT game_redirects_to_game_id_fkey FOREIGN KEY (to_game_id) REFERENCES games_library.games(game_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: game_releases game_releases_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_releases
    ADD CONSTRAINT game_releases_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_releases game_releases_match_candidate_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_releases
    ADD CONSTRAINT game_releases_match_candidate_id_fkey FOREIGN KEY (match_candidate_id) REFERENCES games_library.game_external_match_candidates(id) ON DELETE SET NULL;


--
-- Name: game_releases game_releases_platform_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_releases
    ADD CONSTRAINT game_releases_platform_ref_fkey FOREIGN KEY (platform_ref) REFERENCES games_library.platforms(pk) ON DELETE SET NULL;


--
-- Name: game_review_sentiment_snapshots game_review_sentiment_snapshots_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_review_sentiment_snapshots
    ADD CONSTRAINT game_review_sentiment_snapshots_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_review_sentiment_snapshots game_review_sentiment_snapshots_match_candidate_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_review_sentiment_snapshots
    ADD CONSTRAINT game_review_sentiment_snapshots_match_candidate_id_fkey FOREIGN KEY (match_candidate_id) REFERENCES games_library.game_external_match_candidates(id) ON DELETE SET NULL;


--
-- Name: game_review_sentiment_snapshots game_review_sentiment_snapshots_platform_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_review_sentiment_snapshots
    ADD CONSTRAINT game_review_sentiment_snapshots_platform_ref_fkey FOREIGN KEY (platform_ref) REFERENCES games_library.platforms(pk) ON DELETE SET NULL;


--
-- Name: game_sales_snapshots game_sales_snapshots_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_sales_snapshots
    ADD CONSTRAINT game_sales_snapshots_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_sales_snapshots game_sales_snapshots_match_candidate_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_sales_snapshots
    ADD CONSTRAINT game_sales_snapshots_match_candidate_id_fkey FOREIGN KEY (match_candidate_id) REFERENCES games_library.game_external_match_candidates(id) ON DELETE SET NULL;


--
-- Name: game_sales_snapshots game_sales_snapshots_platform_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_sales_snapshots
    ADD CONSTRAINT game_sales_snapshots_platform_ref_fkey FOREIGN KEY (platform_ref) REFERENCES games_library.platforms(pk) ON DELETE SET NULL;


--
-- Name: game_scores game_scores_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_scores
    ADD CONSTRAINT game_scores_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_scores game_scores_match_candidate_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_scores
    ADD CONSTRAINT game_scores_match_candidate_id_fkey FOREIGN KEY (match_candidate_id) REFERENCES games_library.game_external_match_candidates(id) ON DELETE SET NULL;


--
-- Name: game_scores game_scores_platform_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_scores
    ADD CONSTRAINT game_scores_platform_ref_fkey FOREIGN KEY (platform_ref) REFERENCES games_library.platforms(pk) ON DELETE SET NULL;


--
-- Name: game_similar_games game_similar_games_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_similar_games
    ADD CONSTRAINT game_similar_games_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_similar_games game_similar_games_similar_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_similar_games
    ADD CONSTRAINT game_similar_games_similar_game_ref_fkey FOREIGN KEY (similar_game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_summaries game_summaries_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_summaries
    ADD CONSTRAINT game_summaries_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_summaries game_summaries_match_candidate_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_summaries
    ADD CONSTRAINT game_summaries_match_candidate_id_fkey FOREIGN KEY (match_candidate_id) REFERENCES games_library.game_external_match_candidates(id) ON DELETE SET NULL;


--
-- Name: game_tags game_tags_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_tags
    ADD CONSTRAINT game_tags_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_tags game_tags_tag_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_tags
    ADD CONSTRAINT game_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES games_library.tags(id);


--
-- Name: game_themes game_themes_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_themes
    ADD CONSTRAINT game_themes_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: game_themes game_themes_theme_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.game_themes
    ADD CONSTRAINT game_themes_theme_ref_fkey FOREIGN KEY (theme_ref) REFERENCES games_library.themes(pk) ON DELETE CASCADE;


--
-- Name: games games_genre_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.games
    ADD CONSTRAINT games_genre_ref_fkey FOREIGN KEY (genre_ref) REFERENCES games_library.genres(pk);


--
-- Name: games games_series_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.games
    ADD CONSTRAINT games_series_ref_fkey FOREIGN KEY (series_ref) REFERENCES games_library.series(pk);


--
-- Name: series_cleanup_applied series_cleanup_applied_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.series_cleanup_applied
    ADD CONSTRAINT series_cleanup_applied_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE RESTRICT;


--
-- Name: series_cleanup_applied series_cleanup_applied_old_series_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.series_cleanup_applied
    ADD CONSTRAINT series_cleanup_applied_old_series_id_fkey FOREIGN KEY (old_series_id) REFERENCES games_library.series(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: series_cleanup_candidates series_cleanup_candidates_series_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.series_cleanup_candidates
    ADD CONSTRAINT series_cleanup_candidates_series_id_fkey FOREIGN KEY (series_id) REFERENCES games_library.series(id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: series_cleanup_candidates series_cleanup_candidates_series_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.series_cleanup_candidates
    ADD CONSTRAINT series_cleanup_candidates_series_ref_fkey FOREIGN KEY (series_ref) REFERENCES games_library.series(pk);


--
-- Name: tag_weights tag_weights_tag_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.tag_weights
    ADD CONSTRAINT tag_weights_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES games_library.tags(id) ON DELETE CASCADE;


--
-- Name: user_game_states user_game_states_game_ref_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.user_game_states
    ADD CONSTRAINT user_game_states_game_ref_fkey FOREIGN KEY (game_ref) REFERENCES games_library.games(pk) ON DELETE CASCADE;


--
-- Name: user_game_states user_game_states_user_id_fkey; Type: FK CONSTRAINT; Schema: games_library; Owner: -
--

ALTER TABLE ONLY games_library.user_game_states
    ADD CONSTRAINT user_game_states_user_id_fkey FOREIGN KEY (user_id) REFERENCES games_library.profiles(user_id) ON DELETE CASCADE;


--
-- Name: game_duplicate_merge_items game_duplicate_merge_items_run_id_fkey; Type: FK CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_duplicate_merge_items
    ADD CONSTRAINT game_duplicate_merge_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES games_library_private.game_duplicate_merge_runs(run_id) ON DELETE CASCADE;


--
-- Name: game_duplicate_merge_items game_duplicate_merge_items_winner_game_id_fkey; Type: FK CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_duplicate_merge_items
    ADD CONSTRAINT game_duplicate_merge_items_winner_game_id_fkey FOREIGN KEY (winner_game_id) REFERENCES games_library.games(game_id) ON UPDATE CASCADE ON DELETE RESTRICT;


--
-- Name: game_id_canonicalization_map game_id_canonicalization_map_run_id_fkey; Type: FK CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_id_canonicalization_map
    ADD CONSTRAINT game_id_canonicalization_map_run_id_fkey FOREIGN KEY (run_id) REFERENCES games_library_private.game_id_canonicalization_runs(run_id) ON DELETE RESTRICT;


--
-- Name: game_id_diacritic_cleanup_map game_id_diacritic_cleanup_map_run_id_fkey; Type: FK CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_id_diacritic_cleanup_map
    ADD CONSTRAINT game_id_diacritic_cleanup_map_run_id_fkey FOREIGN KEY (run_id) REFERENCES games_library_private.game_id_diacritic_cleanup_runs(run_id) ON DELETE RESTRICT;


--
-- Name: game_id_slug_cleanup_map game_id_slug_cleanup_map_run_id_fkey; Type: FK CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.game_id_slug_cleanup_map
    ADD CONSTRAINT game_id_slug_cleanup_map_run_id_fkey FOREIGN KEY (run_id) REFERENCES games_library_private.game_id_slug_cleanup_runs(run_id) ON DELETE RESTRICT;


--
-- Name: user_data_reset_backups user_data_reset_backups_reset_id_fkey; Type: FK CONSTRAINT; Schema: games_library_private; Owner: -
--

ALTER TABLE ONLY games_library_private.user_data_reset_backups
    ADD CONSTRAINT user_data_reset_backups_reset_id_fkey FOREIGN KEY (reset_id) REFERENCES games_library_private.user_data_reset_runs(reset_id) ON DELETE CASCADE;


--
-- Name: endpoint_runs endpoint_runs_run_id_fkey; Type: FK CONSTRAINT; Schema: igdb_raw; Owner: -
--

ALTER TABLE ONLY igdb_raw.endpoint_runs
    ADD CONSTRAINT endpoint_runs_run_id_fkey FOREIGN KEY (run_id) REFERENCES igdb_raw.sync_runs(id) ON DELETE CASCADE;


--
-- Name: endpoint_state endpoint_state_last_successful_run_id_fkey; Type: FK CONSTRAINT; Schema: igdb_raw; Owner: -
--

ALTER TABLE ONLY igdb_raw.endpoint_state
    ADD CONSTRAINT endpoint_state_last_successful_run_id_fkey FOREIGN KEY (last_successful_run_id) REFERENCES igdb_raw.sync_runs(id);


--
-- Name: entities entities_last_seen_run_id_fkey; Type: FK CONSTRAINT; Schema: igdb_raw; Owner: -
--

ALTER TABLE ONLY igdb_raw.entities
    ADD CONSTRAINT entities_last_seen_run_id_fkey FOREIGN KEY (last_seen_run_id) REFERENCES igdb_raw.sync_runs(id);


--
-- Name: audit_log; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: game_age_ratings; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_age_ratings ENABLE ROW LEVEL SECURITY;

--
-- Name: game_aliases; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_aliases ENABLE ROW LEVEL SECURITY;

--
-- Name: game_companies; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_companies ENABLE ROW LEVEL SECURITY;

--
-- Name: game_duplicate_candidates; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_duplicate_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: game_duplicate_groups; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_duplicate_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: game_engines; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_engines ENABLE ROW LEVEL SECURITY;

--
-- Name: game_external_ids; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_external_ids ENABLE ROW LEVEL SECURITY;

--
-- Name: game_external_match_candidates; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_external_match_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: game_game_engines; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_game_engines ENABLE ROW LEVEL SECURITY;

--
-- Name: game_game_modes; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_game_modes ENABLE ROW LEVEL SECURITY;

--
-- Name: game_genres; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_genres ENABLE ROW LEVEL SECURITY;

--
-- Name: game_modes; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_modes ENABLE ROW LEVEL SECURITY;

--
-- Name: game_multiplayer_modes; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_multiplayer_modes ENABLE ROW LEVEL SECURITY;

--
-- Name: game_perspectives; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_perspectives ENABLE ROW LEVEL SECURITY;

--
-- Name: game_platforms; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_platforms ENABLE ROW LEVEL SECURITY;

--
-- Name: game_redirects; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_redirects ENABLE ROW LEVEL SECURITY;

--
-- Name: game_releases; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_releases ENABLE ROW LEVEL SECURITY;

--
-- Name: game_review_sentiment_snapshots; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_review_sentiment_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: game_sales_snapshots; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_sales_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: game_scores; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: game_similar_games; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_similar_games ENABLE ROW LEVEL SECURITY;

--
-- Name: game_summaries; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_summaries ENABLE ROW LEVEL SECURITY;

--
-- Name: game_tags; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_tags ENABLE ROW LEVEL SECURITY;

--
-- Name: game_themes; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.game_themes ENABLE ROW LEVEL SECURITY;

--
-- Name: games; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.games ENABLE ROW LEVEL SECURITY;

--
-- Name: genres; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.genres ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_log insert_audit_log; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY insert_audit_log ON games_library.audit_log FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: profiles insert_own_profile; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY insert_own_profile ON games_library.profiles FOR INSERT TO authenticated WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_game_states own_game_states; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY own_game_states ON games_library.user_game_states TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: perspectives; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.perspectives ENABLE ROW LEVEL SECURITY;

--
-- Name: platforms; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.platforms ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: game_engines public read game_engines; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY "public read game_engines" ON games_library.game_engines FOR SELECT USING (true);


--
-- Name: game_game_engines public read game_game_engines; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY "public read game_game_engines" ON games_library.game_game_engines FOR SELECT USING (true);


--
-- Name: game_game_modes public read game_game_modes; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY "public read game_game_modes" ON games_library.game_game_modes FOR SELECT USING (true);


--
-- Name: game_modes public read game_modes; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY "public read game_modes" ON games_library.game_modes FOR SELECT USING (true);


--
-- Name: game_multiplayer_modes public read game_multiplayer_modes; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY "public read game_multiplayer_modes" ON games_library.game_multiplayer_modes FOR SELECT USING (true);


--
-- Name: game_perspectives public read game_perspectives; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY "public read game_perspectives" ON games_library.game_perspectives FOR SELECT USING (true);


--
-- Name: game_similar_games public read game_similar_games; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY "public read game_similar_games" ON games_library.game_similar_games FOR SELECT USING (true);


--
-- Name: game_themes public read game_themes; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY "public read game_themes" ON games_library.game_themes FOR SELECT USING (true);


--
-- Name: perspectives public read perspectives; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY "public read perspectives" ON games_library.perspectives FOR SELECT USING (true);


--
-- Name: themes public read themes; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY "public read themes" ON games_library.themes FOR SELECT USING (true);


--
-- Name: game_redirects public_read_game_redirect_lookup; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY public_read_game_redirect_lookup ON games_library.game_redirects FOR SELECT TO authenticated, anon USING (true);


--
-- Name: POLICY public_read_game_redirect_lookup ON game_redirects; Type: COMMENT; Schema: games_library; Owner: -
--

COMMENT ON POLICY public_read_game_redirect_lookup ON games_library.game_redirects IS 'Allows public catalog routes to resolve retired game IDs while hiding review notes and write access.';


--
-- Name: tag_weights public_read_tag_weights; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY public_read_tag_weights ON games_library.tag_weights FOR SELECT TO authenticated, anon USING (true);


--
-- Name: rate_limits; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.rate_limits ENABLE ROW LEVEL SECURITY;

--
-- Name: game_aliases select_all; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY select_all ON games_library.game_aliases FOR SELECT TO authenticated, anon USING (true);


--
-- Name: game_genres select_all; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY select_all ON games_library.game_genres FOR SELECT TO authenticated, anon USING (true);


--
-- Name: game_platforms select_all; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY select_all ON games_library.game_platforms FOR SELECT TO authenticated, anon USING (true);


--
-- Name: game_tags select_all; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY select_all ON games_library.game_tags FOR SELECT TO authenticated, anon USING (true);


--
-- Name: genres select_all; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY select_all ON games_library.genres FOR SELECT TO authenticated, anon USING (true);


--
-- Name: series select_all; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY select_all ON games_library.series FOR SELECT TO authenticated, anon USING (true);


--
-- Name: tags select_all; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY select_all ON games_library.tags FOR SELECT TO authenticated, anon USING (true);


--
-- Name: audit_log select_audit_log; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY select_audit_log ON games_library.audit_log FOR SELECT TO service_role USING (true);


--
-- Name: games select_games; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY select_games ON games_library.games FOR SELECT TO authenticated, anon USING (true);


--
-- Name: profiles select_own_profile; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY select_own_profile ON games_library.profiles FOR SELECT TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: platforms select_platforms; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY select_platforms ON games_library.platforms FOR SELECT TO authenticated, anon USING (true);


--
-- Name: rate_limits select_rate_limit; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY select_rate_limit ON games_library.rate_limits FOR SELECT TO service_role USING (true);


--
-- Name: series; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.series ENABLE ROW LEVEL SECURITY;

--
-- Name: series_cleanup_applied; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.series_cleanup_applied ENABLE ROW LEVEL SECURITY;

--
-- Name: series_cleanup_candidates; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.series_cleanup_candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: game_age_ratings service_role_manage_game_age_ratings; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_age_ratings ON games_library.game_age_ratings TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_aliases service_role_manage_game_aliases; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_aliases ON games_library.game_aliases TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_companies service_role_manage_game_companies; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_companies ON games_library.game_companies TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_duplicate_candidates service_role_manage_game_duplicate_candidates; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_duplicate_candidates ON games_library.game_duplicate_candidates TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_duplicate_groups service_role_manage_game_duplicate_groups; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_duplicate_groups ON games_library.game_duplicate_groups TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_external_ids service_role_manage_game_external_ids; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_external_ids ON games_library.game_external_ids TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_external_match_candidates service_role_manage_game_external_match_candidates; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_external_match_candidates ON games_library.game_external_match_candidates TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_genres service_role_manage_game_genres; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_genres ON games_library.game_genres TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_platforms service_role_manage_game_platforms; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_platforms ON games_library.game_platforms TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_redirects service_role_manage_game_redirects; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_redirects ON games_library.game_redirects TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_releases service_role_manage_game_releases; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_releases ON games_library.game_releases TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_review_sentiment_snapshots service_role_manage_game_review_sentiment_snapshots; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_review_sentiment_snapshots ON games_library.game_review_sentiment_snapshots TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_sales_snapshots service_role_manage_game_sales_snapshots; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_sales_snapshots ON games_library.game_sales_snapshots TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_scores service_role_manage_game_scores; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_scores ON games_library.game_scores TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_summaries service_role_manage_game_summaries; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_summaries ON games_library.game_summaries TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_tags service_role_manage_game_tags; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_game_tags ON games_library.game_tags TO service_role USING (true) WITH CHECK (true);


--
-- Name: games service_role_manage_games; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_games ON games_library.games TO service_role USING (true) WITH CHECK (true);


--
-- Name: genres service_role_manage_genres; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_genres ON games_library.genres TO service_role USING (true) WITH CHECK (true);


--
-- Name: series_cleanup_applied service_role_manage_series_cleanup_applied; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_series_cleanup_applied ON games_library.series_cleanup_applied TO service_role USING (true) WITH CHECK (true);


--
-- Name: series_cleanup_candidates service_role_manage_series_cleanup_candidates; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_series_cleanup_candidates ON games_library.series_cleanup_candidates TO service_role USING (true) WITH CHECK (true);


--
-- Name: tags service_role_manage_tags; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY service_role_manage_tags ON games_library.tags TO service_role USING (true) WITH CHECK (true);


--
-- Name: tag_weights; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.tag_weights ENABLE ROW LEVEL SECURITY;

--
-- Name: tags; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.tags ENABLE ROW LEVEL SECURITY;

--
-- Name: themes; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.themes ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles update_own_profile; Type: POLICY; Schema: games_library; Owner: -
--

CREATE POLICY update_own_profile ON games_library.profiles FOR UPDATE TO authenticated USING ((( SELECT auth.uid() AS uid) = user_id)) WITH CHECK ((( SELECT auth.uid() AS uid) = user_id));


--
-- Name: user_game_states; Type: ROW SECURITY; Schema: games_library; Owner: -
--

ALTER TABLE games_library.user_game_states ENABLE ROW LEVEL SECURITY;

--
-- Name: duplicate_queue_refresh_runs; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.duplicate_queue_refresh_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: game_duplicate_merge_items; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.game_duplicate_merge_items ENABLE ROW LEVEL SECURITY;

--
-- Name: game_duplicate_merge_runs; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.game_duplicate_merge_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: game_id_canonicalization_map; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.game_id_canonicalization_map ENABLE ROW LEVEL SECURITY;

--
-- Name: game_id_canonicalization_runs; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.game_id_canonicalization_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: game_id_diacritic_cleanup_map; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.game_id_diacritic_cleanup_map ENABLE ROW LEVEL SECURITY;

--
-- Name: game_id_diacritic_cleanup_runs; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.game_id_diacritic_cleanup_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: game_id_slug_cleanup_map; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.game_id_slug_cleanup_map ENABLE ROW LEVEL SECURITY;

--
-- Name: game_id_slug_cleanup_runs; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.game_id_slug_cleanup_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: game_sales_snapshot_dedupe_audit; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.game_sales_snapshot_dedupe_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: game_score_scale_normalization_runs; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.game_score_scale_normalization_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: post_ingest_duplicate_processing_runs; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.post_ingest_duplicate_processing_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: redirect_chain_compression_runs; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.redirect_chain_compression_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: redundant_alias_cleanup_runs; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.redundant_alias_cleanup_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: safe_alias_backfill_runs; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.safe_alias_backfill_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: duplicate_queue_refresh_runs service_role_manage_duplicate_queue_refresh_runs; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_duplicate_queue_refresh_runs ON games_library_private.duplicate_queue_refresh_runs TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_duplicate_merge_items service_role_manage_game_duplicate_merge_items; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_game_duplicate_merge_items ON games_library_private.game_duplicate_merge_items TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_duplicate_merge_runs service_role_manage_game_duplicate_merge_runs; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_game_duplicate_merge_runs ON games_library_private.game_duplicate_merge_runs TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_id_canonicalization_map service_role_manage_game_id_canonicalization_map; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_game_id_canonicalization_map ON games_library_private.game_id_canonicalization_map TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_id_canonicalization_runs service_role_manage_game_id_canonicalization_runs; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_game_id_canonicalization_runs ON games_library_private.game_id_canonicalization_runs TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_id_diacritic_cleanup_map service_role_manage_game_id_diacritic_cleanup_map; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_game_id_diacritic_cleanup_map ON games_library_private.game_id_diacritic_cleanup_map TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_id_diacritic_cleanup_runs service_role_manage_game_id_diacritic_cleanup_runs; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_game_id_diacritic_cleanup_runs ON games_library_private.game_id_diacritic_cleanup_runs TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_id_slug_cleanup_map service_role_manage_game_id_slug_cleanup_map; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_game_id_slug_cleanup_map ON games_library_private.game_id_slug_cleanup_map TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_id_slug_cleanup_runs service_role_manage_game_id_slug_cleanup_runs; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_game_id_slug_cleanup_runs ON games_library_private.game_id_slug_cleanup_runs TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_sales_snapshot_dedupe_audit service_role_manage_game_sales_snapshot_dedupe_audit; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_game_sales_snapshot_dedupe_audit ON games_library_private.game_sales_snapshot_dedupe_audit TO service_role USING (true) WITH CHECK (true);


--
-- Name: game_score_scale_normalization_runs service_role_manage_game_score_scale_normalization_runs; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_game_score_scale_normalization_runs ON games_library_private.game_score_scale_normalization_runs TO service_role USING (true) WITH CHECK (true);


--
-- Name: post_ingest_duplicate_processing_runs service_role_manage_post_ingest_duplicate_processing_runs; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_post_ingest_duplicate_processing_runs ON games_library_private.post_ingest_duplicate_processing_runs TO service_role USING (true) WITH CHECK (true);


--
-- Name: redirect_chain_compression_runs service_role_manage_redirect_chain_compression_runs; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_redirect_chain_compression_runs ON games_library_private.redirect_chain_compression_runs TO service_role USING (true) WITH CHECK (true);


--
-- Name: redundant_alias_cleanup_runs service_role_manage_redundant_alias_cleanup_runs; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_redundant_alias_cleanup_runs ON games_library_private.redundant_alias_cleanup_runs TO service_role USING (true) WITH CHECK (true);


--
-- Name: safe_alias_backfill_runs service_role_manage_safe_alias_backfill_runs; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_safe_alias_backfill_runs ON games_library_private.safe_alias_backfill_runs TO service_role USING (true) WITH CHECK (true);


--
-- Name: staging_metacritic_games_archived_20260704 service_role_manage_staging_metacritic_games; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_staging_metacritic_games ON games_library_private.staging_metacritic_games_archived_20260704 TO service_role USING (true) WITH CHECK (true);


--
-- Name: staging_metacritic_review_sentiment_archived_20260704 service_role_manage_staging_metacritic_review_sentiment; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_staging_metacritic_review_sentiment ON games_library_private.staging_metacritic_review_sentiment_archived_20260704 TO service_role USING (true) WITH CHECK (true);


--
-- Name: staging_metacritic_reviews_archived_20260704 service_role_manage_staging_metacritic_reviews; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_staging_metacritic_reviews ON games_library_private.staging_metacritic_reviews_archived_20260704 TO service_role USING (true) WITH CHECK (true);


--
-- Name: staging_vgsales_archived_20260704 service_role_manage_staging_vgsales; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_staging_vgsales ON games_library_private.staging_vgsales_archived_20260704 TO service_role USING (true) WITH CHECK (true);


--
-- Name: user_data_reset_backups service_role_manage_user_data_reset_backups; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_user_data_reset_backups ON games_library_private.user_data_reset_backups TO service_role USING (true) WITH CHECK (true);


--
-- Name: user_data_reset_runs service_role_manage_user_data_reset_runs; Type: POLICY; Schema: games_library_private; Owner: -
--

CREATE POLICY service_role_manage_user_data_reset_runs ON games_library_private.user_data_reset_runs TO service_role USING (true) WITH CHECK (true);


--
-- Name: staging_metacritic_games_archived_20260704; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.staging_metacritic_games_archived_20260704 ENABLE ROW LEVEL SECURITY;

--
-- Name: staging_metacritic_review_sentiment_archived_20260704; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.staging_metacritic_review_sentiment_archived_20260704 ENABLE ROW LEVEL SECURITY;

--
-- Name: staging_metacritic_reviews_archived_20260704; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.staging_metacritic_reviews_archived_20260704 ENABLE ROW LEVEL SECURITY;

--
-- Name: staging_vgsales_archived_20260704; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.staging_vgsales_archived_20260704 ENABLE ROW LEVEL SECURITY;

--
-- Name: user_data_reset_backups; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.user_data_reset_backups ENABLE ROW LEVEL SECURITY;

--
-- Name: user_data_reset_runs; Type: ROW SECURITY; Schema: games_library_private; Owner: -
--

ALTER TABLE games_library_private.user_data_reset_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: SCHEMA games_library; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA games_library TO anon;
GRANT USAGE ON SCHEMA games_library TO authenticated;
GRANT USAGE ON SCHEMA games_library TO service_role;


--
-- Name: SCHEMA games_library_private; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA games_library_private TO service_role;


--
-- Name: FUNCTION build_game_states_json(p_user_id uuid); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.build_game_states_json(p_user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library.build_game_states_json(p_user_id uuid) TO service_role;


--
-- Name: FUNCTION check_rate_limit(p_ip_address text, p_endpoint text, p_max_requests integer, p_window_seconds integer, p_user_id text); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.check_rate_limit(p_ip_address text, p_endpoint text, p_max_requests integer, p_window_seconds integer, p_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library.check_rate_limit(p_ip_address text, p_endpoint text, p_max_requests integer, p_window_seconds integer, p_user_id text) TO authenticated;


--
-- Name: FUNCTION cleanup_audit_log(p_older_than interval); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.cleanup_audit_log(p_older_than interval) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library.cleanup_audit_log(p_older_than interval) TO service_role;


--
-- Name: FUNCTION cleanup_rate_limits(p_older_than interval); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.cleanup_rate_limits(p_older_than interval) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library.cleanup_rate_limits(p_older_than interval) TO service_role;


--
-- Name: FUNCTION confidence_label(p_rated_count integer); Type: ACL; Schema: games_library; Owner: -
--

GRANT ALL ON FUNCTION games_library.confidence_label(p_rated_count integer) TO anon;
GRANT ALL ON FUNCTION games_library.confidence_label(p_rated_count integer) TO authenticated;
GRANT ALL ON FUNCTION games_library.confidence_label(p_rated_count integer) TO service_role;


--
-- Name: FUNCTION delete_game_state(p_user_id text, p_game_id text); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.delete_game_state(p_user_id text, p_game_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library.delete_game_state(p_user_id text, p_game_id text) TO authenticated;


--
-- Name: FUNCTION delete_profile(p_user_id text); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.delete_profile(p_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library.delete_profile(p_user_id text) TO authenticated;


--
-- Name: FUNCTION format_trait(p_value text); Type: ACL; Schema: games_library; Owner: -
--

GRANT ALL ON FUNCTION games_library.format_trait(p_value text) TO anon;
GRANT ALL ON FUNCTION games_library.format_trait(p_value text) TO authenticated;
GRANT ALL ON FUNCTION games_library.format_trait(p_value text) TO service_role;


--
-- Name: FUNCTION get_audit_log(p_user_id uuid, p_limit integer); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.get_audit_log(p_user_id uuid, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library.get_audit_log(p_user_id uuid, p_limit integer) TO service_role;


--
-- Name: FUNCTION get_cache(p_key text); Type: ACL; Schema: games_library; Owner: -
--

GRANT ALL ON FUNCTION games_library.get_cache(p_key text) TO anon;
GRANT ALL ON FUNCTION games_library.get_cache(p_key text) TO authenticated;
GRANT ALL ON FUNCTION games_library.get_cache(p_key text) TO service_role;


--
-- Name: FUNCTION get_full_catalog(); Type: ACL; Schema: games_library; Owner: -
--

GRANT ALL ON FUNCTION games_library.get_full_catalog() TO anon;
GRANT ALL ON FUNCTION games_library.get_full_catalog() TO authenticated;
GRANT ALL ON FUNCTION games_library.get_full_catalog() TO service_role;


--
-- Name: FUNCTION get_game_states(p_user_id text); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.get_game_states(p_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library.get_game_states(p_user_id text) TO authenticated;


--
-- Name: FUNCTION get_profile(p_user_id text); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.get_profile(p_user_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library.get_profile(p_user_id text) TO authenticated;


--
-- Name: FUNCTION migrate_profile(p_from_user_id text, p_to_user_id text, p_onboarding jsonb); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.migrate_profile(p_from_user_id text, p_to_user_id text, p_onboarding jsonb) FROM PUBLIC;


--
-- Name: FUNCTION score_today_recommendations(p_liked_tags jsonb, p_disliked_tags jsonb, p_liked_genres text[], p_avoided_genres text[], p_rated_count integer, p_accessible_platform_ids text[], p_onboarding_liked_ids text[], p_onboarding_disliked_ids text[], p_game_states jsonb, p_skip_buckets text[]); Type: ACL; Schema: games_library; Owner: -
--

GRANT ALL ON FUNCTION games_library.score_today_recommendations(p_liked_tags jsonb, p_disliked_tags jsonb, p_liked_genres text[], p_avoided_genres text[], p_rated_count integer, p_accessible_platform_ids text[], p_onboarding_liked_ids text[], p_onboarding_disliked_ids text[], p_game_states jsonb, p_skip_buckets text[]) TO anon;
GRANT ALL ON FUNCTION games_library.score_today_recommendations(p_liked_tags jsonb, p_disliked_tags jsonb, p_liked_genres text[], p_avoided_genres text[], p_rated_count integer, p_accessible_platform_ids text[], p_onboarding_liked_ids text[], p_onboarding_disliked_ids text[], p_game_states jsonb, p_skip_buckets text[]) TO authenticated;
GRANT ALL ON FUNCTION games_library.score_today_recommendations(p_liked_tags jsonb, p_disliked_tags jsonb, p_liked_genres text[], p_avoided_genres text[], p_rated_count integer, p_accessible_platform_ids text[], p_onboarding_liked_ids text[], p_onboarding_disliked_ids text[], p_game_states jsonb, p_skip_buckets text[]) TO service_role;


--
-- Name: FUNCTION set_cache(p_key text, p_value jsonb, p_ttl_seconds integer); Type: ACL; Schema: games_library; Owner: -
--

GRANT ALL ON FUNCTION games_library.set_cache(p_key text, p_value jsonb, p_ttl_seconds integer) TO anon;
GRANT ALL ON FUNCTION games_library.set_cache(p_key text, p_value jsonb, p_ttl_seconds integer) TO authenticated;
GRANT ALL ON FUNCTION games_library.set_cache(p_key text, p_value jsonb, p_ttl_seconds integer) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: games_library; Owner: -
--

GRANT ALL ON FUNCTION games_library.set_updated_at() TO service_role;


--
-- Name: FUNCTION sync_profile_game_states(); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.sync_profile_game_states() FROM PUBLIC;


--
-- Name: FUNCTION tag_set_norm(p_tags jsonb); Type: ACL; Schema: games_library; Owner: -
--

GRANT ALL ON FUNCTION games_library.tag_set_norm(p_tags jsonb) TO anon;
GRANT ALL ON FUNCTION games_library.tag_set_norm(p_tags jsonb) TO authenticated;
GRANT ALL ON FUNCTION games_library.tag_set_norm(p_tags jsonb) TO service_role;


--
-- Name: FUNCTION tag_weight(p_tag text); Type: ACL; Schema: games_library; Owner: -
--

GRANT ALL ON FUNCTION games_library.tag_weight(p_tag text) TO anon;
GRANT ALL ON FUNCTION games_library.tag_weight(p_tag text) TO authenticated;
GRANT ALL ON FUNCTION games_library.tag_weight(p_tag text) TO service_role;


--
-- Name: FUNCTION upsert_game_state(p_user_id text, p_game_id text, p_status text, p_rating numeric, p_in_backlog boolean, p_in_wishlist boolean, p_excluded boolean, p_source text); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.upsert_game_state(p_user_id text, p_game_id text, p_status text, p_rating numeric, p_in_backlog boolean, p_in_wishlist boolean, p_excluded boolean, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library.upsert_game_state(p_user_id text, p_game_id text, p_status text, p_rating numeric, p_in_backlog boolean, p_in_wishlist boolean, p_excluded boolean, p_source text) TO authenticated;


--
-- Name: FUNCTION upsert_game_state(p_user_id text, p_game_id text, p_status text, p_rating numeric, p_in_backlog boolean, p_in_wishlist boolean, p_in_playfit_picks boolean, p_excluded boolean, p_source text); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.upsert_game_state(p_user_id text, p_game_id text, p_status text, p_rating numeric, p_in_backlog boolean, p_in_wishlist boolean, p_in_playfit_picks boolean, p_excluded boolean, p_source text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library.upsert_game_state(p_user_id text, p_game_id text, p_status text, p_rating numeric, p_in_backlog boolean, p_in_wishlist boolean, p_in_playfit_picks boolean, p_excluded boolean, p_source text) TO authenticated;


--
-- Name: FUNCTION upsert_profile(p_user_id text, p_game_states jsonb, p_profile jsonb, p_onboarding jsonb); Type: ACL; Schema: games_library; Owner: -
--

REVOKE ALL ON FUNCTION games_library.upsert_profile(p_user_id text, p_game_states jsonb, p_profile jsonb, p_onboarding jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library.upsert_profile(p_user_id text, p_game_states jsonb, p_profile jsonb, p_onboarding jsonb) TO authenticated;


--
-- Name: FUNCTION weighted_cosine_similarity(p_game_tags text[], p_profile_tags jsonb, p_profile_norm double precision); Type: ACL; Schema: games_library; Owner: -
--

GRANT ALL ON FUNCTION games_library.weighted_cosine_similarity(p_game_tags text[], p_profile_tags jsonb, p_profile_norm double precision) TO anon;
GRANT ALL ON FUNCTION games_library.weighted_cosine_similarity(p_game_tags text[], p_profile_tags jsonb, p_profile_norm double precision) TO authenticated;
GRANT ALL ON FUNCTION games_library.weighted_cosine_similarity(p_game_tags text[], p_profile_tags jsonb, p_profile_norm double precision) TO service_role;


--
-- Name: FUNCTION apply_approved_external_enrichment(p_limit integer); Type: ACL; Schema: games_library_private; Owner: -
--

GRANT ALL ON FUNCTION games_library_private.apply_approved_external_enrichment(p_limit integer) TO service_role;


--
-- Name: FUNCTION apply_approved_game_duplicate_merges(p_limit integer); Type: ACL; Schema: games_library_private; Owner: -
--

REVOKE ALL ON FUNCTION games_library_private.apply_approved_game_duplicate_merges(p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.apply_approved_game_duplicate_merges(p_limit integer) TO service_role;


--
-- Name: FUNCTION apply_approved_metacritic_review_sentiment(p_limit integer); Type: ACL; Schema: games_library_private; Owner: -
--

GRANT ALL ON FUNCTION games_library_private.apply_approved_metacritic_review_sentiment(p_limit integer) TO service_role;


--
-- Name: FUNCTION apply_generic_series_cleanup(); Type: ACL; Schema: games_library_private; Owner: -
--

REVOKE ALL ON FUNCTION games_library_private.apply_generic_series_cleanup() FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.apply_generic_series_cleanup() TO service_role;


--
-- Name: FUNCTION approve_duplicate_group_full_merge(p_group_key text, p_winner_game_id text, p_reviewed_by text, p_review_notes text); Type: ACL; Schema: games_library_private; Owner: -
--

REVOKE ALL ON FUNCTION games_library_private.approve_duplicate_group_full_merge(p_group_key text, p_winner_game_id text, p_reviewed_by text, p_review_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.approve_duplicate_group_full_merge(p_group_key text, p_winner_game_id text, p_reviewed_by text, p_review_notes text) TO service_role;


--
-- Name: FUNCTION backfill_aliases_from_external_matches(); Type: ACL; Schema: games_library_private; Owner: -
--

REVOKE ALL ON FUNCTION games_library_private.backfill_aliases_from_external_matches() FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.backfill_aliases_from_external_matches() TO service_role;


--
-- Name: FUNCTION canonicalize_duplicate_group_winner(p_group_key text, p_current_winner_game_id text, p_new_game_id text, p_reviewed_by text, p_review_notes text); Type: ACL; Schema: games_library_private; Owner: -
--

REVOKE ALL ON FUNCTION games_library_private.canonicalize_duplicate_group_winner(p_group_key text, p_current_winner_game_id text, p_new_game_id text, p_reviewed_by text, p_review_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.canonicalize_duplicate_group_winner(p_group_key text, p_current_winner_game_id text, p_new_game_id text, p_reviewed_by text, p_review_notes text) TO service_role;


--
-- Name: FUNCTION move_duplicate_enrichment_to_winner(p_loser_game_id text, p_winner_game_id text); Type: ACL; Schema: games_library_private; Owner: -
--

REVOKE ALL ON FUNCTION games_library_private.move_duplicate_enrichment_to_winner(p_loser_game_id text, p_winner_game_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.move_duplicate_enrichment_to_winner(p_loser_game_id text, p_winner_game_id text) TO service_role;


--
-- Name: FUNCTION propose_game_duplicate_actions(); Type: ACL; Schema: games_library_private; Owner: -
--

REVOKE ALL ON FUNCTION games_library_private.propose_game_duplicate_actions() FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.propose_game_duplicate_actions() TO service_role;


--
-- Name: FUNCTION refresh_external_match_candidates(); Type: ACL; Schema: games_library_private; Owner: -
--

GRANT ALL ON FUNCTION games_library_private.refresh_external_match_candidates() TO service_role;


--
-- Name: FUNCTION refresh_game_duplicate_candidates(); Type: ACL; Schema: games_library_private; Owner: -
--

REVOKE ALL ON FUNCTION games_library_private.refresh_game_duplicate_candidates() FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.refresh_game_duplicate_candidates() TO service_role;


--
-- Name: FUNCTION refresh_metacritic_review_sentiment_candidates(); Type: ACL; Schema: games_library_private; Owner: -
--

GRANT ALL ON FUNCTION games_library_private.refresh_metacritic_review_sentiment_candidates() TO service_role;


--
-- Name: FUNCTION refresh_series_cleanup_candidates(); Type: ACL; Schema: games_library_private; Owner: -
--

REVOKE ALL ON FUNCTION games_library_private.refresh_series_cleanup_candidates() FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.refresh_series_cleanup_candidates() TO service_role;


--
-- Name: FUNCTION review_external_match_candidate(p_candidate_id uuid, p_decision text, p_reviewed_by text, p_review_notes text); Type: ACL; Schema: games_library_private; Owner: -
--

REVOKE ALL ON FUNCTION games_library_private.review_external_match_candidate(p_candidate_id uuid, p_decision text, p_reviewed_by text, p_review_notes text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.review_external_match_candidate(p_candidate_id uuid, p_decision text, p_reviewed_by text, p_review_notes text) TO service_role;


--
-- Name: FUNCTION slugify_game_id(p_title text); Type: ACL; Schema: games_library_private; Owner: -
--

REVOKE ALL ON FUNCTION games_library_private.slugify_game_id(p_title text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.slugify_game_id(p_title text) TO service_role;


--
-- Name: FUNCTION slugify_game_id_unaccent(p_title text); Type: ACL; Schema: games_library_private; Owner: -
--

REVOKE ALL ON FUNCTION games_library_private.slugify_game_id_unaccent(p_title text) FROM PUBLIC;
GRANT ALL ON FUNCTION games_library_private.slugify_game_id_unaccent(p_title text) TO service_role;


--
-- Name: TABLE audit_log; Type: ACL; Schema: games_library; Owner: -
--

GRANT INSERT ON TABLE games_library.audit_log TO authenticated;
GRANT INSERT ON TABLE games_library.audit_log TO service_role;


--
-- Name: TABLE game_platforms; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_platforms TO anon;
GRANT SELECT ON TABLE games_library.game_platforms TO authenticated;
GRANT SELECT,INSERT,DELETE ON TABLE games_library.game_platforms TO service_role;


--
-- Name: TABLE game_scores; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_scores TO service_role;


--
-- Name: TABLE games; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.games TO anon;
GRANT SELECT ON TABLE games_library.games TO authenticated;
GRANT ALL ON TABLE games_library.games TO service_role;


--
-- Name: TABLE platforms; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.platforms TO anon;
GRANT SELECT ON TABLE games_library.platforms TO authenticated;
GRANT ALL ON TABLE games_library.platforms TO service_role;


--
-- Name: TABLE cover_review_queue; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.cover_review_queue TO service_role;


--
-- Name: TABLE game_duplicate_candidates; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_duplicate_candidates TO service_role;


--
-- Name: TABLE game_duplicate_groups; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_duplicate_groups TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,UPDATE ON TABLE games_library.profiles TO authenticated;
GRANT ALL ON TABLE games_library.profiles TO service_role;


--
-- Name: TABLE user_game_states; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.user_game_states TO authenticated;


--
-- Name: TABLE game_duplicate_review_plan; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_duplicate_review_plan TO service_role;


--
-- Name: TABLE duplicate_manual_review_triage; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.duplicate_manual_review_triage TO service_role;


--
-- Name: TABLE game_external_match_candidates; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_external_match_candidates TO service_role;


--
-- Name: TABLE external_match_candidate_summary; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.external_match_candidate_summary TO service_role;


--
-- Name: TABLE external_match_review_queue; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.external_match_review_queue TO service_role;


--
-- Name: TABLE external_match_review_lane_summary; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.external_match_review_lane_summary TO service_role;


--
-- Name: TABLE game_age_ratings; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_age_ratings TO service_role;


--
-- Name: TABLE game_aliases; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_aliases TO anon;
GRANT SELECT ON TABLE games_library.game_aliases TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_aliases TO service_role;


--
-- Name: TABLE game_companies; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_companies TO service_role;


--
-- Name: TABLE game_tags; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_tags TO anon;
GRANT SELECT ON TABLE games_library.game_tags TO authenticated;
GRANT SELECT,INSERT,DELETE ON TABLE games_library.game_tags TO service_role;


--
-- Name: TABLE game_duplicate_candidate_source; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_duplicate_candidate_source TO service_role;


--
-- Name: TABLE game_duplicate_manual_review_queue; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_duplicate_manual_review_queue TO service_role;


--
-- Name: TABLE game_engines; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_engines TO anon;
GRANT SELECT ON TABLE games_library.game_engines TO authenticated;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE games_library.game_engines TO service_role;


--
-- Name: TABLE game_external_ids; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_external_ids TO service_role;


--
-- Name: TABLE game_game_engines; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_game_engines TO anon;
GRANT SELECT ON TABLE games_library.game_game_engines TO authenticated;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE games_library.game_game_engines TO service_role;


--
-- Name: TABLE game_game_modes; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_game_modes TO anon;
GRANT SELECT ON TABLE games_library.game_game_modes TO authenticated;
GRANT ALL ON TABLE games_library.game_game_modes TO service_role;


--
-- Name: TABLE game_genres; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_genres TO anon;
GRANT SELECT ON TABLE games_library.game_genres TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_genres TO service_role;


--
-- Name: TABLE game_modes; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_modes TO anon;
GRANT SELECT ON TABLE games_library.game_modes TO authenticated;
GRANT ALL ON TABLE games_library.game_modes TO service_role;


--
-- Name: TABLE game_multiplayer_modes; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_multiplayer_modes TO anon;
GRANT SELECT ON TABLE games_library.game_multiplayer_modes TO authenticated;
GRANT SELECT,INSERT,REFERENCES,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE games_library.game_multiplayer_modes TO service_role;


--
-- Name: TABLE game_perspectives; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_perspectives TO anon;
GRANT SELECT ON TABLE games_library.game_perspectives TO authenticated;
GRANT ALL ON TABLE games_library.game_perspectives TO service_role;


--
-- Name: TABLE game_quality_score; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_quality_score TO anon;
GRANT SELECT ON TABLE games_library.game_quality_score TO authenticated;
GRANT SELECT ON TABLE games_library.game_quality_score TO service_role;


--
-- Name: TABLE game_review_sentiment_snapshots; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_review_sentiment_snapshots TO service_role;


--
-- Name: TABLE game_sales_snapshots; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_sales_snapshots TO service_role;


--
-- Name: TABLE game_summaries; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_summaries TO service_role;


--
-- Name: TABLE game_recommendation_enrichment_signals; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_recommendation_enrichment_signals TO service_role;


--
-- Name: TABLE game_redirects; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_redirects TO service_role;


--
-- Name: COLUMN game_redirects.from_game_id; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT(from_game_id) ON TABLE games_library.game_redirects TO anon;
GRANT SELECT(from_game_id) ON TABLE games_library.game_redirects TO authenticated;


--
-- Name: COLUMN game_redirects.to_game_id; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT(to_game_id) ON TABLE games_library.game_redirects TO anon;
GRANT SELECT(to_game_id) ON TABLE games_library.game_redirects TO authenticated;


--
-- Name: TABLE game_releases; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.game_releases TO service_role;


--
-- Name: TABLE game_similar_games; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_similar_games TO anon;
GRANT SELECT ON TABLE games_library.game_similar_games TO authenticated;
GRANT ALL ON TABLE games_library.game_similar_games TO service_role;


--
-- Name: TABLE game_themes; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.game_themes TO anon;
GRANT SELECT ON TABLE games_library.game_themes TO authenticated;
GRANT ALL ON TABLE games_library.game_themes TO service_role;


--
-- Name: TABLE genres; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.genres TO anon;
GRANT SELECT ON TABLE games_library.genres TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.genres TO service_role;


--
-- Name: TABLE tags; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.tags TO anon;
GRANT SELECT ON TABLE games_library.tags TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.tags TO service_role;


--
-- Name: TABLE genre_backfill_review_candidates; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.genre_backfill_review_candidates TO service_role;


--
-- Name: TABLE perspectives; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.perspectives TO anon;
GRANT SELECT ON TABLE games_library.perspectives TO authenticated;
GRANT ALL ON TABLE games_library.perspectives TO service_role;


--
-- Name: TABLE rate_limits; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE ON TABLE games_library.rate_limits TO service_role;


--
-- Name: TABLE review_sentiment_enrichment_summary; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.review_sentiment_enrichment_summary TO service_role;


--
-- Name: TABLE series; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.series TO anon;
GRANT SELECT ON TABLE games_library.series TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.series TO service_role;


--
-- Name: TABLE series_cleanup_applied; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.series_cleanup_applied TO service_role;


--
-- Name: TABLE series_cleanup_candidates; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library.series_cleanup_candidates TO service_role;


--
-- Name: TABLE tag_quality_profile; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.tag_quality_profile TO service_role;


--
-- Name: TABLE tag_weights; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.tag_weights TO anon;
GRANT SELECT ON TABLE games_library.tag_weights TO authenticated;
GRANT SELECT ON TABLE games_library.tag_weights TO service_role;


--
-- Name: TABLE themes; Type: ACL; Schema: games_library; Owner: -
--

GRANT SELECT ON TABLE games_library.themes TO anon;
GRANT SELECT ON TABLE games_library.themes TO authenticated;
GRANT ALL ON TABLE games_library.themes TO service_role;


--
-- Name: TABLE duplicate_queue_refresh_runs; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.duplicate_queue_refresh_runs TO service_role;


--
-- Name: TABLE game_duplicate_merge_items; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.game_duplicate_merge_items TO service_role;


--
-- Name: TABLE game_duplicate_merge_runs; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.game_duplicate_merge_runs TO service_role;


--
-- Name: TABLE game_id_canonicalization_map; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.game_id_canonicalization_map TO service_role;


--
-- Name: TABLE game_id_canonicalization_runs; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.game_id_canonicalization_runs TO service_role;


--
-- Name: TABLE game_id_diacritic_cleanup_map; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.game_id_diacritic_cleanup_map TO service_role;


--
-- Name: TABLE game_id_diacritic_cleanup_runs; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.game_id_diacritic_cleanup_runs TO service_role;


--
-- Name: TABLE game_id_slug_cleanup_map; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.game_id_slug_cleanup_map TO service_role;


--
-- Name: TABLE game_id_slug_cleanup_runs; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.game_id_slug_cleanup_runs TO service_role;


--
-- Name: TABLE game_sales_snapshot_dedupe_audit; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.game_sales_snapshot_dedupe_audit TO service_role;


--
-- Name: TABLE game_score_scale_normalization_runs; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.game_score_scale_normalization_runs TO service_role;


--
-- Name: TABLE post_ingest_duplicate_processing_runs; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.post_ingest_duplicate_processing_runs TO service_role;


--
-- Name: TABLE redirect_chain_compression_runs; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.redirect_chain_compression_runs TO service_role;


--
-- Name: TABLE redundant_alias_cleanup_runs; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.redundant_alias_cleanup_runs TO service_role;


--
-- Name: TABLE safe_alias_backfill_runs; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.safe_alias_backfill_runs TO service_role;


--
-- Name: TABLE staging_metacritic_games_archived_20260704; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE games_library_private.staging_metacritic_games_archived_20260704 TO service_role;


--
-- Name: TABLE staging_metacritic_review_sentiment_archived_20260704; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE games_library_private.staging_metacritic_review_sentiment_archived_20260704 TO service_role;


--
-- Name: SEQUENCE staging_metacritic_review_sentiment_staging_row_id_seq; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,USAGE ON SEQUENCE games_library_private.staging_metacritic_review_sentiment_staging_row_id_seq TO service_role;


--
-- Name: TABLE staging_metacritic_reviews_archived_20260704; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE games_library_private.staging_metacritic_reviews_archived_20260704 TO service_role;


--
-- Name: TABLE staging_vgsales_archived_20260704; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE games_library_private.staging_vgsales_archived_20260704 TO service_role;


--
-- Name: TABLE user_data_reset_backups; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.user_data_reset_backups TO service_role;


--
-- Name: TABLE user_data_reset_runs; Type: ACL; Schema: games_library_private; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE games_library_private.user_data_reset_runs TO service_role;


--
-- PostgreSQL database dump complete
--


