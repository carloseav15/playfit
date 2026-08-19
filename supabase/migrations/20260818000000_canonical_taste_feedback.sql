begin;

alter table games_library.profiles
  add column if not exists state_version bigint not null default 0,
  add column if not exists last_operation_id uuid,
  add column if not exists last_operation_fingerprint text;

create or replace function games_library.get_profile(p_user_id text) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  return (
    select jsonb_build_object(
      'game_states', p.game_states,
      'profile', p.profile,
      'onboarding', p.onboarding,
      'state_version', p.state_version,
      'created_at', p.created_at,
      'updated_at', p.updated_at
    )
    from games_library.profiles p
    where p.user_id = p_user_id::uuid
  );
end;
$$;

create or replace function games_library.save_profile(
  p_user_id text,
  p_expected_state_version bigint,
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
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select state_version
  into v_state_version
  from games_library.profiles
  where user_id = p_user_id::uuid
  for update;

  if found and v_state_version is distinct from p_expected_state_version then
    return jsonb_build_object(
      'status', 'conflict',
      'state_version', v_state_version
    );
  end if;

  if not found then
    if p_expected_state_version <> 0 then
      return jsonb_build_object('status', 'not_found', 'state_version', 0);
    end if;
    v_state_version := 0;
  end if;

  perform games_library.upsert_profile(
    p_user_id,
    p_game_states,
    p_profile,
    p_onboarding
  );

  update games_library.profiles
  set state_version = v_state_version + 1
  where user_id = p_user_id::uuid
  returning state_version into v_state_version;

  return jsonb_build_object('status', 'saved', 'state_version', v_state_version);
end;
$$;

create or replace function games_library.apply_profile_transition(
  p_user_id text,
  p_expected_state_version bigint,
  p_operation_id uuid,
  p_operation_fingerprint text,
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
  v_last_operation_id uuid;
  v_last_operation_fingerprint text;
begin
  if p_user_id is null or p_user_id::uuid is distinct from auth.uid() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select state_version, last_operation_id, last_operation_fingerprint
  into v_state_version, v_last_operation_id, v_last_operation_fingerprint
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
    last_operation_fingerprint = p_operation_fingerprint
  where user_id = p_user_id::uuid
  returning state_version into v_state_version;

  return jsonb_build_object(
    'status', 'applied',
    'state_version', v_state_version,
    'profile_snapshot', games_library.get_profile(p_user_id)
  );
end;
$$;

revoke all on function games_library.save_profile(text, bigint, jsonb, jsonb, jsonb) from public;
revoke all on function games_library.save_profile(text, bigint, jsonb, jsonb, jsonb) from anon;
grant execute on function games_library.save_profile(text, bigint, jsonb, jsonb, jsonb) to authenticated;

revoke all on function games_library.apply_profile_transition(
  text, bigint, uuid, text, jsonb, jsonb, jsonb
) from public;
revoke all on function games_library.apply_profile_transition(
  text, bigint, uuid, text, jsonb, jsonb, jsonb
) from anon;
grant execute on function games_library.apply_profile_transition(
  text, bigint, uuid, text, jsonb, jsonb, jsonb
) to authenticated;

commit;

-- Down:
-- drop function if exists games_library.apply_profile_transition(text, bigint, uuid, text, jsonb, jsonb, jsonb);
-- drop function if exists games_library.save_profile(text, bigint, jsonb, jsonb, jsonb);
-- alter table games_library.profiles drop column if exists last_operation_fingerprint;
-- alter table games_library.profiles drop column if exists last_operation_id;
-- alter table games_library.profiles drop column if exists state_version;
-- Restore get_profile from the prior migration after dropping state_version.
