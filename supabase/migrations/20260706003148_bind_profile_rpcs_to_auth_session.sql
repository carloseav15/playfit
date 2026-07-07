begin;

create or replace function games_library.check_rate_limit(
  p_ip_address text,
  p_endpoint text,
  p_max_requests integer,
  p_window_seconds integer,
  p_user_id text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
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

create or replace function games_library.get_profile(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
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

create or replace function games_library.get_game_states(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return games_library.build_game_states_json(p_user_id::uuid);
end;
$$;

create or replace function games_library.delete_profile(p_user_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from games_library.profiles where user_id = p_user_id::uuid;
end;
$$;

create or replace function games_library.delete_game_state(p_user_id text, p_game_id text)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from games_library.user_game_states
  where user_id = p_user_id::uuid and game_id = p_game_id;
end;
$$;

create or replace function games_library.upsert_game_state(
  p_user_id text,
  p_game_id text,
  p_status text default null,
  p_rating numeric default null,
  p_in_backlog boolean default null,
  p_in_wishlist boolean default null,
  p_excluded boolean default null,
  p_source text default 'manual'
) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
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

create or replace function games_library.upsert_game_state(
  p_user_id text,
  p_game_id text,
  p_status text default null,
  p_rating numeric default null,
  p_in_backlog boolean default null,
  p_in_wishlist boolean default null,
  p_in_playfit_picks boolean default null,
  p_excluded boolean default null,
  p_source text default 'manual'
) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
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

create or replace function games_library.upsert_profile(
  p_user_id text,
  p_game_states jsonb,
  p_profile jsonb,
  p_onboarding jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
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

create or replace function games_library.migrate_profile(
  p_from_user_id text,
  p_to_user_id text,
  p_onboarding jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
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

revoke all on function games_library.check_rate_limit(text, text, integer, integer, text)
  from public, anon, authenticated, service_role;
revoke all on function games_library.get_profile(text)
  from public, anon, authenticated, service_role;
revoke all on function games_library.get_game_states(text)
  from public, anon, authenticated, service_role;
revoke all on function games_library.upsert_profile(text, jsonb, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function games_library.delete_profile(text)
  from public, anon, authenticated, service_role;
revoke all on function games_library.upsert_game_state(
  text, text, text, numeric, boolean, boolean, boolean, text
) from public, anon, authenticated, service_role;
revoke all on function games_library.upsert_game_state(
  text, text, text, numeric, boolean, boolean, boolean, boolean, text
) from public, anon, authenticated, service_role;
revoke all on function games_library.delete_game_state(text, text)
  from public, anon, authenticated, service_role;
revoke all on function games_library.migrate_profile(text, text, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function games_library.check_rate_limit(text, text, integer, integer, text)
  to authenticated;
grant execute on function games_library.get_profile(text) to authenticated;
grant execute on function games_library.get_game_states(text) to authenticated;
grant execute on function games_library.upsert_profile(text, jsonb, jsonb, jsonb)
  to authenticated;
grant execute on function games_library.delete_profile(text) to authenticated;
grant execute on function games_library.upsert_game_state(
  text, text, text, numeric, boolean, boolean, boolean, text
) to authenticated;
grant execute on function games_library.upsert_game_state(
  text, text, text, numeric, boolean, boolean, boolean, boolean, text
) to authenticated;
grant execute on function games_library.delete_game_state(text, text) to authenticated;

revoke all on function games_library.cleanup_audit_log(interval)
  from public, anon, authenticated;
revoke all on function games_library.cleanup_rate_limits(interval)
  from public, anon, authenticated;
revoke all on function games_library.get_audit_log(uuid, integer)
  from public, anon, authenticated;
revoke all on function games_library.sync_profile_game_states()
  from public, anon, authenticated, service_role;

grant execute on function games_library.cleanup_audit_log(interval) to service_role;
grant execute on function games_library.cleanup_rate_limits(interval) to service_role;
grant execute on function games_library.get_audit_log(uuid, integer) to service_role;

comment on function games_library.check_rate_limit(text, text, integer, integer, text) is
  'Checks and records API rate limits while binding any user bucket to auth.uid().';
comment on function games_library.migrate_profile(text, text, jsonb) is
  'Legacy device profile migration retained for rollback compatibility; not exposed through the Data API.';

commit;

-- Down: intentionally omitted. Reopening identity-bound SECURITY DEFINER functions to
-- unauthenticated callers would restore the authorization vulnerability fixed here.
