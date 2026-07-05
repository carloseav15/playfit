-- Tracks the cover_url a game had right before it was cleared by the
-- /admin/covers review UI, so removals can be analyzed by origin/undone
-- later without needing a separate audit table.
alter table games_library.games
  add column if not exists previous_cover_url text;
