-- Repair profile game-state divergence and keep normalized state canonical.
begin;

create or replace function games_library.build_game_states_json(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = pg_catalog
as $$
  select coalesce(
    jsonb_object_agg(
      ugs.game_id,
      jsonb_strip_nulls(jsonb_build_object(
        'gameId', ugs.game_id,
        'title', coalesce(g.title, ugs.game_id),
        'status', ugs.status,
        'rating', ugs.rating,
        'inBacklog', ugs.in_backlog,
        'inWishlist', ugs.in_wishlist,
        'excluded', ugs.excluded,
        'source', ugs.source,
        'createdAt', ugs.created_at,
        'updatedAt', ugs.updated_at
      ))
      order by ugs.updated_at desc, ugs.game_id
    ),
    '{}'::jsonb
  )
  from games_library.user_game_states ugs
  left join games_library.games g on g.game_id = ugs.game_id
  where ugs.user_id = p_user_id;
$$;

comment on function games_library.build_game_states_json(uuid) is
  'Builds the profile.game_states compatibility JSON from normalized user_game_states.';

revoke all on function games_library.build_game_states_json(uuid) from public, anon, authenticated;
grant execute on function games_library.build_game_states_json(uuid) to service_role;

create or replace function games_library.sync_profile_game_states()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid;
begin
  v_user_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;

  update games_library.profiles
  set
    game_states = games_library.build_game_states_json(v_user_id),
    updated_at = now()
  where user_id = v_user_id;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists sync_profile_game_states_trigger on games_library.user_game_states;
create trigger sync_profile_game_states_trigger
  after insert or update or delete on games_library.user_game_states
  for each row
  execute function games_library.sync_profile_game_states();

create or replace function games_library.get_game_states(p_user_id text)
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select games_library.build_game_states_json(p_user_id::uuid);
$$;

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
      when incoming.state ->> 'rating' in ('0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5')
        then (incoming.state ->> 'rating')::numeric(2,1)
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

create or replace function games_library.upsert_game_state(
  p_user_id      text,
  p_game_id      text,
  p_status       text default null,
  p_rating       numeric(2,1) default null,
  p_in_backlog   boolean default null,
  p_in_wishlist  boolean default null,
  p_excluded     boolean default null,
  p_source       text default 'manual'
) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into games_library.user_game_states (
    user_id,
    game_id,
    status,
    rating,
    in_backlog,
    in_wishlist,
    excluded,
    source
  )
  values (
    p_user_id::uuid,
    p_game_id,
    p_status,
    p_rating,
    coalesce(p_in_backlog, false),
    coalesce(p_in_wishlist, false),
    coalesce(p_excluded, false),
    coalesce(p_source, 'manual')
  )
  on conflict (user_id, game_id) do update set
    status = coalesce(p_status, user_game_states.status),
    rating = coalesce(p_rating, user_game_states.rating),
    in_backlog = coalesce(p_in_backlog, user_game_states.in_backlog),
    in_wishlist = coalesce(p_in_wishlist, user_game_states.in_wishlist),
    excluded = coalesce(p_excluded, user_game_states.excluded),
    source = coalesce(p_source, user_game_states.source),
    updated_at = now();
end;
$$;

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
  p.user_id,
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
    when incoming.state ->> 'rating' in ('0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5')
      then (incoming.state ->> 'rating')::numeric(2,1)
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
from games_library.profiles p
cross join lateral jsonb_each(coalesce(p.game_states, '{}'::jsonb)) as incoming(game_id, state)
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

update games_library.profiles p
set
  game_states = games_library.build_game_states_json(p.user_id),
  updated_at = now()
where exists (
  select 1
  from games_library.user_game_states ugs
  where ugs.user_id = p.user_id
);

grant execute on function games_library.get_game_states(text) to anon, authenticated;
grant execute on function games_library.upsert_profile(text, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function games_library.upsert_game_state(text, text, text, numeric, boolean, boolean, boolean, text) to anon, authenticated;

commit;

-- Down:
-- begin;
-- drop function if exists games_library.build_game_states_json(uuid);
-- commit;
