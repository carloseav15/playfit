-- Performance: shared API cache table, composite indexes, cleanup helpers
begin;

-- ============================================================
-- 1. Shared API cache table (survives serverless cold starts)
-- ============================================================
create table if not exists games_library.api_cache (
  cache_key  text primary key,
  value      jsonb not null,
  expires_at timestamptz not null default now() + interval '5 minutes',
  created_at timestamptz not null default now()
);

create index if not exists api_cache_expires_idx
  on games_library.api_cache (expires_at);

-- SECURITY DEFINER accessors so anon-context API routes can read/write
create or replace function games_library.get_cache(p_key text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
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

create or replace function games_library.set_cache(
  p_key         text,
  p_value       jsonb,
  p_ttl_seconds int default 300
) returns void
language sql
security definer
set search_path = pg_catalog
as $$
  insert into games_library.api_cache (cache_key, value, expires_at)
  values (p_key, p_value, now() + make_interval(secs => p_ttl_seconds))
  on conflict (cache_key) do update set
    value      = excluded.value,
    expires_at = excluded.expires_at;
$$;

grant execute on function games_library.get_cache to anon, authenticated, service_role;
grant execute on function games_library.set_cache to anon, authenticated, service_role;

-- ============================================================
-- 2. Composite indexes on user_game_states for common queries
-- ============================================================
create index if not exists user_game_states_status_idx
  on games_library.user_game_states (user_id, status);

-- ============================================================
-- 3. Cleanup helper for rate_limits (call periodically)
-- ============================================================
create or replace function games_library.cleanup_rate_limits(
  p_older_than interval default interval '7 days'
) returns bigint
language sql
security definer
set search_path = pg_catalog
as $$
  with deleted as (
    delete from games_library.rate_limits
    where requested_at < now() - p_older_than
    returning 1
  )
  select count(*)::bigint from deleted;
$$;

grant execute on function games_library.cleanup_rate_limits to service_role;

-- ============================================================
-- 4. Cleanup helper for audit_log (call periodically)
-- ============================================================
create or replace function games_library.cleanup_audit_log(
  p_older_than interval default interval '30 days'
) returns bigint
language sql
security definer
set search_path = pg_catalog
as $$
  with deleted as (
    delete from games_library.audit_log
    where created_at < now() - p_older_than
    returning 1
  )
  select count(*)::bigint from deleted;
$$;

grant execute on function games_library.cleanup_audit_log to service_role;

commit;
