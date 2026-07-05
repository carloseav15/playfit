-- game_genres was missing insert/update/delete grants for service_role
-- (only had select), discovered while backfilling multi-genre links from
-- IGDB. Same gap pattern as series.
grant insert, update, delete on games_library.game_genres to service_role;
