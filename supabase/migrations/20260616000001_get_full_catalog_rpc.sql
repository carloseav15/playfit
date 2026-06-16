-- Migration: get_full_catalog RPC
-- Single function returning the full game catalog in one round-trip
-- Replaces ~46 sequential paginated queries with one RPC call

create or replace function games_library.get_full_catalog()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'games', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'game_id', g.game_id,
            'title', g.title,
            'aliases', g.aliases,
            'series_id', g.series_id,
            'genre_id', g.genre_id,
            'release_year', g.release_year,
            'release_state', g.release_state,
            'source_type', g.source_type,
            'source_ref', g.source_ref,
            'cover_url', g.cover_url,
            'tags', g.tags,
            'notes', g.notes,
            'sort_date', g.sort_date::text,
            'release_label', g.release_label,
            'series', case when g.series_id is not null
              then jsonb_build_object('name', s.name)
              else null::jsonb
            end,
            'genre', case when g.genre_id is not null
              then jsonb_build_object('name', gn.name)
              else null::jsonb
            end
          )
          order by g.title
        )
        from games_library.games g
        left join games_library.series s on s.id = g.series_id
        left join games_library.genres gn on gn.id = g.genre_id
      ),
      '[]'::jsonb
    ),
    'platforms', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'game_id', gp.game_id,
            'platform_id', gp.platform_id,
            'platforms', jsonb_build_object('name', p.name)
          )
        )
        from games_library.game_platforms gp
        join games_library.platforms p on p.id = gp.platform_id
      ),
      '[]'::jsonb
    ),
    'aliases', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'game_id', ga.game_id,
            'alias', ga.alias
          )
        )
        from games_library.game_aliases ga
      ),
      '[]'::jsonb
    )
  );
$$;

grant execute on function games_library.get_full_catalog to anon, authenticated, service_role;

-- Down:
-- drop function if exists games_library.get_full_catalog;
-- revoke execute on function games_library.get_full_catalog from anon, authenticated, service_role;
