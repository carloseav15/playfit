begin;

-- Backfill series_ref (bigint FK) for all games where series_id (text) is set but series_ref is NULL
update games_library.games g
set series_ref = s.pk
from games_library.series s
where g.series_id = s.id
  and g.series_ref is null;

commit;
