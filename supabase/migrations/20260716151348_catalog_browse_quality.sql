-- Stable, reversible quality ordering for catalog browse.
-- This view never removes records; it only exposes a deterministic score so
-- the API can rank well-described catalog entries before paginating.
create or replace view games_library.game_catalog_browse
with (security_invoker = true)
as
select
  game_id,
  title,
  (
    case
      when title ~ '^[[:alpha:]]' then 20
      when title ~ '^[[:digit:]]' then 12
      else 0
    end
    + case when nullif(trim(coalesce(cover_url, '')), '') is not null then 8 else 0 end
    + case
        when genre_id is not null and lower(genre_id) <> 'unknown' then 4
        else 0
      end
    + case when coalesce(array_length(tags, 1), 0) > 0 then 4 else 0 end
    + case when release_year is not null then 2 else 0 end
    + case when nullif(trim(coalesce(source_ref, '')), '') is not null then 2 else 0 end
  )::int as quality_score
from games_library.games;

grant select on table games_library.game_catalog_browse to anon, authenticated, service_role;
