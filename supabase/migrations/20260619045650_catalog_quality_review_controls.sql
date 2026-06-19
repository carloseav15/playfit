-- Catalog quality review controls.
-- Safe, mostly non-destructive controls after external enrichment imports.
-- This migration:
-- - deduplicates exact duplicate sales snapshots at the business grain with audit
-- - creates a review workflow for external match candidates
-- - backfills conservative aliases from applied external matches
-- - exposes tag/enrichment quality views for recommendation tuning
begin;

create schema if not exists games_library_private;

comment on schema games_library_private is
  'Private maintenance helpers for games_library. Not exposed through Supabase Data API.';

revoke all on schema games_library_private from public, anon, authenticated;
grant usage on schema games_library_private to service_role;

-- ============================================================
-- 1. Sales snapshot business-grain dedupe with audit
-- ============================================================

create table if not exists games_library_private.game_sales_snapshot_dedupe_audit (
  audit_id uuid primary key default gen_random_uuid(),
  deleted_snapshot_id uuid not null unique,
  kept_snapshot_id uuid not null,
  game_id text not null,
  platform_id text,
  source text not null,
  snapshot_date date not null,
  deleted_snapshot jsonb not null,
  kept_snapshot jsonb not null,
  reason text not null default 'duplicate_business_grain_keep_highest_global_sales',
  created_at timestamptz not null default now()
);

comment on table games_library_private.game_sales_snapshot_dedupe_audit is
  'Audit snapshots for deleted duplicate sales rows at game/platform/source/date grain.';

alter table games_library_private.game_sales_snapshot_dedupe_audit enable row level security;

drop policy if exists service_role_manage_game_sales_snapshot_dedupe_audit
  on games_library_private.game_sales_snapshot_dedupe_audit;
create policy service_role_manage_game_sales_snapshot_dedupe_audit
  on games_library_private.game_sales_snapshot_dedupe_audit
  for all
  to service_role
  using (true)
  with check (true);

revoke all on table games_library_private.game_sales_snapshot_dedupe_audit
  from public, anon, authenticated;
grant select, insert, update, delete
  on table games_library_private.game_sales_snapshot_dedupe_audit
  to service_role;

with ranked as (
  select
    s.*,
    first_value(s.id) over (
      partition by s.game_id, s.platform_id, s.source, s.snapshot_date
      order by s.global_sales_millions desc nulls last, s.created_at, s.id
    ) as kept_snapshot_id,
    first_value(to_jsonb(s)) over (
      partition by s.game_id, s.platform_id, s.source, s.snapshot_date
      order by s.global_sales_millions desc nulls last, s.created_at, s.id
    ) as kept_snapshot,
    row_number() over (
      partition by s.game_id, s.platform_id, s.source, s.snapshot_date
      order by s.global_sales_millions desc nulls last, s.created_at, s.id
    ) as rn
  from games_library.game_sales_snapshots s
),
audited as (
  insert into games_library_private.game_sales_snapshot_dedupe_audit (
    deleted_snapshot_id,
    kept_snapshot_id,
    game_id,
    platform_id,
    source,
    snapshot_date,
    deleted_snapshot,
    kept_snapshot
  )
  select
    id,
    kept_snapshot_id,
    game_id,
    platform_id,
    source,
    snapshot_date,
    to_jsonb(ranked),
    kept_snapshot
  from ranked
  where rn > 1
  on conflict do nothing
  returning deleted_snapshot_id
)
delete from games_library.game_sales_snapshots s
using audited a
where s.id = a.deleted_snapshot_id;

create unique index if not exists game_sales_snapshots_business_grain_uidx
  on games_library.game_sales_snapshots (game_id, platform_id, source, snapshot_date)
  nulls not distinct;

-- ============================================================
-- 2. External match review queue and helper functions
-- ============================================================

create or replace view games_library.external_match_review_queue
with (security_invoker = true)
as
select
  c.id as candidate_id,
  c.source,
  c.source_dataset,
  c.source_key,
  c.source_row_id,
  c.status,
  c.confidence_score,
  c.matched_by,
  c.source_title,
  c.source_platform_text,
  c.source_platform_id,
  sp.name as source_platform_name,
  c.source_release_year,
  c.game_id,
  g.title as game_title,
  g.release_year as game_release_year,
  g.source_type as game_source_type,
  g.source_ref as game_source_ref,
  g.cover_url as game_cover_url,
  c.signals,
  c.raw_payload,
  (c.signals ->> 'title_group_count')::int as title_group_count,
  (c.signals ->> 'platform_match')::boolean as platform_match,
  c.signals ->> 'year_signal' as year_signal,
  case
    when c.status <> 'needs_review' then 'not_pending'
    when coalesce((c.signals ->> 'title_group_count')::int, 0) > 1 then 'ambiguous_catalog_title'
    when c.signals ->> 'year_signal' = 'year_conflict' then 'year_conflict'
    when c.matched_by = 'exact_title_platform' then 'platform_match_year_missing_or_weak'
    when c.matched_by = 'exact_title_year' then 'year_match_platform_missing_or_mismatch'
    when c.matched_by = 'exact_title_review_required' then 'multi_signal_manual_review'
    else 'manual_review'
  end as review_lane,
  case
    when c.status <> 'needs_review' then 999
    when coalesce((c.signals ->> 'title_group_count')::int, 0) > 1 then 10
    when c.signals ->> 'year_signal' = 'year_conflict' then 20
    when c.matched_by = 'exact_title_year' then 30
    when c.matched_by = 'exact_title_platform' then 40
    else 50
  end as review_priority,
  case
    when c.status <> 'needs_review' then 'Already reviewed or not pending.'
    when coalesce((c.signals ->> 'title_group_count')::int, 0) > 1 then 'Do not batch approve. Pick the exact canonical game among same-title catalog rows, then approve only that candidate.'
    when c.signals ->> 'year_signal' = 'year_conflict' then 'Reject unless source proves this is the same playable entry and the catalog year is wrong.'
    when c.matched_by = 'exact_title_year' then 'Check platform compatibility. Approve only if the source platform should belong to this game.'
    when c.matched_by = 'exact_title_platform' then 'Check release date/year. Approve if title and platform are the same playable entry and catalog year is missing or acceptable.'
    else 'Review title, platform, year, edition/remaster wording, and raw payload before approving.'
  end as review_instruction,
  c.created_at,
  c.updated_at
from games_library.game_external_match_candidates c
join games_library.games g on g.game_id = c.game_id
left join games_library.platforms sp on sp.id = c.source_platform_id
where c.status = 'needs_review';

comment on view games_library.external_match_review_queue is
  'Human review queue for external match candidates that did not satisfy auto-approval rules.';
comment on column games_library.external_match_review_queue.review_lane is
  'Reason the candidate needs manual review before it can enrich the catalog.';
comment on column games_library.external_match_review_queue.review_instruction is
  'Reviewer guidance for approving or rejecting the candidate.';

revoke all on table games_library.external_match_review_queue
  from public, anon, authenticated;
grant select on table games_library.external_match_review_queue
  to service_role;

create or replace view games_library.external_match_review_lane_summary
with (security_invoker = true)
as
select
  source,
  source_dataset,
  review_lane,
  review_priority,
  count(*) as candidate_count,
  count(distinct game_id) as distinct_games,
  round(avg(confidence_score), 2) as avg_confidence
from games_library.external_match_review_queue
group by source, source_dataset, review_lane, review_priority;

revoke all on table games_library.external_match_review_lane_summary
  from public, anon, authenticated;
grant select on table games_library.external_match_review_lane_summary
  to service_role;

create or replace function games_library_private.review_external_match_candidate(
  p_candidate_id uuid,
  p_decision text,
  p_reviewed_by text default 'manual_review',
  p_review_notes text default ''
) returns table(candidate_id uuid, new_status text)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_status text;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reviewed_by text := coalesce(nullif(btrim(p_reviewed_by), ''), 'manual_review');
begin
  if p_candidate_id is null then
    raise exception 'p_candidate_id is required';
  end if;

  if v_decision not in ('approve', 'reject') then
    raise exception 'p_decision must be approve or reject';
  end if;

  select status
  into v_status
  from games_library.game_external_match_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception 'External match candidate % does not exist', p_candidate_id;
  end if;

  if v_status not in ('needs_review', 'low_confidence') then
    raise exception 'Candidate % is %, expected needs_review or low_confidence', p_candidate_id, v_status;
  end if;

  update games_library.game_external_match_candidates
  set
    status = case when v_decision = 'approve' then 'approved' else 'rejected' end,
    reviewed_by = v_reviewed_by,
    reviewed_at = now(),
    review_notes = case
      when btrim(coalesce(p_review_notes, '')) = '' then review_notes
      when btrim(review_notes) = '' then btrim(p_review_notes)
      else review_notes || E'\n' || btrim(p_review_notes)
    end,
    updated_at = now()
  where id = p_candidate_id
  returning id, status into candidate_id, new_status;

  return next;
end;
$$;

comment on function games_library_private.review_external_match_candidate(uuid, text, text, text) is
  'Sets a pending external match candidate to approved or rejected. Apply enrichment with the appropriate importer/apply function after approval.';

revoke all on function games_library_private.review_external_match_candidate(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function games_library_private.review_external_match_candidate(uuid, text, text, text)
  to service_role;

-- ============================================================
-- 3. Conservative alias backfill from applied external matches
-- ============================================================

create or replace function games_library_private.backfill_aliases_from_external_matches()
returns table(aliases_inserted int)
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into games_library.game_aliases (game_id, alias)
  select distinct
    c.game_id,
    btrim(c.source_title) as alias
  from games_library.game_external_match_candidates c
  join games_library.games g on g.game_id = c.game_id
  where c.status in ('auto_approved', 'approved')
    and c.applied_at is not null
    and btrim(c.source_title) <> ''
    and c.source_title <> g.title
    and lower(btrim(c.source_title)) <> lower(btrim(g.title))
    and games_library_private.normalize_external_key(c.source_title)
      = games_library_private.normalize_external_key(g.title)
  on conflict (game_id, alias) do nothing;

  get diagnostics aliases_inserted = row_count;
  return next;
end;
$$;

comment on function games_library_private.backfill_aliases_from_external_matches() is
  'Adds punctuation/spacing/casing-safe aliases from already-applied external matches whose normalized title equals the canonical title.';

revoke all on function games_library_private.backfill_aliases_from_external_matches()
  from public, anon, authenticated;
grant execute on function games_library_private.backfill_aliases_from_external_matches()
  to service_role;

select * from games_library_private.backfill_aliases_from_external_matches();

-- ============================================================
-- 4. Tag quality and enrichment signals for recommendation tuning
-- ============================================================

create or replace view games_library.tag_quality_profile
with (security_invoker = true)
as
with catalog as (
  select count(*)::numeric as total_games
  from games_library.games
),
tag_counts as (
  select
    t.id as tag_id,
    t.name,
    count(gt.game_id)::int as game_count
  from games_library.tags t
  left join games_library.game_tags gt on gt.tag_id = t.id
  group by t.id, t.name
)
select
  tag_id,
  name,
  game_count,
  round(100 * game_count::numeric / nullif((select total_games from catalog), 0), 2) as catalog_pct,
  case
    when game_count = 0 then 'unused_tag'
    when game_count::numeric / nullif((select total_games from catalog), 0) >= 0.30 then 'too_broad_downweight'
    when game_count::numeric / nullif((select total_games from catalog), 0) >= 0.10 then 'broad_review'
    when game_count <= 5 then 'too_sparse_review'
    else 'usable'
  end as quality_lane,
  case
    when game_count = 0 then 0.0
    when game_count::numeric / nullif((select total_games from catalog), 0) >= 0.30 then 0.25
    when game_count::numeric / nullif((select total_games from catalog), 0) >= 0.10 then 0.50
    when game_count <= 5 then 0.75
    else 1.00
  end as suggested_weight_multiplier
from tag_counts;

comment on view games_library.tag_quality_profile is
  'Tag coverage profile for recommendation weighting. Broad tags like catalog-wide retro labels should be downweighted rather than treated as strong taste signals.';

revoke all on table games_library.tag_quality_profile
  from public, anon, authenticated;
grant select on table games_library.tag_quality_profile
  to service_role;

create or replace view games_library.game_recommendation_enrichment_signals
with (security_invoker = true)
as
with score_agg as (
  select
    game_id,
    max(critic_score) filter (where critic_score is not null) as best_critic_score,
    max(user_score) filter (where user_score is not null) as best_user_score,
    sum(coalesce(critic_count, 0))::int as critic_review_count,
    sum(coalesce(user_count, 0))::int as user_review_count
  from games_library.game_scores
  group by game_id
),
sentiment_agg as (
  select
    game_id,
    sum(positive_critics)::int as positive_critics,
    sum(neutral_critics)::int as neutral_critics,
    sum(negative_critics)::int as negative_critics,
    sum(critic_review_count)::int as sentiment_critic_reviews,
    sum(positive_users)::int as positive_users,
    sum(neutral_users)::int as neutral_users,
    sum(negative_users)::int as negative_users,
    sum(user_review_count)::int as sentiment_user_reviews
  from games_library.game_review_sentiment_snapshots
  group by game_id
),
sales_agg as (
  select
    game_id,
    max(global_sales_millions) as max_global_sales_millions,
    sum(global_sales_millions) as total_global_sales_millions
  from games_library.game_sales_snapshots
  group by game_id
),
coverage as (
  select
    g.game_id,
    exists(select 1 from games_library.game_external_ids e where e.game_id = g.game_id) as has_external_id,
    exists(select 1 from games_library.game_companies c where c.game_id = g.game_id) as has_company,
    exists(select 1 from games_library.game_age_ratings r where r.game_id = g.game_id) as has_age_rating,
    exists(select 1 from games_library.game_summaries s where s.game_id = g.game_id) as has_summary,
    exists(select 1 from games_library.game_sales_snapshots ss where ss.game_id = g.game_id) as has_sales,
    exists(select 1 from games_library.game_review_sentiment_snapshots rs where rs.game_id = g.game_id) as has_review_sentiment
  from games_library.games g
)
select
  g.game_id,
  g.title,
  g.release_year,
  g.genre_id,
  cardinality(g.tags) as tag_count,
  coalesce(sa.best_critic_score, null) as best_critic_score,
  coalesce(sa.best_user_score, null) as best_user_score,
  coalesce(sa.critic_review_count, 0) as critic_review_count,
  coalesce(sa.user_review_count, 0) as user_review_count,
  coalesce(se.sentiment_critic_reviews, 0) as sentiment_critic_reviews,
  coalesce(se.sentiment_user_reviews, 0) as sentiment_user_reviews,
  round(coalesce(se.positive_critics::numeric / nullif(se.sentiment_critic_reviews, 0), null), 4) as critic_positive_ratio,
  round(coalesce(se.positive_users::numeric / nullif(se.sentiment_user_reviews, 0), null), 4) as user_positive_ratio,
  coalesce(va.max_global_sales_millions, 0) as max_global_sales_millions,
  coalesce(va.total_global_sales_millions, 0) as total_global_sales_millions,
  c.has_external_id,
  c.has_company,
  c.has_age_rating,
  c.has_summary,
  c.has_sales,
  c.has_review_sentiment,
  (
    case when cardinality(g.tags) > 0 then 20 else 0 end
    + case when g.genre_id is not null then 10 else 0 end
    + case when btrim(g.cover_url) <> '' then 10 else 0 end
    + case when c.has_external_id then 10 else 0 end
    + case when c.has_company then 10 else 0 end
    + case when sa.best_critic_score is not null or sa.best_user_score is not null then 15 else 0 end
    + case when c.has_age_rating then 5 else 0 end
    + case when c.has_summary then 10 else 0 end
    + case when c.has_sales then 5 else 0 end
    + case when c.has_review_sentiment then 5 else 0 end
  )::int as data_confidence_score,
  least(8, greatest(-8, round(
    coalesce((sa.best_critic_score - 70) / 10.0, 0)
    + coalesce((sa.best_user_score - 7) * 0.8, 0)
    + coalesce((se.positive_users::numeric / nullif(se.sentiment_user_reviews, 0) - 0.65) * 6.0, 0)
    + least(2.0, ln(1 + coalesce(va.total_global_sales_millions, 0)) * 0.4)
  )::int)) as suggested_quality_adjustment
from games_library.games g
left join score_agg sa on sa.game_id = g.game_id
left join sentiment_agg se on se.game_id = g.game_id
left join sales_agg va on va.game_id = g.game_id
join coverage c on c.game_id = g.game_id;

comment on view games_library.game_recommendation_enrichment_signals is
  'Read-only quality/popularity/enrichment signals for recommendation experiments. suggested_quality_adjustment is capped and should not override taste fit.';

revoke all on table games_library.game_recommendation_enrichment_signals
  from public, anon, authenticated;
grant select on table games_library.game_recommendation_enrichment_signals
  to service_role;

-- Refresh existing duplicate proposal queue after aliases/enrichment are available.
select * from games_library_private.propose_game_duplicate_actions();

commit;

-- Down:
-- begin;
-- drop view if exists games_library.game_recommendation_enrichment_signals;
-- drop view if exists games_library.tag_quality_profile;
-- drop function if exists games_library_private.backfill_aliases_from_external_matches();
-- drop function if exists games_library_private.review_external_match_candidate(uuid, text, text, text);
-- drop view if exists games_library.external_match_review_lane_summary;
-- drop view if exists games_library.external_match_review_queue;
-- drop index if exists games_library.game_sales_snapshots_business_grain_uidx;
-- drop table if exists games_library_private.game_sales_snapshot_dedupe_audit;
-- commit;
