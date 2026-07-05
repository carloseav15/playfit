-- series pre-existed but was missing insert/update/delete grants for
-- service_role (only had select) - discovered while backfilling series_id
-- from IGDB franchises/collections, which needs to create new series rows.
grant insert, update, delete on games_library.series to service_role;

-- New taxonomy tables (game_modes, themes, perspectives) need the same
-- grant pattern as other public-readable, service-role-writable tables
-- (e.g. genres, game_genres): select for anon/authenticated, full access
-- for service_role. RLS policies alone are not enough without these grants.
grant select on games_library.game_modes to anon, authenticated;
grant select on games_library.game_game_modes to anon, authenticated;
grant select on games_library.themes to anon, authenticated;
grant select on games_library.game_themes to anon, authenticated;
grant select on games_library.perspectives to anon, authenticated;
grant select on games_library.game_perspectives to anon, authenticated;

grant all privileges on games_library.game_modes to service_role;
grant all privileges on games_library.game_game_modes to service_role;
grant all privileges on games_library.themes to service_role;
grant all privileges on games_library.game_themes to service_role;
grant all privileges on games_library.perspectives to service_role;
grant all privileges on games_library.game_perspectives to service_role;
