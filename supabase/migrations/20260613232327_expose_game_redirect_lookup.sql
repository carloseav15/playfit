-- Expose the minimal redirect lookup needed by public catalog reads.
begin;

drop policy if exists public_read_game_redirect_lookup on games_library.game_redirects;
create policy public_read_game_redirect_lookup
  on games_library.game_redirects
  for select
  to anon, authenticated
  using (true);

revoke all on table games_library.game_redirects from public, anon, authenticated;
grant select (from_game_id, to_game_id)
  on table games_library.game_redirects
  to anon, authenticated;

comment on policy public_read_game_redirect_lookup
  on games_library.game_redirects is
  'Allows public catalog routes to resolve retired game IDs while hiding review notes and write access.';

commit;

-- Down:
-- begin;
-- drop policy if exists public_read_game_redirect_lookup on games_library.game_redirects;
-- revoke all on table games_library.game_redirects from anon, authenticated;
-- commit;
