begin;

create or replace function games_library.get_profile(p_user_id text)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'game_states', p.game_states,
    'profile', p.profile,
    'onboarding', p.onboarding,
    'created_at', p.created_at,
    'updated_at', p.updated_at
  )
  from games_library.profiles p
  where p.user_id = p_user_id::uuid;
$$;

grant execute on function games_library.get_profile(text) to anon, authenticated, service_role;

commit;

-- Down:
-- create or replace function games_library.get_profile(p_user_id text)
-- returns jsonb
-- language sql
-- security definer
-- set search_path = pg_catalog
-- as $$
--   select jsonb_build_object(
--     'game_states', p.game_states,
--     'profile', p.profile,
--     'onboarding', p.onboarding,
--     'created_at', p.created_at
--   )
--   from games_library.profiles p
--   where p.user_id = p_user_id::uuid;
-- $$;
