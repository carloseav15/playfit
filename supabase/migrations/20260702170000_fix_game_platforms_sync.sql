-- Fix games.platforms / games.platform_names denormalization drift.
--
-- Root cause: games_library.game_tags and games_library.game_aliases each
-- have an AFTER INSERT/DELETE trigger (sync_game_tags, sync_game_aliases)
-- that keeps the corresponding denormalized array on games in sync. No
-- equivalent trigger was ever created for games_library.game_platforms, so
-- games.platforms / games.platform_names only ever reflected whatever was
-- true at initial ingestion time and silently drifted from
-- games_library.game_platforms as rows were added/removed later. A data
-- quality audit found 31,048 games (48.7% of the catalog) with a mismatch,
-- almost all of them with an empty games.platforms array despite
-- game_platforms having real rows.
--
-- This migration adds the missing trigger (mirroring the tags/aliases
-- pattern exactly) and backfills every existing game so both arrays match
-- game_platforms, ordered by platform_id for positional correspondence
-- between platforms and platform_names.
begin;

create or replace function games_library.sync_game_platforms()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_game_id text;
begin
  v_game_id := coalesce(new.game_id, old.game_id);

  update games_library.games g
  set
    platforms = coalesce((
      select array_agg(gp.platform_id order by gp.platform_id)
      from games_library.game_platforms gp
      where gp.game_id = v_game_id
    ), '{}'::text[]),
    platform_names = coalesce((
      select array_agg(p.name order by p.id)
      from games_library.game_platforms gp
      join games_library.platforms p on p.id = gp.platform_id
      where gp.game_id = v_game_id
    ), '{}'::text[])
  where g.game_id = v_game_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

comment on function games_library.sync_game_platforms() is
  'Keeps games.platforms and games.platform_names in sync with games_library.game_platforms, mirroring sync_game_tags/sync_game_aliases.';

drop trigger if exists game_platforms_sync on games_library.game_platforms;
create trigger game_platforms_sync
  after insert or delete on games_library.game_platforms
  for each row execute function games_library.sync_game_platforms();

-- Backfill: recompute both arrays for every game from the current
-- game_platforms join table, in one pass.
with agg as (
  select
    gp.game_id,
    array_agg(gp.platform_id order by gp.platform_id) as platform_ids,
    array_agg(p.name order by p.id) as platform_names
  from games_library.game_platforms gp
  join games_library.platforms p on p.id = gp.platform_id
  group by gp.game_id
)
update games_library.games g
set
  platforms = coalesce(agg.platform_ids, '{}'::text[]),
  platform_names = coalesce(agg.platform_names, '{}'::text[])
from agg
where g.game_id = agg.game_id
  and (g.platforms is distinct from agg.platform_ids
    or g.platform_names is distinct from agg.platform_names);

-- Any game with no game_platforms rows at all should have empty arrays too
-- (covers games that previously had a stale non-empty array with no backing
-- join rows, if any exist).
update games_library.games g
set platforms = '{}'::text[], platform_names = '{}'::text[]
where (cardinality(g.platforms) > 0 or cardinality(g.platform_names) > 0)
  and not exists (
    select 1 from games_library.game_platforms gp where gp.game_id = g.game_id
  );

commit;

-- Down:
-- begin;
-- drop trigger if exists game_platforms_sync on games_library.game_platforms;
-- drop function if exists games_library.sync_game_platforms();
-- commit;
-- Note: the backfill itself is not reversible (previous stale array values
-- are not stored anywhere), but the backfilled values are strictly more
-- correct than what they replaced.
