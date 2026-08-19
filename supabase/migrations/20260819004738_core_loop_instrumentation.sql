-- Core-loop analytics is append-only.  Canonical decisions are recorded by a
-- trigger, never by a client request, so retries and offline replay inherit the
-- existing operationId idempotency guarantee.
create table if not exists games_library.core_loop_events (
  event_id uuid primary key default gen_random_uuid(),
  event_key text not null,
  -- Profiles can be local anonymous UUIDs before auth migration, so this must
  -- not reference auth.users or it would make the canonical product command fail.
  user_id uuid not null,
  event_name text not null check (event_name in (
    'onboarding_completed',
    'recommendation_generated',
    'recommendation_shown',
    'recommendation_started',
    'recommendation_outcome',
    'recommendation_rejected',
    'recommendation_skipped',
    'recommendation_saved',
    'recommendation_decision_undone'
  )),
  event_source text not null check (event_source in ('server', 'client')),
  client_platform text check (client_platform in ('web', 'ios', 'android')),
  recommendation_id text,
  state_version bigint,
  game_id text,
  rank integer check (rank is null or rank > 0),
  operation_id uuid,
  target_operation_id uuid,
  outcome text check (outcome is null or outcome in ('loved', 'liked', 'mixed', 'dropped')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, event_key)
);

alter table games_library.core_loop_events enable row level security;
revoke all on table games_library.core_loop_events from anon, authenticated;

create index if not exists core_loop_events_user_event_time_idx
  on games_library.core_loop_events (user_id, event_name, occurred_at);
create index if not exists core_loop_events_user_game_idx
  on games_library.core_loop_events (user_id, game_id, event_name);
create unique index if not exists core_loop_events_operation_idx
  on games_library.core_loop_events (operation_id)
  where operation_id is not null and event_name <> 'recommendation_decision_undone';

create or replace function games_library.record_canonical_core_loop_event()
returns trigger
language plpgsql
security definer
set search_path = games_library, public
as $$
declare
  v_event_name text;
  v_outcome text;
  v_recommendation_id text;
begin
  if old.onboarding ->> 'onboardingCompletedAt' is null
    and new.onboarding ->> 'onboardingCompletedAt' is not null
    and jsonb_array_length(coalesce(new.onboarding -> 'platforms', '[]'::jsonb)) > 0
    and jsonb_array_length(coalesce(new.onboarding -> 'likedGameIds', '[]'::jsonb)) >= 3
    and jsonb_array_length(coalesce(new.onboarding -> 'dislikedGameIds', '[]'::jsonb)) >= 1
    and new.profile is not null then
    insert into games_library.core_loop_events (
      event_key, user_id, event_name, event_source, state_version
    ) values (
      'onboarding:' || new.state_version::text, new.user_id,
      'onboarding_completed', 'server', new.state_version
    ) on conflict (user_id, event_key) do nothing;
  end if;

  if new.last_operation_id is null or new.last_operation_id is not distinct from old.last_operation_id then
    return new;
  end if;

  if new.last_operation_type = 'undo' then
    insert into games_library.core_loop_events (
      event_key, user_id, event_name, event_source, state_version, game_id,
      operation_id, target_operation_id
    ) values (
      'undo:' || new.last_operation_id::text, new.user_id,
      'recommendation_decision_undone', 'server', new.state_version,
      new.last_operation_game_id, new.last_operation_id, new.last_operation_target_id
    ) on conflict (user_id, event_key) do nothing;
    return new;
  end if;

  -- The canonical function writes a stable JSON fingerprint.  Read only the
  -- action type; no taste profile, traits, or free-form content enter analytics.
  v_outcome := new.last_operation_fingerprint::jsonb ->> 'actionType';
  v_event_name := case
    when v_outcome = 'started' then 'recommendation_started'
    when v_outcome = 'not_for_me' then 'recommendation_rejected'
    when v_outcome in ('loved', 'liked', 'mixed', 'dropped') then 'recommendation_outcome'
    else null
  end;
  if v_event_name is null then return new; end if;
  if v_event_name = 'recommendation_outcome' then
    select recommendation_id into v_recommendation_id
    from games_library.core_loop_events
    where user_id = new.user_id
      and game_id = new.last_operation_game_id
      and event_name = 'recommendation_started'
      and recommendation_id is not null
      and not exists (
        select 1 from games_library.core_loop_events undo
        where undo.user_id = new.user_id
          and undo.event_name = 'recommendation_decision_undone'
          and undo.target_operation_id = core_loop_events.operation_id
      )
    order by occurred_at desc
    limit 1;
  end if;

  insert into games_library.core_loop_events (
    event_key, user_id, event_name, event_source, state_version, game_id,
    operation_id, outcome, recommendation_id
  ) values (
    'canonical:' || new.last_operation_id::text, new.user_id, v_event_name,
    'server', new.state_version, new.last_operation_game_id,
    new.last_operation_id,
    case when v_event_name = 'recommendation_outcome' then v_outcome else null end,
    v_recommendation_id
  ) on conflict (user_id, event_key) do nothing;
  return new;
end;
$$;

drop trigger if exists record_canonical_core_loop_event on games_library.profiles;
create trigger record_canonical_core_loop_event
after update of last_operation_id, onboarding on games_library.profiles
for each row execute function games_library.record_canonical_core_loop_event();

-- This is deliberately the only client-writable path. The API supplies the
-- authenticated user id and validates the recommendation identity against the
-- current authoritative model before it calls this RPC.
create or replace function games_library.record_client_core_loop_event(
  p_user_id uuid,
  p_event_id uuid,
  p_event_name text,
  p_client_platform text,
  p_recommendation_id text,
  p_state_version bigint,
  p_game_id text,
  p_rank integer
) returns void
language plpgsql
security definer
set search_path = games_library, public
as $$
begin
  if auth.uid() is distinct from p_user_id then
    raise exception 'not authorized';
  end if;
  if p_event_name not in ('recommendation_shown', 'recommendation_skipped', 'recommendation_saved') then
    raise exception 'invalid client event';
  end if;
  insert into games_library.core_loop_events (
    event_id, event_key, user_id, event_name, event_source, client_platform,
    recommendation_id, state_version, game_id, rank
  ) values (
    p_event_id, 'client:' || p_event_id::text, p_user_id, p_event_name, 'client',
    p_client_platform, p_recommendation_id, p_state_version, p_game_id, p_rank
  ) on conflict do nothing;
end;
$$;

grant execute on function games_library.record_client_core_loop_event(uuid, uuid, text, text, text, bigint, text, integer) to authenticated;

-- The web/API tier calls this only after it has built and validated the model
-- for the authenticated request. It enriches an existing canonical event; it
-- cannot create a Started, outcome, rejection, or undo event.
create or replace function games_library.attach_recommendation_provenance(
  p_user_id uuid,
  p_operation_id uuid,
  p_recommendation_id text,
  p_rank integer
) returns void
language plpgsql
security definer
set search_path = games_library, public
as $$
begin
  if auth.uid() is distinct from p_user_id then raise exception 'not authorized'; end if;
  update games_library.core_loop_events
  set recommendation_id = p_recommendation_id, rank = p_rank
  where user_id = p_user_id
    and operation_id = p_operation_id
    and event_name in ('recommendation_started', 'recommendation_rejected', 'recommendation_outcome');
end;
$$;
grant execute on function games_library.attach_recommendation_provenance(uuid, uuid, text, integer) to authenticated;

create or replace function games_library.record_recommendation_generated(
  p_user_id uuid,
  p_state_version bigint,
  p_recommendation_id text,
  p_primary_game_id text,
  p_rank integer
) returns void
language plpgsql
security definer
set search_path = games_library, public
as $$
begin
  if auth.uid() is distinct from p_user_id then raise exception 'not authorized'; end if;
  insert into games_library.core_loop_events (
    event_key, user_id, event_name, event_source, recommendation_id,
    state_version, game_id, rank
  ) values (
    'generated:' || p_recommendation_id, p_user_id, 'recommendation_generated',
    'server', p_recommendation_id, p_state_version, p_primary_game_id, p_rank
  ) on conflict (user_id, event_key) do nothing;
end;
$$;
grant execute on function games_library.record_recommendation_generated(uuid, bigint, text, text, integer) to authenticated;

-- Down:
-- drop trigger if exists record_canonical_core_loop_event on games_library.profiles;
-- drop function if exists games_library.record_canonical_core_loop_event();
-- drop function if exists games_library.record_client_core_loop_event(uuid, uuid, text, text, text, bigint, text, integer);
-- drop function if exists games_library.attach_recommendation_provenance(uuid, uuid, text, integer);
-- drop function if exists games_library.record_recommendation_generated(uuid, bigint, text, text, integer);
-- drop table if exists games_library.core_loop_events;
