begin;

alter table games_library.profiles
  add column if not exists last_operation_type text,
  add column if not exists last_operation_game_id text,
  add column if not exists last_operation_previous_game_state jsonb,
  add column if not exists last_operation_previous_game_state_exists boolean,
  add column if not exists last_operation_previous_profile jsonb,
  add column if not exists last_operation_target_id uuid;

alter table games_library.profiles
  drop constraint if exists profiles_last_operation_type_check;

alter table games_library.profiles
  add constraint profiles_last_operation_type_check
  check (last_operation_type is null or last_operation_type in ('decision', 'undo'));

drop function if exists games_library.apply_profile_transition(
  text, bigint, uuid, text, jsonb, jsonb, jsonb
);

create function games_library.apply_profile_transition(
  p_user_id text,
  p_expected_state_version bigint,
  p_operation_id uuid,
  p_operation_fingerprint text,
  p_game_id text,
  p_game_states jsonb,
  p_profile jsonb,
  p_onboarding jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state_version bigint;
  v_game_states jsonb;
  v_profile jsonb;
  v_last_operation_id uuid;
  v_last_operation_fingerprint text;
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_game_id is null or btrim(p_game_id) = '' or not coalesce(p_game_states, '{}'::jsonb) ? p_game_id then
    raise exception 'canonical decision state is missing its target game'
      using errcode = '22023';
  end if;

  select
    state_version,
    game_states,
    profile,
    last_operation_id,
    last_operation_fingerprint
  into
    v_state_version,
    v_game_states,
    v_profile,
    v_last_operation_id,
    v_last_operation_fingerprint
  from games_library.profiles
  where user_id = p_user_id::uuid
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_last_operation_id = p_operation_id then
    if v_last_operation_fingerprint is distinct from p_operation_fingerprint then
      return jsonb_build_object(
        'status', 'operation_mismatch',
        'state_version', v_state_version
      );
    end if;

    return jsonb_build_object(
      'status', 'replayed',
      'state_version', v_state_version,
      'profile_snapshot', games_library.get_profile(p_user_id)
    );
  end if;

  if v_state_version is distinct from p_expected_state_version then
    return jsonb_build_object(
      'status', 'conflict',
      'state_version', v_state_version
    );
  end if;

  perform games_library.upsert_profile(
    p_user_id,
    p_game_states,
    p_profile,
    p_onboarding
  );

  update games_library.profiles
  set
    state_version = v_state_version + 1,
    last_operation_id = p_operation_id,
    last_operation_fingerprint = p_operation_fingerprint,
    last_operation_type = 'decision',
    last_operation_game_id = p_game_id,
    last_operation_previous_game_state = v_game_states -> p_game_id,
    last_operation_previous_game_state_exists = v_game_states ? p_game_id,
    last_operation_previous_profile = v_profile,
    last_operation_target_id = null
  where user_id = p_user_id::uuid
  returning state_version into v_state_version;

  return jsonb_build_object(
    'status', 'applied',
    'state_version', v_state_version,
    'profile_snapshot', games_library.get_profile(p_user_id)
  );
end;
$$;

create or replace function games_library.get_undo_transition_context(
  p_user_id text,
  p_expected_state_version bigint,
  p_target_operation_id uuid,
  p_operation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_profile games_library.profiles%rowtype;
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select *
  into v_profile
  from games_library.profiles
  where user_id = p_user_id::uuid;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_profile.last_operation_id = p_operation_id
    and v_profile.last_operation_type = 'undo'
    and v_profile.last_operation_target_id = p_target_operation_id then
    return jsonb_build_object(
      'status', 'replayable',
      'state_version', v_profile.state_version,
      'game_id', v_profile.last_operation_game_id,
      'previous_game_state_exists', v_profile.last_operation_previous_game_state_exists,
      'profile_snapshot', games_library.get_profile(p_user_id)
    );
  end if;

  if v_profile.state_version is distinct from p_expected_state_version then
    return jsonb_build_object(
      'status', 'conflict',
      'state_version', v_profile.state_version
    );
  end if;

  if v_profile.last_operation_id is distinct from p_target_operation_id
    or v_profile.last_operation_type is distinct from 'decision' then
    return jsonb_build_object(
      'status', 'undo_unavailable',
      'state_version', v_profile.state_version
    );
  end if;

  return jsonb_build_object(
    'status', 'available',
    'state_version', v_profile.state_version,
    'game_id', v_profile.last_operation_game_id,
    'previous_game_state_exists', v_profile.last_operation_previous_game_state_exists,
    'previous_game_state', v_profile.last_operation_previous_game_state,
    'previous_profile', v_profile.last_operation_previous_profile,
    'profile_snapshot', games_library.get_profile(p_user_id)
  );
end;
$$;

create or replace function games_library.apply_profile_undo(
  p_user_id text,
  p_expected_state_version bigint,
  p_operation_id uuid,
  p_operation_fingerprint text,
  p_target_operation_id uuid,
  p_rebuilt_profile jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_state_version bigint;
  v_game_states jsonb;
  v_onboarding jsonb;
  v_last_operation_id uuid;
  v_last_operation_fingerprint text;
  v_last_operation_type text;
  v_last_operation_game_id text;
  v_previous_game_state jsonb;
  v_previous_game_state_exists boolean;
  v_previous_profile jsonb;
  v_restored_game_states jsonb;
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select
    state_version,
    game_states,
    onboarding,
    last_operation_id,
    last_operation_fingerprint,
    last_operation_type,
    last_operation_game_id,
    last_operation_previous_game_state,
    last_operation_previous_game_state_exists,
    last_operation_previous_profile
  into
    v_state_version,
    v_game_states,
    v_onboarding,
    v_last_operation_id,
    v_last_operation_fingerprint,
    v_last_operation_type,
    v_last_operation_game_id,
    v_previous_game_state,
    v_previous_game_state_exists,
    v_previous_profile
  from games_library.profiles
  where user_id = p_user_id::uuid
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_last_operation_id = p_operation_id then
    if v_last_operation_fingerprint is distinct from p_operation_fingerprint then
      return jsonb_build_object(
        'status', 'operation_mismatch',
        'state_version', v_state_version
      );
    end if;

    return jsonb_build_object(
      'status', 'replayed',
      'state_version', v_state_version,
      'game_id', v_last_operation_game_id,
      'restored_previous_state', v_game_states ? v_last_operation_game_id,
      'profile_snapshot', games_library.get_profile(p_user_id)
    );
  end if;

  if v_state_version is distinct from p_expected_state_version then
    return jsonb_build_object(
      'status', 'conflict',
      'state_version', v_state_version
    );
  end if;

  if v_last_operation_id is distinct from p_target_operation_id
    or v_last_operation_type is distinct from 'decision'
    or v_last_operation_game_id is null then
    return jsonb_build_object(
      'status', 'undo_unavailable',
      'state_version', v_state_version
    );
  end if;

  if p_rebuilt_profile is distinct from v_previous_profile then
    raise exception 'rebuilt profile does not match the pre-decision profile'
      using errcode = '22023';
  end if;

  if coalesce(v_previous_game_state_exists, false) then
    v_restored_game_states := jsonb_set(
      coalesce(v_game_states, '{}'::jsonb),
      array[v_last_operation_game_id],
      v_previous_game_state,
      true
    );
  else
    v_restored_game_states := coalesce(v_game_states, '{}'::jsonb) - v_last_operation_game_id;
  end if;

  perform games_library.upsert_profile(
    p_user_id,
    v_restored_game_states,
    p_rebuilt_profile,
    v_onboarding
  );

  update games_library.profiles
  set
    state_version = v_state_version + 1,
    last_operation_id = p_operation_id,
    last_operation_fingerprint = p_operation_fingerprint,
    last_operation_type = 'undo',
    last_operation_target_id = p_target_operation_id,
    last_operation_previous_game_state = null,
    last_operation_previous_game_state_exists = v_previous_game_state_exists,
    last_operation_previous_profile = null
  where user_id = p_user_id::uuid
  returning state_version into v_state_version;

  return jsonb_build_object(
    'status', 'applied',
    'state_version', v_state_version,
    'game_id', v_last_operation_game_id,
    'restored_previous_state', coalesce(v_previous_game_state_exists, false),
    'profile_snapshot', games_library.get_profile(p_user_id)
  );
end;
$$;

revoke all on function games_library.apply_profile_transition(
  text, bigint, uuid, text, text, jsonb, jsonb, jsonb
) from public;
revoke all on function games_library.apply_profile_transition(
  text, bigint, uuid, text, text, jsonb, jsonb, jsonb
) from anon;
grant execute on function games_library.apply_profile_transition(
  text, bigint, uuid, text, text, jsonb, jsonb, jsonb
) to authenticated;

revoke all on function games_library.get_undo_transition_context(text, bigint, uuid, uuid) from public;
revoke all on function games_library.get_undo_transition_context(text, bigint, uuid, uuid) from anon;
grant execute on function games_library.get_undo_transition_context(text, bigint, uuid, uuid) to authenticated;

revoke all on function games_library.apply_profile_undo(
  text, bigint, uuid, text, uuid, jsonb
) from public;
revoke all on function games_library.apply_profile_undo(
  text, bigint, uuid, text, uuid, jsonb
) from anon;
grant execute on function games_library.apply_profile_undo(
  text, bigint, uuid, text, uuid, jsonb
) to authenticated;

commit;

-- Down:
-- drop function if exists games_library.apply_profile_undo(text, bigint, uuid, text, uuid, jsonb);
-- drop function if exists games_library.get_undo_transition_context(text, bigint, uuid, uuid);
-- drop function if exists games_library.apply_profile_transition(text, bigint, uuid, text, text, jsonb, jsonb, jsonb);
-- alter table games_library.profiles drop column if exists last_operation_target_id;
-- alter table games_library.profiles drop column if exists last_operation_previous_profile;
-- alter table games_library.profiles drop column if exists last_operation_previous_game_state_exists;
-- alter table games_library.profiles drop column if exists last_operation_previous_game_state;
-- alter table games_library.profiles drop column if exists last_operation_game_id;
-- alter table games_library.profiles drop column if exists last_operation_type;
-- Recreate the prior apply_profile_transition signature from 20260818000000 after rollback.
