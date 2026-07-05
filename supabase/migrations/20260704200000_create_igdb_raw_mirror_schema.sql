-- Private local mirror of metadata retrieved from the IGDB API.
-- Populated by scripts/sync-igdb-mirror.mjs, not by application code.
-- Not exposed to anon/authenticated: this schema is for local backup/analysis only.

create schema if not exists igdb_raw;

revoke all on schema igdb_raw from public, anon, authenticated;

create table if not exists igdb_raw.sync_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('full', 'incremental')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'completed_with_errors', 'failed')),
  requested_endpoints text[] not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  rows_fetched bigint not null default 0,
  errors jsonb not null default '[]'::jsonb
);

create table if not exists igdb_raw.endpoint_runs (
  run_id uuid not null references igdb_raw.sync_runs(id) on delete cascade,
  endpoint text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'skipped')),
  expected_count bigint,
  last_igdb_id bigint not null default -1,
  rows_fetched bigint not null default 0,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  primary key (run_id, endpoint)
);

create table if not exists igdb_raw.endpoint_state (
  endpoint text primary key,
  supports_updated_at boolean,
  active_rows bigint not null default 0,
  max_source_updated_at bigint,
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  last_successful_run_id uuid references igdb_raw.sync_runs(id),
  updated_at timestamptz not null default now()
);

create table if not exists igdb_raw.entities (
  endpoint text not null,
  igdb_id bigint not null,
  payload jsonb not null,
  checksum text,
  source_created_at bigint,
  source_updated_at bigint,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_seen_run_id uuid not null references igdb_raw.sync_runs(id),
  is_active boolean not null default true,
  primary key (endpoint, igdb_id)
);

create index if not exists igdb_raw_entities_endpoint_updated_idx
  on igdb_raw.entities (endpoint, source_updated_at)
  where source_updated_at is not null;

create index if not exists igdb_raw_entities_last_run_idx
  on igdb_raw.entities (last_seen_run_id);

alter table igdb_raw.endpoint_runs
  alter column last_igdb_id set default -1;

comment on schema igdb_raw is
  'Private local mirror of metadata retrieved from the IGDB API.';
comment on table igdb_raw.entities is
  'One JSONB row per enumerable IGDB endpoint entity; binary media is not stored.';

revoke all on all tables in schema igdb_raw from public, anon, authenticated;
