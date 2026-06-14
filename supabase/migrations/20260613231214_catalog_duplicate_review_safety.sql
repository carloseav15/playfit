-- Catalog duplicate review and redirect safety scaffolding.
-- This migration is intentionally non-destructive: it adds review/redirect
-- surfaces and populates a review queue, but does not merge or delete games.
begin;

create schema if not exists games_library_private;

comment on schema games_library_private is
  'Private maintenance helpers for games_library. Not exposed through Supabase Data API.';

revoke all on schema games_library_private from public, anon, authenticated;
grant usage on schema games_library_private to service_role;

-- ============================================================
-- 1. Redirects preserve old game IDs after reviewed merges
-- ============================================================
create table if not exists games_library.game_redirects (
  from_game_id text primary key,
  to_game_id   text not null references games_library.games(game_id) on update cascade on delete restrict,
  reason       text not null default 'duplicate_merge',
  notes        text not null default '',
  created_by   text not null default 'manual',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint game_redirects_no_self_redirect check (from_game_id <> to_game_id),
  constraint game_redirects_reason_check check (
    reason in ('duplicate_merge', 'manual_id_change', 'source_cleanup', 'catalog_retirement')
  )
);

comment on table games_library.game_redirects is
  'Maps retired game IDs to canonical game IDs after reviewed catalog cleanup.';
comment on column games_library.game_redirects.from_game_id is
  'Retired or non-canonical game ID. No FK by design so redirects survive hard deletes.';
comment on column games_library.game_redirects.to_game_id is
  'Canonical live games.game_id target.';

create index if not exists game_redirects_to_game_idx
  on games_library.game_redirects (to_game_id);

alter table games_library.game_redirects enable row level security;

drop policy if exists service_role_manage_game_redirects on games_library.game_redirects;
create policy service_role_manage_game_redirects
  on games_library.game_redirects
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library.game_redirects from public, anon, authenticated;
grant select, insert, update, delete on table games_library.game_redirects to service_role;

drop trigger if exists game_redirects_set_updated_at on games_library.game_redirects;
create trigger game_redirects_set_updated_at
  before update on games_library.game_redirects
  for each row
  execute function games_library.set_updated_at();

-- ============================================================
-- 2. Persistent duplicate review queue
-- ============================================================
create table if not exists games_library.game_duplicate_groups (
  group_key           text primary key,
  candidate_count     int not null check (candidate_count > 1),
  known_year_count    int not null default 0 check (known_year_count >= 0),
  source_type_count   int not null default 0 check (source_type_count >= 0),
  has_edition_keyword boolean not null default false,
  suggested_review    text not null default 'needs_review',
  status              text not null default 'needs_review',
  review_notes        text not null default '',
  reviewed_by         text,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint game_duplicate_groups_suggested_review_check check (
    suggested_review in ('needs_review', 'merge_candidate', 'manual_year_review', 'preserve_edition_review')
  ),
  constraint game_duplicate_groups_status_check check (
    status in ('needs_review', 'reviewed', 'approved', 'merged', 'rejected', 'ignored')
  )
);

comment on table games_library.game_duplicate_groups is
  'Review groups for source-agnostic, edition-aware game deduplication.';
comment on column games_library.game_duplicate_groups.group_key is
  'Normalized title key used to group candidate duplicates.';
comment on column games_library.game_duplicate_groups.suggested_review is
  'Machine-generated starting point. Human review controls final status.';

create table if not exists games_library.game_duplicate_candidates (
  group_key           text not null references games_library.game_duplicate_groups(group_key) on update cascade on delete cascade,
  game_id             text not null references games_library.games(game_id) on update cascade on delete restrict,
  title               text not null,
  source_type         text not null,
  source_ref          text not null default '',
  release_year        int not null,
  has_edition_keyword boolean not null default false,
  platform_count      int not null default 0 check (platform_count >= 0),
  tag_count           int not null default 0 check (tag_count >= 0),
  alias_count         int not null default 0 check (alias_count >= 0),
  has_cover           boolean not null default false,
  proposed_action     text not null default 'needs_review',
  winner_game_id      text references games_library.games(game_id) on update cascade on delete restrict,
  review_notes        text not null default '',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (group_key, game_id),
  constraint game_duplicate_candidates_winner_not_self check (
    winner_game_id is null or winner_game_id <> game_id
  ),
  constraint game_duplicate_candidates_proposed_action_check check (
    proposed_action in ('needs_review', 'keep', 'merge_into_winner', 'preserve_edition', 'not_duplicate')
  )
);

comment on table games_library.game_duplicate_candidates is
  'Per-game duplicate review queue. These rows protect games from casual hard deletes while review is pending.';
comment on column games_library.game_duplicate_candidates.proposed_action is
  'Human-reviewed action. Refreshes update snapshots but do not overwrite this field.';
comment on column games_library.game_duplicate_candidates.winner_game_id is
  'Canonical target when proposed_action is merge_into_winner.';

create index if not exists game_duplicate_candidates_game_idx
  on games_library.game_duplicate_candidates (game_id);

create index if not exists game_duplicate_candidates_winner_idx
  on games_library.game_duplicate_candidates (winner_game_id)
  where winner_game_id is not null;

create index if not exists game_duplicate_candidates_action_idx
  on games_library.game_duplicate_candidates (proposed_action, group_key);

alter table games_library.game_duplicate_groups enable row level security;
alter table games_library.game_duplicate_candidates enable row level security;

drop policy if exists service_role_manage_game_duplicate_groups on games_library.game_duplicate_groups;
create policy service_role_manage_game_duplicate_groups
  on games_library.game_duplicate_groups
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_game_duplicate_candidates on games_library.game_duplicate_candidates;
create policy service_role_manage_game_duplicate_candidates
  on games_library.game_duplicate_candidates
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library.game_duplicate_groups from public, anon, authenticated;
revoke all on table games_library.game_duplicate_candidates from public, anon, authenticated;
grant select, insert, update, delete on table games_library.game_duplicate_groups to service_role;
grant select, insert, update, delete on table games_library.game_duplicate_candidates to service_role;

drop trigger if exists game_duplicate_groups_set_updated_at on games_library.game_duplicate_groups;
create trigger game_duplicate_groups_set_updated_at
  before update on games_library.game_duplicate_groups
  for each row
  execute function games_library.set_updated_at();

drop trigger if exists game_duplicate_candidates_set_updated_at on games_library.game_duplicate_candidates;
create trigger game_duplicate_candidates_set_updated_at
  before update on games_library.game_duplicate_candidates
  for each row
  execute function games_library.set_updated_at();

-- ============================================================
-- 3. Live candidate source view
-- ============================================================
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
      lower(g.title) ~ '(remaster|remastered|remake|definitive|director.?s cut|collection|trilogy|anniversary|final cut|special|deluxe|complete|enhanced|goty|game of the year)'
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
  'Live source query for duplicate review candidates. Uses normalized title keys; review required before merge/delete.';

revoke all on table games_library.game_duplicate_candidate_source from public, anon, authenticated;
grant select on table games_library.game_duplicate_candidate_source to service_role;

-- ============================================================
-- 4. Internal refresh helper for the persistent review queue
-- ============================================================
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

-- Seed the initial local review queue. This only writes review metadata.
do $$
begin
  perform * from games_library_private.refresh_game_duplicate_candidates();
end;
$$;

commit;

-- Down:
-- begin;
-- drop function if exists games_library_private.refresh_game_duplicate_candidates();
-- drop view if exists games_library.game_duplicate_candidate_source;
-- drop trigger if exists game_duplicate_candidates_set_updated_at on games_library.game_duplicate_candidates;
-- drop trigger if exists game_duplicate_groups_set_updated_at on games_library.game_duplicate_groups;
-- drop trigger if exists game_redirects_set_updated_at on games_library.game_redirects;
-- drop table if exists games_library.game_duplicate_candidates;
-- drop table if exists games_library.game_duplicate_groups;
-- drop table if exists games_library.game_redirects;
-- drop schema if exists games_library_private;
-- commit;
