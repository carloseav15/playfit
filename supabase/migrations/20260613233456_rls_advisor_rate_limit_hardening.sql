-- Harden RLS advisor findings and move rate limiting behind an RPC boundary.
begin;

-- ============================================================
-- 1. RLS performance: cache auth.uid() once per statement
-- ============================================================
drop policy if exists select_own_profile on games_library.profiles;
create policy select_own_profile
  on games_library.profiles
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists insert_own_profile on games_library.profiles;
create policy insert_own_profile
  on games_library.profiles
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists update_own_profile on games_library.profiles;
create policy update_own_profile
  on games_library.profiles
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists own_game_states on games_library.user_game_states;
create policy own_game_states
  on games_library.user_game_states
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists insert_audit_log on games_library.audit_log;
create policy insert_audit_log
  on games_library.audit_log
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- ============================================================
-- 2. Rate limiting: remove direct public table access
-- ============================================================
drop policy if exists insert_rate_limit on games_library.rate_limits;
drop policy if exists select_rate_limit on games_library.rate_limits;

create policy select_rate_limit
  on games_library.rate_limits
  for select
  to service_role
  using (true);

revoke select, insert, update, delete on table games_library.rate_limits from anon, authenticated;
grant select, insert, delete on table games_library.rate_limits to service_role;

create or replace function games_library.check_rate_limit(
  p_ip_address     text,
  p_endpoint       text,
  p_max_requests   int,
  p_window_seconds int,
  p_user_id        text default null
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_ip_address text := coalesce(nullif(btrim(p_ip_address), ''), 'unknown');
  v_user_id uuid := null;
  v_window_start timestamptz;
  v_ip_count int;
  v_user_count int;
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
    v_user_id := p_user_id::uuid;
  end if;

  v_window_start := now() - make_interval(secs => p_window_seconds);

  select count(*)::int
  into v_ip_count
  from games_library.rate_limits
  where ip_address = v_ip_address
    and endpoint = p_endpoint
    and requested_at >= v_window_start;

  if v_ip_count >= p_max_requests then
    return false;
  end if;

  if v_user_id is not null then
    select count(*)::int
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

comment on function games_library.check_rate_limit(text, text, int, int, text) is
  'Atomically checks and records API route rate limits without exposing rate_limits table access to anon/authenticated roles.';

revoke all on function games_library.check_rate_limit(text, text, int, int, text)
  from public, anon, authenticated;
grant execute on function games_library.check_rate_limit(text, text, int, int, text)
  to anon, authenticated;

-- ============================================================
-- 3. Function search_path hardening for advisor findings
-- ============================================================
create or replace function games_library.immutable_array_to_string(arr text[], sep text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select pg_catalog.array_to_string(arr, sep);
$$;

create or replace function games_library.get_series_name(p_id text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select name from games_library.series where id = p_id;
$$;

create or replace function games_library.get_genre_name(p_id text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  select name from games_library.genres where id = p_id;
$$;

commit;

-- Down:
-- begin;
-- drop function if exists games_library.check_rate_limit(text, text, int, int, text);
-- grant insert on games_library.rate_limits to anon, authenticated, service_role;
-- grant select on games_library.rate_limits to service_role;
-- drop policy if exists select_own_profile on games_library.profiles;
-- create policy select_own_profile on games_library.profiles
--   for select to authenticated using (auth.uid() = user_id);
-- drop policy if exists insert_own_profile on games_library.profiles;
-- create policy insert_own_profile on games_library.profiles
--   for insert to authenticated with check (auth.uid() = user_id);
-- drop policy if exists update_own_profile on games_library.profiles;
-- create policy update_own_profile on games_library.profiles
--   for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- drop policy if exists own_game_states on games_library.user_game_states;
-- create policy own_game_states on games_library.user_game_states
--   for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- drop policy if exists insert_audit_log on games_library.audit_log;
-- create policy insert_audit_log on games_library.audit_log
--   for insert to authenticated with check (auth.uid() = user_id);
-- create policy insert_rate_limit on games_library.rate_limits
--   for insert to anon, authenticated, service_role with check (true);
-- commit;
