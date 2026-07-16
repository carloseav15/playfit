-- Production only needs the 14 tables the web app (and iOS/Android via the
-- Next.js API) actually query, plus 3 tables kept empty because dropping
-- them would break live functionality even though nothing reads from them
-- directly:
--   - genres: games.search_document (generated column) calls
--     get_genre_name(genre_id), which queries this table on every INSERT/
--     UPDATE of games. Drop it and any future write to games errors.
--   - tags, game_tags: games_tags_array_sync (trigger on games, fires on
--     UPDATE OF tags) inserts into game_tags on every write. Drop either
--     and any future tags update on games errors.
-- Everything else here was local-only tooling output (games_library_private
-- audit/staging/scratch tables, igdb_raw mirror) or taxonomy/enrichment
-- data nothing in production reads (themes, perspectives, game_modes,
-- game_engines and their junctions, game_age_ratings, game_companies,
-- game_releases, game_summaries, review/sales snapshots, external-id
-- matching queues, duplicate-review tables, series cleanup queues,
-- game_genres).
begin;

drop schema if exists games_library_private cascade;
drop schema if exists igdb_raw cascade;

drop table if exists games_library.game_duplicate_candidates cascade;
drop table if exists games_library.game_duplicate_groups cascade;
drop table if exists games_library.game_external_match_candidates cascade;
drop table if exists games_library.game_age_ratings cascade;
drop table if exists games_library.game_companies cascade;
drop table if exists games_library.game_engines cascade;
drop table if exists games_library.game_external_ids cascade;
drop table if exists games_library.game_game_engines cascade;
drop table if exists games_library.game_game_modes cascade;
drop table if exists games_library.game_genres cascade;
drop table if exists games_library.game_modes cascade;
drop table if exists games_library.game_multiplayer_modes cascade;
drop table if exists games_library.game_perspectives cascade;
drop table if exists games_library.game_review_sentiment_snapshots cascade;
drop table if exists games_library.game_sales_snapshots cascade;
drop table if exists games_library.game_summaries cascade;
drop table if exists games_library.game_releases cascade;
drop table if exists games_library.game_themes cascade;
drop table if exists games_library.perspectives cascade;
drop table if exists games_library.series_cleanup_applied cascade;
drop table if exists games_library.series_cleanup_candidates cascade;
drop table if exists games_library.themes cascade;

commit;
