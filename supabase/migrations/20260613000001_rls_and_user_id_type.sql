-- Security: RLS for rate_limits and audit_log, user_id type unification
begin;

-- ============================================================
-- 1. Unify user_id type: text -> uuid (before enabling RLS
--    so policies can use native uuid comparison)
-- ============================================================
alter table games_library.rate_limits
  alter column user_id type uuid
  using user_id::uuid;

alter table games_library.audit_log
  alter column user_id type uuid
  using user_id::uuid;

-- Drop and recreate indexes with uuid type
drop index if exists games_library.rate_limits_user_idx;
create index if not exists rate_limits_user_idx
  on games_library.rate_limits (user_id, endpoint, requested_at);

drop index if exists games_library.audit_log_user_idx;
create index if not exists audit_log_user_idx
  on games_library.audit_log (user_id);

-- ============================================================
-- 2. Enable RLS on rate_limits
-- ============================================================
alter table games_library.rate_limits enable row level security;

-- Allow INSERT from anon/authenticated (rate limit tracking only)
drop policy if exists insert_rate_limit on games_library.rate_limits;
create policy insert_rate_limit
  on games_library.rate_limits
  for insert
  to anon, authenticated, service_role
  with check (true);

-- Allow SELECT only for service_role (admin/monitoring queries)
drop policy if exists select_rate_limit on games_library.rate_limits;
create policy select_rate_limit
  on games_library.rate_limits
  for select
  to service_role
  using (true);

-- ============================================================
-- 3. Enable RLS on audit_log
-- ============================================================
alter table games_library.audit_log enable row level security;

-- Only authenticated users can insert, with verifiable user_id
drop policy if exists insert_audit_log on games_library.audit_log;
create policy insert_audit_log
  on games_library.audit_log
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Allow service_role SELECT (for SECURITY DEFINER functions)
drop policy if exists select_audit_log on games_library.audit_log;
create policy select_audit_log
  on games_library.audit_log
  for select
  to service_role
  using (true);

-- ============================================================
-- 4. Update audit log function to use uuid parameter
--    Drop the old text-based overload first to avoid ambiguity
-- ============================================================
drop function if exists games_library.get_audit_log(text, int);
create or replace function games_library.get_audit_log(
  p_user_id uuid default null,
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

grant execute on function games_library.get_audit_log(uuid, int) to service_role;

-- ============================================================
-- 5. Revoke INSERT on audit_log from anon
--    Only authenticated users should write audit entries
-- ============================================================
revoke insert on games_library.audit_log from anon;

commit;
