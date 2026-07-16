-- The search fallback uses ILIKE '%term%' for titles and aliases. Plain btree
-- indexes cannot accelerate a leading-wildcard predicate, while trigram GIN
-- indexes can. Keep this migration additive and safe to re-run.
create extension if not exists pg_trgm with schema extensions;

create index if not exists games_title_trgm_idx
  on games_library.games using gin (title extensions.gin_trgm_ops);

create index if not exists game_aliases_alias_trgm_idx
  on games_library.game_aliases using gin (alias extensions.gin_trgm_ops);
