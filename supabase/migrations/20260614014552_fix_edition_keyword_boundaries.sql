-- Tighten edition/remaster keyword detection so substrings like "Recollection"
-- do not get treated as "collection".
begin;

create or replace view games_library.game_duplicate_candidate_source
with (security_invoker = true)
as
with norm as (
  select
    g.game_id,
    g.title,
    g.source_type,
    g.source_ref,
    g.release_year,
    regexp_replace(lower(g.title), '[^a-z0-9]+', '', 'g') as group_key,
    (
      lower(g.title) ~ '(^|[^a-z0-9])(remaster|remastered|remake|definitive|collection|trilogy|anniversary|special|deluxe|complete|enhanced|goty)([^a-z0-9]|$)'
      or lower(g.title) ~ '(^|[^a-z0-9])(director.?s cut|final cut|game of the year)([^a-z0-9]|$)'
      or lower(g.title) ~ '(^|[^a-z0-9])hd([^a-z0-9]|$)'
    ) as has_edition_keyword,
    coalesce(pc.platform_count, 0) as platform_count,
    coalesce(tc.tag_count, 0) as tag_count,
    coalesce(ac.alias_count, 0) + cardinality(g.aliases) as alias_count,
    coalesce(g.cover_url, '') <> '' as has_cover
  from games_library.games g
  left join (
    select game_id, count(*)::int as platform_count
    from games_library.game_platforms
    group by game_id
  ) pc using (game_id)
  left join (
    select game_id, count(*)::int as tag_count
    from games_library.game_tags
    group by game_id
  ) tc using (game_id)
  left join (
    select game_id, count(*)::int as alias_count
    from games_library.game_aliases
    group by game_id
  ) ac using (game_id)
),
groups as (
  select
    group_key,
    count(*)::int as candidate_count,
    count(distinct nullif(release_year, 0))::int as known_year_count,
    count(distinct source_type)::int as source_type_count,
    bool_or(has_edition_keyword) as group_has_edition_keyword
  from norm
  group by group_key
  having count(*) > 1
)
select
  n.group_key,
  n.game_id,
  n.title,
  n.source_type,
  n.source_ref,
  n.release_year,
  n.has_edition_keyword,
  n.platform_count,
  n.tag_count,
  n.alias_count,
  n.has_cover,
  g.candidate_count,
  g.known_year_count,
  g.source_type_count,
  g.group_has_edition_keyword as has_group_edition_keyword,
  case
    when g.group_has_edition_keyword then 'preserve_edition_review'
    when g.known_year_count > 1 then 'manual_year_review'
    else 'merge_candidate'
  end as suggested_review
from norm n
join groups g using (group_key);

comment on view games_library.game_duplicate_candidate_source is
  'Live source query for duplicate review candidates. Uses normalized title keys; review required before merge/delete. Edition keywords require word boundaries.';

revoke all on table games_library.game_duplicate_candidate_source from public, anon, authenticated;
grant select on table games_library.game_duplicate_candidate_source to service_role;

select * from games_library_private.refresh_game_duplicate_candidates();
select * from games_library_private.propose_game_duplicate_actions();

commit;

-- Down:
-- Reapply the original broad substring detector from 20260613231214 if needed,
-- then run games_library_private.refresh_game_duplicate_candidates().
