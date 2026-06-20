-- RAWG scrape: table-level GRANTs for service_role
-- The RLS policies (20260620100000) need underlying table privileges.
-- Generated column search_document calls get_series_name()/get_genre_name()
-- which need SELECT on series/genres.
begin;

-- ============================================================
-- 1. Table-level GRANTs for service_role
-- ============================================================

-- genres: used by ensureGenres (upsert) + get_genre_name (generated column)
grant select, insert, delete, update on table games_library.genres to service_role;

-- tags: used by ensureTags (upsert)
grant select, insert, delete, update on table games_library.tags to service_role;

-- series: used by get_series_name (generated column search_document)
grant select on table games_library.series to service_role;

-- game_platforms: delete + insert pattern
grant select, insert, delete on table games_library.game_platforms to service_role;

-- game_tags: delete + insert pattern
grant select, insert, delete on table games_library.game_tags to service_role;

-- game_aliases: delete + insert pattern
grant select, insert, delete, update on table games_library.game_aliases to service_role;

commit;
