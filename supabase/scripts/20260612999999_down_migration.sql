-- Down migration: reverts all migrations after 20260610000001
-- Run ONLY if rollback is needed: supabase db execute < this_file

-- ============================================================
-- Phase 7: api_cache + cleanup functions + indexes
-- ============================================================

drop view if exists games_library.game_catalog_browse;

-- 1. Drop api_cache functions and table
drop function if exists games_library.get_cache(text);
drop function if exists games_library.set_cache(text, jsonb, int);
drop function if exists games_library.cleanup_rate_limits(interval);
drop function if exists games_library.cleanup_audit_log(interval);
drop table if exists games_library.api_cache;

-- 2. Drop Phase 7 indexes
drop index if exists games_library.user_game_states_status_idx;

-- ============================================================
-- Phase 6: RLS + uuid unification (revert before dropping tables)
-- ============================================================

-- 3. Revoke RLS policies (order matters — drop policies before disabling RLS)
drop policy if exists insert_rate_limit on games_library.rate_limits;
drop policy if exists select_rate_limit on games_library.rate_limits;

drop policy if exists insert_audit_log on games_library.audit_log;
drop policy if exists select_audit_log on games_library.audit_log;

-- 4. Disable RLS on tables where we added it
alter table games_library.rate_limits disable row level security;
alter table games_library.audit_log disable row level security;

-- 5. Revert user_id type: uuid -> text (must happen before table drops)
alter table games_library.rate_limits
  alter column user_id type text using user_id::text;

alter table games_library.audit_log
  alter column user_id type text using user_id::text;

-- 6. Revert audit_log grants
grant insert on games_library.audit_log to anon;

-- 7. Restore old get_audit_log signature (text parameter)
drop function if exists games_library.get_audit_log(uuid, int);
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

-- ============================================================
-- Phase 3-5: user_game_states, audit_log, rate_limits
-- ============================================================

-- 8. Drop user_game_states trigger, function, table
drop trigger if exists sync_profile_game_states_trigger on games_library.user_game_states;
drop function if exists games_library.sync_profile_game_states();
drop function if exists games_library.get_game_states(text);
drop function if exists games_library.upsert_game_state(text, text, text, numeric, boolean, boolean, boolean, text);
drop function if exists games_library.delete_game_state(text, text);
drop table if exists games_library.user_game_states;

-- 9. Drop audit_log table
drop table if exists games_library.audit_log;

-- 10. Drop rate_limits table (has user_id column already reverted to text)
drop table if exists games_library.rate_limits;

-- 11. Drop security enhancements that reference rate_limits already dropped
drop function if exists games_library.get_audit_log(text, int);

-- ============================================================
-- Phase 1-2: profile fixes, tags, aliases sync
-- ============================================================

-- 12. Restore anon access to profiles
grant select, insert, update on games_library.profiles to anon;

-- 13. Drop SECURITY DEFINER functions
drop function if exists games_library.get_profile(text);
drop function if exists games_library.upsert_profile(text, jsonb, jsonb, jsonb);
drop function if exists games_library.delete_profile(text);
drop function if exists games_library.migrate_profile(text, text, jsonb);

-- 14. Drop tags.name column
alter table games_library.tags drop column if exists name;

-- 15. Drop game_aliases sync trigger
drop trigger if exists game_aliases_sync on games_library.game_aliases;
drop function if exists games_library.sync_game_aliases();

-- 16. Drop game_aliases(game_id) index
drop index if exists games_library.game_aliases_game_idx;

-- 17. Revert user_id to text (must happen before creating text-based policies)
drop policy if exists select_own_profile on games_library.profiles;
drop policy if exists insert_own_profile on games_library.profiles;
drop policy if exists update_own_profile on games_library.profiles;

alter table games_library.profiles
  alter column user_id type text using user_id::text;

-- 18. Recreate RLS policies with text comparison
create policy select_own_profile
  on games_library.profiles
  for select
  to authenticated
  using ((select auth.uid())::text = user_id);

create policy insert_own_profile
  on games_library.profiles
  for insert
  to authenticated
  with check ((select auth.uid())::text = user_id);

create policy update_own_profile
  on games_library.profiles
  for update
  to authenticated
  using ((select auth.uid())::text = user_id)
  with check ((select auth.uid())::text = user_id);
