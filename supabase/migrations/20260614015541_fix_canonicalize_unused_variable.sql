-- Remove unused-variable lint warning from canonicalization helper.
begin;

create or replace function games_library_private.canonicalize_duplicate_group_winner(
  p_group_key text,
  p_current_winner_game_id text,
  p_new_game_id text,
  p_reviewed_by text default 'manual_review',
  p_review_notes text default ''
) returns table(
  group_key text,
  old_game_id text,
  new_game_id text
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status text;
  v_title text;
  v_reviewed_by text := coalesce(nullif(btrim(p_reviewed_by), ''), 'manual_review');
  v_note text := 'Canonicalized duplicate winner ID from ' || p_current_winner_game_id || ' to ' || p_new_game_id;
begin
  if p_group_key is null or btrim(p_group_key) = '' then
    raise exception 'p_group_key is required';
  end if;

  if p_current_winner_game_id is null or btrim(p_current_winner_game_id) = '' then
    raise exception 'p_current_winner_game_id is required';
  end if;

  if p_new_game_id is null or btrim(p_new_game_id) = '' then
    raise exception 'p_new_game_id is required';
  end if;

  if p_new_game_id !~ '^[a-z0-9][a-z0-9_]*[a-z0-9]$' then
    raise exception 'p_new_game_id must be a lowercase source-agnostic slug, got %', p_new_game_id;
  end if;

  if p_new_game_id ~ '^(rawg|steam|wiki)_' then
    raise exception 'p_new_game_id must not be source-prefixed, got %', p_new_game_id;
  end if;

  select g.status
  into v_status
  from games_library.game_duplicate_groups g
  where g.group_key = p_group_key
  for update;

  if not found then
    raise exception 'Duplicate group % does not exist', p_group_key;
  end if;

  if v_status <> 'needs_review' then
    raise exception 'Expected duplicate group % to be needs_review, found %', p_group_key, v_status;
  end if;

  select title
  into v_title
  from games_library.games
  where game_id = p_current_winner_game_id
  for update;

  if not found then
    raise exception 'Current winner % does not exist', p_current_winner_game_id;
  end if;

  v_note := v_note || ' (' || v_title || ')';

  if btrim(coalesce(p_review_notes, '')) <> '' then
    v_note := v_note || ': ' || btrim(p_review_notes);
  end if;

  if not exists (
    select 1
    from games_library.game_duplicate_candidates c
    where c.group_key = p_group_key
      and c.game_id = p_current_winner_game_id
  ) then
    raise exception 'Current winner % is not a candidate in group %', p_current_winner_game_id, p_group_key;
  end if;

  if exists (
    select 1
    from games_library.games
    where game_id = p_new_game_id
  ) then
    raise exception 'Cannot canonicalize % to %, target ID already exists', p_current_winner_game_id, p_new_game_id;
  end if;

  if exists (
    select 1
    from games_library.game_redirects
    where from_game_id = p_new_game_id
       or to_game_id = p_current_winner_game_id
  ) then
    raise exception 'Cannot canonicalize % to % because a conflicting redirect already exists', p_current_winner_game_id, p_new_game_id;
  end if;

  update games_library.games
  set game_id = p_new_game_id,
      updated_at = now()
  where game_id = p_current_winner_game_id;

  update games_library.profiles p
  set
    game_states = case
      when p.game_states ? p_new_game_id then p.game_states - p_current_winner_game_id
      else (p.game_states - p_current_winner_game_id) ||
        jsonb_build_object(
          p_new_game_id,
          jsonb_set(
            p.game_states -> p_current_winner_game_id,
            '{gameId}',
            to_jsonb(p_new_game_id)
          )
        )
    end,
    updated_at = now()
  where p.game_states ? p_current_winner_game_id;

  insert into games_library.game_redirects (
    from_game_id,
    to_game_id,
    reason,
    notes,
    created_by
  )
  values (
    p_current_winner_game_id,
    p_new_game_id,
    'manual_id_change',
    v_note,
    'games_library_private.canonicalize_duplicate_group_winner'
  );

  update games_library.game_duplicate_candidates c
  set
    review_notes = case
      when btrim(c.review_notes) = '' then v_note
      else c.review_notes || E'\n' || v_note
    end,
    updated_at = now()
  where c.group_key = p_group_key;

  update games_library.game_duplicate_groups g
  set
    reviewed_by = v_reviewed_by,
    review_notes = case
      when btrim(g.review_notes) = '' then v_note
      else g.review_notes || E'\n' || v_note
    end,
    updated_at = now()
  where g.group_key = p_group_key;

  return query select p_group_key, p_current_winner_game_id, p_new_game_id;
end;
$$;

comment on function games_library_private.canonicalize_duplicate_group_winner(text, text, text, text, text) is
  'Renames a reviewed duplicate winner from a source-prefixed ID to a source-agnostic game_id and creates a redirect from the old ID.';

revoke all on function games_library_private.canonicalize_duplicate_group_winner(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function games_library_private.canonicalize_duplicate_group_winner(text, text, text, text, text)
  to service_role;

commit;

-- Down:
-- Reapply function body from 20260614015018_canonical_duplicate_id_helpers.sql if needed.
