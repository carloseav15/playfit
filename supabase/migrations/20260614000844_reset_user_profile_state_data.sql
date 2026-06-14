-- Reset Playfit user/profile state so users can start from zero.
-- Catalog data is intentionally untouched.
begin;

create schema if not exists games_library_private;

comment on schema games_library_private is
  'Private maintenance helpers for games_library. Not exposed through Supabase Data API.';

revoke all on schema games_library_private from public, anon, authenticated;
grant usage on schema games_library_private to service_role;

create table if not exists games_library_private.user_data_reset_runs (
  reset_id                 uuid primary key default gen_random_uuid(),
  reset_reason             text not null default 'fresh_start_user_state_reset',
  profiles_deleted         int not null default 0 check (profiles_deleted >= 0),
  user_game_states_deleted int not null default 0 check (user_game_states_deleted >= 0),
  rate_limits_deleted      int not null default 0 check (rate_limits_deleted >= 0),
  audit_log_deleted        int not null default 0 check (audit_log_deleted >= 0),
  api_cache_deleted        int not null default 0 check (api_cache_deleted >= 0),
  created_at               timestamptz not null default now()
);

comment on table games_library_private.user_data_reset_runs is
  'Private audit records for user/profile/operational state resets.';

create table if not exists games_library_private.user_data_reset_backups (
  reset_id     uuid not null references games_library_private.user_data_reset_runs(reset_id) on delete cascade,
  source_table text not null,
  row_data     jsonb not null,
  backed_up_at timestamptz not null default now()
);

comment on table games_library_private.user_data_reset_backups is
  'Private row-level backup captured before user/profile/operational state resets.';

create index if not exists user_data_reset_backups_reset_idx
  on games_library_private.user_data_reset_backups (reset_id, source_table);

alter table games_library_private.user_data_reset_runs enable row level security;
alter table games_library_private.user_data_reset_backups enable row level security;

drop policy if exists service_role_manage_user_data_reset_runs
  on games_library_private.user_data_reset_runs;
create policy service_role_manage_user_data_reset_runs
  on games_library_private.user_data_reset_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists service_role_manage_user_data_reset_backups
  on games_library_private.user_data_reset_backups;
create policy service_role_manage_user_data_reset_backups
  on games_library_private.user_data_reset_backups
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library_private.user_data_reset_runs
  from public, anon, authenticated;
revoke all on table games_library_private.user_data_reset_backups
  from public, anon, authenticated;
grant select, insert, update, delete on table games_library_private.user_data_reset_runs
  to service_role;
grant select, insert, update, delete on table games_library_private.user_data_reset_backups
  to service_role;

do $$
declare
  v_reset_id uuid := gen_random_uuid();
  v_profiles int := 0;
  v_user_game_states int := 0;
  v_rate_limits int := 0;
  v_audit_log int := 0;
  v_api_cache int := 0;
begin
  insert into games_library_private.user_data_reset_runs (reset_id)
  values (v_reset_id);

  insert into games_library_private.user_data_reset_backups (reset_id, source_table, row_data)
  select v_reset_id, 'profiles', to_jsonb(p)
  from games_library.profiles p;

  insert into games_library_private.user_data_reset_backups (reset_id, source_table, row_data)
  select v_reset_id, 'user_game_states', to_jsonb(ugs)
  from games_library.user_game_states ugs;

  insert into games_library_private.user_data_reset_backups (reset_id, source_table, row_data)
  select v_reset_id, 'rate_limits', to_jsonb(rl)
  from games_library.rate_limits rl;

  insert into games_library_private.user_data_reset_backups (reset_id, source_table, row_data)
  select v_reset_id, 'audit_log', to_jsonb(al)
  from games_library.audit_log al;

  insert into games_library_private.user_data_reset_backups (reset_id, source_table, row_data)
  select v_reset_id, 'api_cache', to_jsonb(ac)
  from games_library.api_cache ac;

  delete from games_library.user_game_states;
  get diagnostics v_user_game_states = row_count;

  delete from games_library.profiles;
  get diagnostics v_profiles = row_count;

  delete from games_library.rate_limits;
  get diagnostics v_rate_limits = row_count;

  delete from games_library.audit_log;
  get diagnostics v_audit_log = row_count;

  delete from games_library.api_cache;
  get diagnostics v_api_cache = row_count;

  update games_library_private.user_data_reset_runs
  set
    profiles_deleted = v_profiles,
    user_game_states_deleted = v_user_game_states,
    rate_limits_deleted = v_rate_limits,
    audit_log_deleted = v_audit_log,
    api_cache_deleted = v_api_cache
  where reset_id = v_reset_id;
end;
$$;

-- User references can block otherwise-safe duplicate proposals. After resetting
-- local user state, refresh the proposal queue without executing any merge.
select * from games_library_private.propose_game_duplicate_actions();

commit;

-- Down:
-- This reset is intentionally not auto-reversed.
-- To inspect or restore the previous local state, read
-- games_library_private.user_data_reset_runs and
-- games_library_private.user_data_reset_backups.
