-- Fix a post-ingest empty game_id and prevent future blank catalog IDs.
begin;

do $$
declare
  v_empty_game_id text := '';
  v_temp_game_id text := '__playfit_empty_game_id_rawg_359801';
  v_winner_game_id text := 'game_aa8ca7ebc591';
  v_empty_rows int := 0;
  v_winner_rows int := 0;
  v_moved_scores int := 0;
  v_deleted_games int := 0;
  v_orphan_count int := 0;
begin
  select count(*)::int
  into v_empty_rows
  from games_library.games
  where game_id = v_empty_game_id
    and title = '仙剑奇侠传'
    and source_ref = 'rawg:359801';

  select count(*)::int
  into v_winner_rows
  from games_library.games
  where game_id = v_winner_game_id
    and title = '仙剑奇侠传'
    and source_ref = 'rawg:359801';

  if v_empty_rows = 0 then
    raise notice 'Empty game_id duplicate already absent; skipping merge.';
  elsif v_empty_rows <> 1 or v_winner_rows <> 1 then
    raise exception 'Expected exactly one empty duplicate and one winner, found empty %, winner %', v_empty_rows, v_winner_rows;
  else
    if exists (select 1 from games_library.games where game_id = v_temp_game_id) then
      raise exception 'Temporary game_id % already exists', v_temp_game_id;
    end if;

    update games_library.games
    set game_id = v_temp_game_id,
        updated_at = now()
    where game_id = v_empty_game_id
      and title = '仙剑奇侠传'
      and source_ref = 'rawg:359801';

    update games_library.games winner
    set
      aliases = coalesce((
        select array_agg(distinct alias_value order by alias_value)
        from unnest(winner.aliases || loser.aliases || array[loser.title]) as alias_value
        where btrim(alias_value) <> ''
          and alias_value <> winner.title
      ), '{}'::text[]),
      tags = coalesce((
        select array_agg(distinct tag_value order by tag_value)
        from unnest(winner.tags || loser.tags) as tag_value
        where btrim(tag_value) <> ''
      ), '{}'::text[]),
      sort_date = case
        when loser.sort_date is not null
          and loser.sort_date <> date '1970-01-01'
          and (
            winner.sort_date is null
            or winner.sort_date = date '1970-01-01'
            or (
              extract(day from winner.sort_date) = 1
              and extract(day from loser.sort_date) <> 1
              and date_trunc('month', winner.sort_date)::date = date_trunc('month', loser.sort_date)::date
            )
          )
          then loser.sort_date
        else winner.sort_date
      end,
      cover_url = case
        when btrim(coalesce(winner.cover_url, '')) = '' and btrim(coalesce(loser.cover_url, '')) <> '' then loser.cover_url
        else winner.cover_url
      end,
      release_label = case
        when btrim(coalesce(winner.release_label, '')) = '' and btrim(coalesce(loser.release_label, '')) <> '' then loser.release_label
        else winner.release_label
      end,
      notes = case
        when btrim(coalesce(winner.notes, '')) = '' then 'Merged duplicate with empty game_id from rawg:359801.'
        else winner.notes || E'\nMerged duplicate with empty game_id from rawg:359801.'
      end,
      updated_at = now()
    from games_library.games loser
    where winner.game_id = v_winner_game_id
      and loser.game_id = v_temp_game_id;

    insert into games_library.game_platforms (game_id, platform_id)
    select v_winner_game_id, platform_id
    from games_library.game_platforms
    where game_id = v_temp_game_id
    on conflict (game_id, platform_id) do nothing;

    insert into games_library.game_tags (game_id, tag_id)
    select v_winner_game_id, tag_id
    from games_library.game_tags
    where game_id = v_temp_game_id
    on conflict (game_id, tag_id) do nothing;

    insert into games_library.game_aliases (game_id, alias)
    select v_winner_game_id, alias
    from games_library.game_aliases
    where game_id = v_temp_game_id
    union
    select v_winner_game_id, title
    from games_library.games
    where game_id = v_temp_game_id
      and btrim(title) <> ''
    on conflict (game_id, alias) do nothing;

    insert into games_library.game_scores (
      game_id,
      platform_id,
      score_source,
      critic_score,
      critic_count,
      user_score,
      user_count,
      source_key,
      match_candidate_id,
      metadata,
      created_at,
      updated_at
    )
    select
      v_winner_game_id,
      platform_id,
      score_source,
      critic_score,
      critic_count,
      user_score,
      user_count,
      source_key,
      match_candidate_id,
      metadata,
      created_at,
      now()
    from games_library.game_scores
    where game_id = v_temp_game_id
    on conflict (game_id, platform_id, score_source, source_key) do update set
      critic_score = coalesce(excluded.critic_score, games_library.game_scores.critic_score),
      critic_count = greatest(coalesce(games_library.game_scores.critic_count, 0), coalesce(excluded.critic_count, 0)),
      user_score = coalesce(excluded.user_score, games_library.game_scores.user_score),
      user_count = greatest(coalesce(games_library.game_scores.user_count, 0), coalesce(excluded.user_count, 0)),
      match_candidate_id = coalesce(games_library.game_scores.match_candidate_id, excluded.match_candidate_id),
      metadata = games_library.game_scores.metadata || excluded.metadata,
      updated_at = now();
    get diagnostics v_moved_scores = row_count;

    delete from games_library.game_scores
    where game_id = v_temp_game_id;

    delete from games_library.game_duplicate_candidates
    where game_id = v_temp_game_id
       or winner_game_id = v_temp_game_id;

    delete from games_library.series_cleanup_applied
    where game_id = v_temp_game_id;

    delete from games_library.game_external_match_candidates
    where game_id = v_temp_game_id;

    insert into games_library.game_redirects (
      from_game_id,
      to_game_id,
      reason,
      notes,
      created_by
    )
    values (
      v_temp_game_id,
      v_winner_game_id,
      'manual_id_change',
      'Merged post-ingest duplicate that originally had an empty game_id.',
      'migration_20260620031833_fix_empty_game_id_and_guard'
    )
    on conflict (from_game_id) do update set
      to_game_id = excluded.to_game_id,
      reason = excluded.reason,
      notes = excluded.notes,
      created_by = excluded.created_by,
      updated_at = now();

    delete from games_library.games
    where game_id = v_temp_game_id;
    get diagnostics v_deleted_games = row_count;

    if v_deleted_games <> 1 then
      raise exception 'Expected to delete 1 temporary duplicate game, deleted %', v_deleted_games;
    end if;

    raise notice 'Merged empty game_id duplicate into %, score rows affected %', v_winner_game_id, v_moved_scores;
  end if;

  select sum(orphan_rows)::int
  into v_orphan_count
  from (
    select count(*) as orphan_rows from games_library.game_platforms t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_tags t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_aliases t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.user_game_states t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_external_match_candidates t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_external_ids t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_releases t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_companies t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_scores t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_age_ratings t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_summaries t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_sales_snapshots t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_review_sentiment_snapshots t left join games_library.games g on g.game_id = t.game_id where g.game_id is null
    union all select count(*) from games_library.game_redirects t left join games_library.games g on g.game_id = t.to_game_id where g.game_id is null
  ) orphan_checks;

  if coalesce(v_orphan_count, 0) <> 0 then
    raise exception 'Empty game_id cleanup left % orphaned game references', v_orphan_count;
  end if;
end;
$$;

alter table games_library.games
  drop constraint if exists games_game_id_not_blank;

alter table games_library.games
  add constraint games_game_id_not_blank check (btrim(game_id) <> '');

alter table games_library.game_redirects
  drop constraint if exists game_redirects_ids_not_blank;

alter table games_library.game_redirects
  add constraint game_redirects_ids_not_blank
  check (btrim(from_game_id) <> '' and btrim(to_game_id) <> '');

commit;

-- Down:
-- Intentionally not auto-reversed. The duplicate row with empty game_id is
-- merged into the existing rawg:359801 row and blank IDs are now rejected.
