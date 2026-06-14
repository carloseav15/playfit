-- Repair rating parsing for profile JSON -> user_game_states sync.
begin;

create or replace function games_library.upsert_profile(
  p_user_id     text,
  p_game_states jsonb,
  p_profile     jsonb,
  p_onboarding  jsonb
) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := p_user_id::uuid;
begin
  insert into games_library.profiles (user_id, game_states, profile, onboarding)
  values (v_user_id, coalesce(p_game_states, '{}'::jsonb), p_profile, p_onboarding)
  on conflict (user_id) do update set
    game_states = excluded.game_states,
    profile = excluded.profile,
    onboarding = excluded.onboarding,
    updated_at = now();

  delete from games_library.user_game_states ugs
  where ugs.user_id = v_user_id
    and not exists (
      select 1
      from jsonb_each(coalesce(p_game_states, '{}'::jsonb)) as incoming(game_id, state)
      where incoming.game_id = ugs.game_id
    );

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
    v_user_id,
    incoming.game_id,
    case
      when incoming.state ->> 'status' in (
        'playing',
        'on_hold',
        'shelved',
        'beaten',
        'completed',
        'abandoned',
        'want_to_play'
      ) then incoming.state ->> 'status'
      else null
    end,
    case
      when incoming.state ->> 'rating' in (
        '0',
        '0.5',
        '1',
        '1.5',
        '2',
        '2.5',
        '3',
        '3.5',
        '4',
        '4.5',
        '5'
      ) then (incoming.state ->> 'rating')::numeric(2,1)
      else null
    end,
    case when incoming.state ->> 'inBacklog' in ('true', 'false')
      then (incoming.state ->> 'inBacklog')::boolean
      else false
    end,
    case when incoming.state ->> 'inWishlist' in ('true', 'false')
      then (incoming.state ->> 'inWishlist')::boolean
      else false
    end,
    case when incoming.state ->> 'excluded' in ('true', 'false')
      then (incoming.state ->> 'excluded')::boolean
      else false
    end,
    case
      when incoming.state ->> 'source' in ('onboarding', 'finder', 'manual')
        then incoming.state ->> 'source'
      else 'manual'
    end,
    case
      when incoming.state ->> 'createdAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        then (incoming.state ->> 'createdAt')::timestamptz
      else now()
    end,
    case
      when incoming.state ->> 'updatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
        then (incoming.state ->> 'updatedAt')::timestamptz
      else now()
    end
  from jsonb_each(coalesce(p_game_states, '{}'::jsonb)) as incoming(game_id, state)
  join games_library.games g on g.game_id = incoming.game_id
  on conflict (user_id, game_id) do update set
    status = excluded.status,
    rating = excluded.rating,
    in_backlog = excluded.in_backlog,
    in_wishlist = excluded.in_wishlist,
    excluded = excluded.excluded,
    source = excluded.source,
    created_at = least(games_library.user_game_states.created_at, excluded.created_at),
    updated_at = excluded.updated_at;

  update games_library.profiles
  set
    game_states = games_library.build_game_states_json(v_user_id),
    updated_at = now()
  where user_id = v_user_id;
end;
$$;

with incoming as (
  select
    p.user_id,
    state_entry.game_id,
    (state_entry.state ->> 'rating')::numeric(2,1) as rating
  from games_library.profiles p
  cross join lateral jsonb_each(coalesce(p.game_states, '{}'::jsonb)) as state_entry(game_id, state)
  where state_entry.state ->> 'rating' in (
    '0',
    '0.5',
    '1',
    '1.5',
    '2',
    '2.5',
    '3',
    '3.5',
    '4',
    '4.5',
    '5'
  )
)
update games_library.user_game_states ugs
set
  rating = incoming.rating,
  updated_at = now()
from incoming
where ugs.user_id = incoming.user_id
  and ugs.game_id = incoming.game_id
  and ugs.rating is distinct from incoming.rating;

update games_library.profiles p
set
  game_states = games_library.build_game_states_json(p.user_id),
  updated_at = now()
where exists (
  select 1
  from games_library.user_game_states ugs
  where ugs.user_id = p.user_id
);

grant execute on function games_library.upsert_profile(text, jsonb, jsonb, jsonb) to anon, authenticated;

commit;

-- Down:
-- This migration only repairs parsing logic and is intentionally not reversed.
