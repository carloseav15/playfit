-- game_genres was also missing select for service_role - the prior grant
-- (insert/update/delete) still left reads failing for scripts that need to
-- check existing links before inserting.
grant select on games_library.game_genres to service_role;
