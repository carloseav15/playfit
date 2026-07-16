-- games_library.api_cache had RLS disabled, and its get_cache/set_cache
-- SECURITY DEFINER wrapper functions were granted to anon/authenticated.
-- Since the anon key is public by design, anyone could call set_cache with
-- any key (cache poisoning) or get_cache with any key (read other users'
-- cached recommendation payloads, keyed by profile id). The app only ever
-- calls these from server-side API routes, so restrict them to service_role
-- like the project's existing admin-only RPCs.
begin;

-- Both the explicit named grants (anon, authenticated) and the implicit
-- PUBLIC grant Postgres adds by default on function creation need
-- revoking - either one alone is enough to leave the function callable.
revoke execute on function games_library.get_cache(text) from public, anon, authenticated;
revoke execute on function games_library.set_cache(text, jsonb, integer) from public, anon, authenticated;

alter table games_library.api_cache enable row level security;

commit;
