-- Merge executor for reviewed duplicate games.
-- This migration creates the tool but does not approve or execute any merges.
begin;

create schema if not exists games_library_private;

comment on schema games_library_private is
  'Private maintenance helpers for games_library. Not exposed through Supabase Data API.';

revoke all on schema games_library_private from public, anon, authenticated;
grant usage on schema games_library_private to service_role;

create table if not exists games_library_private.game_duplicate_merge_runs (
  run_id           uuid primary key default gen_random_uuid(),
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  groups_processed int not null default 0 check (groups_processed >= 0),
  games_retired    int not null default 0 check (games_retired >= 0),
  notes            text not null default ''
);

comment on table games_library_private.game_duplicate_merge_runs is
  'Private audit record for reviewed duplicate merge executions.';

create table if not exists games_library_private.game_duplicate_merge_items (
  run_id                 uuid not null references games_library_private.game_duplicate_merge_runs(run_id) on delete cascade,
  group_key              text not null,
  loser_game_id          text not null,
  winner_game_id         text not null references games_library.games(game_id) on update cascade on delete restrict,
  loser_snapshot         jsonb not null,
  winner_snapshot_before jsonb not null,
  created_at             timestamptz not null default now(),
  primary key (run_id, loser_game_id)
);

comment on table games_library_private.game_duplicate_merge_items is
  'Per-loser snapshot audit for duplicate merges. Loser IDs are text by design because loser games can be deleted after redirect creation.';

create index if not exists game_duplicate_merge_items_winner_idx
  on games_library_private.game_duplicate_merge_items (winner_game_id);

alter table games_library_private.game_duplicate_merge_runs enable row level security;
alter table games_library_private.game_duplicate_merge_items enable row level security;

drop policy if exists service_role_manage_game_duplicate_merge_runs
  on games_library_private.game_duplicate_merge_runs;
create policy service_role_manage_game_duplicate_merge_runs
  on games_library_private.game_duplicate_merge_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_game_duplicate_merge_items
  on games_library_private.game_duplicate_merge_items;
create policy service_role_manage_game_duplicate_merge_items
  on games_library_private.game_duplicate_merge_items
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library_private.game_duplicate_merge_runs
  from public, anon, authenticated;
revoke all on table games_library_private.game_duplicate_merge_items
  from public, anon, authenticated;
grant select, insert, update, delete on table games_library_private.game_duplicate_merge_runs
  to service_role;
grant select, insert, update, delete on table games_library_private.game_duplicate_merge_items
  to service_role;

create or replace function games_library_private.apply_approved_game_duplicate_merges(
  p_limit int default null
) returns table(
  run_id uuid,
  groups_processed int,
  games_retired int,
  redirects_created int,
  platforms_moved int,
  tags_moved int,
  aliases_moved int,
  user_states_moved int
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_run_id uuid := gen_random_uuid();
  v_groups int := 0;
  v_retired int := 0;
  v_redirects int := 0;
  v_platforms int := 0;
  v_tags int := 0;
  v_aliases int := 0;
  v_user_states int := 0;
  v_count int := 0;
  merge_row record;
begin
  if p_limit is not null and (p_limit < 1 or p_limit > 1000) then
    raise exception 'p_limit must be between 1 and 1000';
  end if;

  insert into games_library_private.game_duplicate_merge_runs (run_id, notes)
  values (v_run_id, 'approved duplicate merge execution');

  for merge_row in
    with keep_rows as (
      select group_key, game_id as winner_game_id
      from games_library.game_duplicate_candidates
      where proposed_action = 'keep'
    ),
    eligible_groups as (
      select
        g.group_key,
        k.winner_game_id
      from games_library.game_duplicate_groups g
      join keep_rows k on k.group_key = g.group_key
      where g.status = 'approved'
        and (
          select count(*)
          from games_library.game_duplicate_candidates c
          where c.group_key = g.group_key
            and c.proposed_action = 'keep'
        ) = 1
        and exists (
          select 1
          from games_library.game_duplicate_candidates c
          where c.group_key = g.group_key
            and c.proposed_action = 'merge_into_winner'
        )
        and not exists (
          select 1
          from games_library.game_duplicate_candidates c
          where c.group_key = g.group_key
            and c.proposed_action not in ('keep', 'merge_into_winner')
        )
        and not exists (
          select 1
          from games_library.game_duplicate_candidates c
          where c.group_key = g.group_key
            and c.proposed_action = 'merge_into_winner'
            and c.winner_game_id is distinct from k.winner_game_id
        )
      order by g.group_key
      limit coalesce(p_limit, 1000)
    )
    select
      eg.group_key,
      eg.winner_game_id,
      c.game_id as loser_game_id
    from eligible_groups eg
    join games_library.game_duplicate_candidates c
      on c.group_key = eg.group_key
     and c.proposed_action = 'merge_into_winner'
    order by eg.group_key, c.game_id
  loop
    insert into games_library_private.game_duplicate_merge_items (
      run_id,
      group_key,
      loser_game_id,
      winner_game_id,
      loser_snapshot,
      winner_snapshot_before
    )
    select
      v_run_id,
      merge_row.group_key,
      merge_row.loser_game_id,
      merge_row.winner_game_id,
      to_jsonb(l),
      to_jsonb(w)
    from games_library.games l
    join games_library.games w on w.game_id = merge_row.winner_game_id
    where l.game_id = merge_row.loser_game_id;

    update games_library.games w
    set
      aliases = coalesce((
        select array_agg(distinct alias_value order by alias_value)
        from unnest(w.aliases || l.aliases || array[l.title]) as alias_value
        where btrim(alias_value) <> ''
          and alias_value <> w.title
      ), '{}'::text[]),
      tags = coalesce((
        select array_agg(distinct tag_value order by tag_value)
        from unnest(w.tags || l.tags) as tag_value
        where btrim(tag_value) <> ''
      ), '{}'::text[]),
      release_year = case
        when w.release_year = 0 and l.release_year <> 0 then l.release_year
        else w.release_year
      end,
      sort_date = case
        when w.sort_date = date '1970-01-01' and l.sort_date <> date '1970-01-01' then l.sort_date
        else w.sort_date
      end,
      release_label = case
        when btrim(w.release_label) = '' and btrim(l.release_label) <> '' then l.release_label
        else w.release_label
      end,
      cover_url = case
        when btrim(w.cover_url) = '' and btrim(l.cover_url) <> '' then l.cover_url
        else w.cover_url
      end,
      genre_id = coalesce(w.genre_id, l.genre_id),
      series_id = coalesce(w.series_id, l.series_id),
      notes = case
        when btrim(l.notes) = '' then w.notes
        when btrim(w.notes) = '' then l.notes
        when position(l.notes in w.notes) > 0 then w.notes
        else w.notes || E'\nMerged duplicate notes from ' || l.game_id || ': ' || l.notes
      end,
      updated_at = now()
    from games_library.games l
    where w.game_id = merge_row.winner_game_id
      and l.game_id = merge_row.loser_game_id;

    insert into games_library.game_platforms (game_id, platform_id)
    select merge_row.winner_game_id, platform_id
    from games_library.game_platforms
    where game_id = merge_row.loser_game_id
    on conflict (game_id, platform_id) do nothing;
    get diagnostics v_count = row_count;
    v_platforms := v_platforms + v_count;

    insert into games_library.game_tags (game_id, tag_id)
    select merge_row.winner_game_id, tag_id
    from games_library.game_tags
    where game_id = merge_row.loser_game_id
    on conflict (game_id, tag_id) do nothing;
    get diagnostics v_count = row_count;
    v_tags := v_tags + v_count;

    insert into games_library.game_aliases (game_id, alias)
    select merge_row.winner_game_id, alias
    from games_library.game_aliases
    where game_id = merge_row.loser_game_id
    union
    select merge_row.winner_game_id, title
    from games_library.games
    where game_id = merge_row.loser_game_id
      and btrim(title) <> ''
    on conflict (game_id, alias) do nothing;
    get diagnostics v_count = row_count;
    v_aliases := v_aliases + v_count;

    insert into games_library.user_game_states (
      user_id,
      game_id,
      status,
      rating,
      in_backlog,
      in_wishlist,
      excluded,
      source,
      created_at,
      updated_at
    )
    select
      user_id,
      merge_row.winner_game_id,
      status,
      rating,
      in_backlog,
      in_wishlist,
      excluded,
      source,
      created_at,
      updated_at
    from games_library.user_game_states
    where game_id = merge_row.loser_game_id
    on conflict (user_id, game_id) do update set
      status = coalesce(excluded.status, games_library.user_game_states.status),
      rating = coalesce(excluded.rating, games_library.user_game_states.rating),
      in_backlog = games_library.user_game_states.in_backlog or excluded.in_backlog,
      in_wishlist = games_library.user_game_states.in_wishlist or excluded.in_wishlist,
      excluded = games_library.user_game_states.excluded and excluded.excluded,
      source = case
        when games_library.user_game_states.source = 'manual' then games_library.user_game_states.source
        else excluded.source
      end,
      created_at = least(games_library.user_game_states.created_at, excluded.created_at),
      updated_at = greatest(games_library.user_game_states.updated_at, excluded.updated_at);
    get diagnostics v_count = row_count;
    v_user_states := v_user_states + v_count;

    update games_library.profiles p
    set
      game_states = case
        when p.game_states ? merge_row.winner_game_id then p.game_states - merge_row.loser_game_id
        else (p.game_states - merge_row.loser_game_id) ||
          jsonb_build_object(
            merge_row.winner_game_id,
            jsonb_set(
              p.game_states -> merge_row.loser_game_id,
              '{gameId}',
              to_jsonb(merge_row.winner_game_id)
            )
          )
      end,
      updated_at = now()
    where p.game_states ? merge_row.loser_game_id;

    delete from games_library.user_game_states
    where game_id = merge_row.loser_game_id;

    insert into games_library.game_redirects (
      from_game_id,
      to_game_id,
      reason,
      notes,
      created_by
    )
    values (
      merge_row.loser_game_id,
      merge_row.winner_game_id,
      'duplicate_merge',
      'Approved duplicate merge from group ' || merge_row.group_key,
      'games_library_private.apply_approved_game_duplicate_merges'
    )
    on conflict (from_game_id) do update set
      to_game_id = excluded.to_game_id,
      reason = excluded.reason,
      notes = excluded.notes,
      created_by = excluded.created_by,
      updated_at = now();
    get diagnostics v_count = row_count;
    v_redirects := v_redirects + v_count;

    delete from games_library.series_cleanup_applied
    where game_id = merge_row.loser_game_id;

    delete from games_library.game_duplicate_candidates
    where group_key = merge_row.group_key
      and game_id = merge_row.loser_game_id;

    delete from games_library.games
    where game_id = merge_row.loser_game_id;
    get diagnostics v_count = row_count;
    v_retired := v_retired + v_count;
  end loop;

  update games_library.game_duplicate_groups g
  set
    status = 'merged',
    review_notes = case
      when btrim(g.review_notes) = '' then 'Merged by run ' || v_run_id::text
      else g.review_notes || E'\nMerged by run ' || v_run_id::text
    end,
    reviewed_at = coalesce(g.reviewed_at, now()),
    updated_at = now()
  where g.status = 'approved'
    and exists (
      select 1
      from games_library_private.game_duplicate_merge_items i
      where i.run_id = v_run_id
        and i.group_key = g.group_key
    );
  get diagnostics v_groups = row_count;

  update games_library_private.game_duplicate_merge_runs
  set
    completed_at = now(),
    groups_processed = v_groups,
    games_retired = v_retired
  where game_duplicate_merge_runs.run_id = v_run_id;

  return query
  select
    v_run_id,
    v_groups,
    v_retired,
    v_redirects,
    v_platforms,
    v_tags,
    v_aliases,
    v_user_states;
end;
$$;

comment on function games_library_private.apply_approved_game_duplicate_merges(int) is
  'Executes only explicitly approved duplicate groups: enriches the winner, moves joins and user state, creates redirects, audits snapshots, and deletes loser games.';

revoke all on function games_library_private.apply_approved_game_duplicate_merges(int)
  from public, anon, authenticated;
grant execute on function games_library_private.apply_approved_game_duplicate_merges(int)
  to service_role;

commit;

-- Down:
-- begin;
-- drop function if exists games_library_private.apply_approved_game_duplicate_merges(int);
-- drop table if exists games_library_private.game_duplicate_merge_items;
-- drop table if exists games_library_private.game_duplicate_merge_runs;
-- commit;
