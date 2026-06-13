-- Security enhancements: user_id in rate_limits, audit log table
begin;

-- ============================================================
-- 1. Add user_id to rate_limits for JWT-based rate limiting
-- ============================================================
alter table games_library.rate_limits
  add column if not exists user_id text;

create index if not exists rate_limits_user_idx
  on games_library.rate_limits (user_id, endpoint, requested_at);

-- ============================================================
-- 2. Audit log for sensitive operations
-- ============================================================
create table if not exists games_library.audit_log (
  id         bigint generated always as identity primary key,
  user_id    text,
  action     text not null,
  ip_address text,
  metadata   jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_user_idx
  on games_library.audit_log (user_id);

create index if not exists audit_log_action_idx
  on games_library.audit_log (action, created_at);

-- Allow INSERT from authenticated users, but READ only via SECURITY DEFINER
grant insert on games_library.audit_log to anon, authenticated, service_role;
revoke select, update, delete on games_library.audit_log from anon, authenticated;

-- ============================================================
-- 3. SECURITY DEFINER function to read audit log
-- ============================================================
create or replace function games_library.get_audit_log(
  p_user_id text default null,
  p_limit   int default 100
) returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select jsonb_agg(to_jsonb(a) order by a.created_at desc)
  from games_library.audit_log a
  where (p_user_id is null or a.user_id = p_user_id)
  limit p_limit;
$$;

grant execute on function games_library.get_audit_log to service_role;

commit;
