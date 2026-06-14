-- Move duplicate review refresh helper out of the exposed games_library schema.
begin;

create schema if not exists games_library_private;

comment on schema games_library_private is
  'Private maintenance helpers for games_library. Not exposed through Supabase Data API.';

revoke all on schema games_library_private from public, anon, authenticated;
grant usage on schema games_library_private to service_role;

drop function if exists games_library.refresh_game_duplicate_candidates();

create or replace function games_library_private.refresh_game_duplicate_candidates()
returns table(groups_upserted int, candidates_upserted int)
language plpgsql
set search_path = pg_catalog
as $$
declare
  v_groups int := 0;
  v_candidates int := 0;
begin
  with source_groups as (
    select distinct
      group_key,
      candidate_count,
      known_year_count,
      source_type_count,
      has_group_edition_keyword,
      suggested_review
    from games_library.game_duplicate_candidate_source
  ),
  upserted as (
    insert into games_library.game_duplicate_groups (
      group_key,
      candidate_count,
      known_year_count,
      source_type_count,
      has_edition_keyword,
      suggested_review
    )
    select
      group_key,
      candidate_count,
      known_year_count,
      source_type_count,
      has_group_edition_keyword,
      suggested_review
    from source_groups
    on conflict (group_key) do update set
      candidate_count = excluded.candidate_count,
      known_year_count = excluded.known_year_count,
      source_type_count = excluded.source_type_count,
      has_edition_keyword = excluded.has_edition_keyword,
      suggested_review = excluded.suggested_review,
      updated_at = now()
    returning 1
  )
  select count(*)::int into v_groups from upserted;

  with upserted as (
    insert into games_library.game_duplicate_candidates (
      group_key,
      game_id,
      title,
      source_type,
      source_ref,
      release_year,
      has_edition_keyword,
      platform_count,
      tag_count,
      alias_count,
      has_cover
    )
    select
      group_key,
      game_id,
      title,
      source_type,
      source_ref,
      release_year,
      has_edition_keyword,
      platform_count,
      tag_count,
      alias_count,
      has_cover
    from games_library.game_duplicate_candidate_source
    on conflict (group_key, game_id) do update set
      title = excluded.title,
      source_type = excluded.source_type,
      source_ref = excluded.source_ref,
      release_year = excluded.release_year,
      has_edition_keyword = excluded.has_edition_keyword,
      platform_count = excluded.platform_count,
      tag_count = excluded.tag_count,
      alias_count = excluded.alias_count,
      has_cover = excluded.has_cover,
      updated_at = now()
    returning 1
  )
  select count(*)::int into v_candidates from upserted;

  return query select v_groups, v_candidates;
end;
$$;

comment on function games_library_private.refresh_game_duplicate_candidates() is
  'Refreshes duplicate review queue from live catalog without overwriting human review decisions.';

revoke all on function games_library_private.refresh_game_duplicate_candidates() from public, anon, authenticated;
grant execute on function games_library_private.refresh_game_duplicate_candidates() to service_role;

commit;

-- Down:
-- begin;
-- drop function if exists games_library_private.refresh_game_duplicate_candidates();
-- drop schema if exists games_library_private;
-- commit;
