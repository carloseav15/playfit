-- Normalize game_scores.user_score to a consistent 0-10 scale.
-- RAWG user ratings arrived on a 0-5 scale; preserve raw values in metadata.
begin;

create table if not exists games_library_private.game_score_scale_normalization_runs (
  run_id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'started' check (status in ('started', 'completed', 'failed')),
  rawg_rows_normalized int not null default 0,
  invalid_score_rows_after int not null default 0,
  notes text not null default ''
);

alter table games_library_private.game_score_scale_normalization_runs enable row level security;

drop policy if exists service_role_manage_game_score_scale_normalization_runs
  on games_library_private.game_score_scale_normalization_runs;
create policy service_role_manage_game_score_scale_normalization_runs
  on games_library_private.game_score_scale_normalization_runs
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library_private.game_score_scale_normalization_runs
  from public, anon, authenticated;
grant select, insert, update, delete on table games_library_private.game_score_scale_normalization_runs
  to service_role;

do $$
declare
  v_run_id uuid;
  v_existing_status text;
  v_rawg_rows int := 0;
  v_invalid_rows int := 0;
begin
  select status
  into v_existing_status
  from games_library_private.game_score_scale_normalization_runs
  where run_key = '20260620_normalize_game_score_scales';

  if v_existing_status = 'completed' then
    raise notice 'Game score scale normalization already completed; skipping.';
    return;
  elsif v_existing_status is not null then
    raise exception 'Previous game score scale normalization run is %, refusing to continue', v_existing_status;
  end if;

  insert into games_library_private.game_score_scale_normalization_runs (run_key, notes)
  values (
    '20260620_normalize_game_score_scales',
    'Normalize RAWG user_score from 0-5 to the catalog-wide 0-10 scale; raw values preserved in metadata.'
  )
  returning run_id into v_run_id;

  update games_library.game_scores
  set
    metadata = metadata || jsonb_build_object(
      'pre_normalized_user_score', user_score,
      'user_score_scale_before', 'rawg_0_5',
      'user_score_scale_after', 'normalized_0_10',
      'score_scale_normalized_by', 'migration_20260620100004_normalize_game_score_scales',
      'score_scale_normalized_at', now()
    ),
    user_score = user_score * 2,
    updated_at = now()
  where score_source = 'rawg'
    and user_score is not null
    and user_score between 0 and 5
    and not (metadata ? 'pre_normalized_user_score');
  get diagnostics v_rawg_rows = row_count;

  select count(*)::int
  into v_invalid_rows
  from games_library.game_scores
  where (critic_score is not null and (critic_score < 0 or critic_score > 100))
     or (user_score is not null and (user_score < 0 or user_score > 10))
     or (critic_count is not null and critic_count < 0)
     or (user_count is not null and user_count < 0);

  if v_invalid_rows <> 0 then
    raise exception 'Game score normalization left % invalid score rows', v_invalid_rows;
  end if;

  update games_library_private.game_score_scale_normalization_runs
  set
    completed_at = now(),
    status = 'completed',
    rawg_rows_normalized = v_rawg_rows,
    invalid_score_rows_after = v_invalid_rows
  where run_id = v_run_id;
end;
$$;

alter table games_library.game_scores
  drop constraint if exists game_scores_critic_score_0_100;

alter table games_library.game_scores
  add constraint game_scores_critic_score_0_100
  check (critic_score is null or (critic_score >= 0 and critic_score <= 100));

alter table games_library.game_scores
  drop constraint if exists game_scores_user_score_0_10;

alter table games_library.game_scores
  add constraint game_scores_user_score_0_10
  check (user_score is null or (user_score >= 0 and user_score <= 10));

alter table games_library.game_scores
  drop constraint if exists game_scores_review_counts_nonnegative;

alter table games_library.game_scores
  add constraint game_scores_review_counts_nonnegative
  check (
    (critic_count is null or critic_count >= 0)
    and (user_count is null or user_count >= 0)
  );

comment on column games_library.game_scores.critic_score is
  'Normalized critic score on a 0-100 scale.';

comment on column games_library.game_scores.user_score is
  'Normalized user score on a 0-10 scale. Source raw values may be preserved in metadata.';

commit;

-- Down:
-- Intentionally not auto-reversed. RAWG pre-normalized values are preserved in
-- game_scores.metadata->pre_normalized_user_score for inspected rollback.
