begin;

-- The prior profile is captured inside the same locked decision transaction.
-- It is the only authoritative restoration source: a legacy-but-valid profile
-- need not be byte-for-byte reproducible from today's Core derivation rules.
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
    state_version, game_states, onboarding, last_operation_id,
    last_operation_fingerprint, last_operation_type, last_operation_game_id,
    last_operation_previous_game_state, last_operation_previous_game_state_exists,
    last_operation_previous_profile
  into
    v_state_version, v_game_states, v_onboarding, v_last_operation_id,
    v_last_operation_fingerprint, v_last_operation_type, v_last_operation_game_id,
    v_previous_game_state, v_previous_game_state_exists, v_previous_profile
  from games_library.profiles
  where user_id = p_user_id::uuid
  for update;

  if not found then return jsonb_build_object('status', 'not_found'); end if;

  if v_last_operation_id = p_operation_id then
    if v_last_operation_fingerprint is distinct from p_operation_fingerprint then
      return jsonb_build_object('status', 'operation_mismatch', 'state_version', v_state_version);
    end if;
    return jsonb_build_object(
      'status', 'replayed', 'state_version', v_state_version,
      'game_id', v_last_operation_game_id,
      'restored_previous_state', v_game_states ? v_last_operation_game_id,
      'profile_snapshot', games_library.get_profile(p_user_id)
    );
  end if;

  if v_state_version is distinct from p_expected_state_version then
    return jsonb_build_object('status', 'conflict', 'state_version', v_state_version);
  end if;

  if v_last_operation_id is distinct from p_target_operation_id
    or v_last_operation_type is distinct from 'decision'
    or v_last_operation_game_id is null
    or v_previous_profile is null then
    return jsonb_build_object('status', 'undo_unavailable', 'state_version', v_state_version);
  end if;

  if coalesce(v_previous_game_state_exists, false) then
    v_restored_game_states := jsonb_set(
      coalesce(v_game_states, '{}'::jsonb), array[v_last_operation_game_id],
      v_previous_game_state, true
    );
  else
    v_restored_game_states := coalesce(v_game_states, '{}'::jsonb) - v_last_operation_game_id;
  end if;

  perform games_library.upsert_profile(
    p_user_id, v_restored_game_states, v_previous_profile, v_onboarding
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
    'status', 'applied', 'state_version', v_state_version,
    'game_id', v_last_operation_game_id,
    'restored_previous_state', coalesce(v_previous_game_state_exists, false),
    'profile_snapshot', games_library.get_profile(p_user_id)
  );
end;
$$;

revoke all on function games_library.apply_profile_undo(text, bigint, uuid, text, uuid, jsonb) from public;
revoke all on function games_library.apply_profile_undo(text, bigint, uuid, text, uuid, jsonb) from anon;
grant execute on function games_library.apply_profile_undo(text, bigint, uuid, text, uuid, jsonb) to authenticated;

commit;

-- Down:
-- Restore the definition from 20260818211550_canonical_undo.sql.
