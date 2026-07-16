-- Clears the way for the squashed baseline migration
-- (20260707120000_baseline_schema.sql). IF EXISTS makes this a no-op on an
-- already-clean database (e.g. local, which never had these schemas
-- dropped), and the actual clean-slate step on any environment still
-- carrying the old incremental schema (e.g. production).
drop schema if exists games_library cascade;
drop schema if exists games_library_private cascade;
drop schema if exists igdb_raw cascade;
