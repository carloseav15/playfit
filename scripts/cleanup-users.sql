-- ============================================================
-- Cleanup: Remove all users from the database
-- This script removes:
--   1. All user game states (user_game_states)
--   2. All user profiles (profiles)
--   3. All audit log entries (audit_log)
--   4. All rate limit entries (rate_limits)
--   5. All auth users (auth.users) — cascades to identities, sessions, etc.
--
-- Run locally:  supabase db query --local -f scripts/cleanup-users.sql
-- Run in prod:  supabase db query --linked -f scripts/cleanup-users.sql
-- Or via psql:  psql "$DB_URL" -f scripts/cleanup-users.sql
-- ============================================================

begin;

-- 1. Delete user game states (catalog data preserved)
delete from games_library.user_game_states;

-- 2. Delete user profiles
delete from games_library.profiles;

-- 3. Delete audit log entries
delete from games_library.audit_log;

-- 4. Delete rate limit entries (not strictly user data, but clean for fresh testing)
delete from games_library.rate_limits;

-- 5. Delete all auth users (cascades to identities, sessions, MFA factors, etc.)
delete from auth.users;

commit;
