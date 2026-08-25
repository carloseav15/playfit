-- Performance fix: materialize games_library.game_quality_score.
--
-- Why: production continued hitting "canceling statement due to statement
-- timeout" on games_library.score_today_recommendations (called from
-- POST /api/recommendations/today) after 20260820155601 already reordered
-- candidate filtering ahead of enrichment joins. That migration's own
-- comment flagged the remaining cost: game_quality_score is evaluated as a
-- plain (non-materialized) view, and its body runs two full ROW_NUMBER()
-- OVER (PARTITION BY game_id ...) window-function passes over the entire
-- games_library.game_scores table (once for critic scores, once for user
-- scores) before the FULL JOIN that produces one row per game_id. A window
-- function's PARTITION BY/ORDER BY cannot be satisfied by pruning to a
-- specific game_id ahead of time, so every call to score_today_recommendations
-- -- regardless of how few candidate games survive tag/platform filtering --
-- pays the cost of computing this view over every scored game in the catalog.
--
-- Confirmed via a local EXPLAIN (ANALYZE, BUFFERS) reproduction against
-- synthetic data sized to match production catalog scale (65,000 games,
-- ~162,000 game_scores rows, per reports/catalog-quality.json's `total`):
-- standalone `select * from games_library.game_quality_score` took ~490ms
-- (two Seq Scan + external-merge Sort + WindowAgg passes over game_scores),
-- and in the full score_today_recommendations query plan this Merge Full
-- Join subtree accounted for ~48,070 of the query's ~63,743 total estimated
-- planner cost units (~75%) -- by far the single most expensive operation,
-- ahead of the GIN-indexed tag/platform candidate filtering that the prior
-- migration already fixed. This matches the timing pattern in production's
-- own error history: timeouts recorded both before AND after 20260820155601
-- deployed (e.g. 2026-08-22, 2026-08-24), consistent with this being the
-- next bottleneck once candidate filtering stopped being the dominant cost.
--
-- What changes: game_quality_score becomes a MATERIALIZED VIEW instead of a
-- plain VIEW. The SELECT body is byte-for-byte identical to the existing
-- view definition -- no predicate, join, or column changes. A unique index
-- on game_id (required for REFRESH ... CONCURRENTLY, and also what turns the
-- score_today_recommendations join into an indexed lookup instead of a full
-- window-function recomputation) is added. games_library.score_today_recommendations
-- itself is NOT modified by this migration: it already references
-- games_library.game_quality_score by name, and a materialized view with the
-- same name, columns, and types satisfies that reference identically.
--
-- Data currency: this view sources from games_library.game_scores, which is
-- only written by offline catalog-import tooling (scripts/sync-igdb-mirror.mjs,
-- scripts/import-external-catalog-data.sh, scripts/import-metacritic-review-sentiment.sh),
-- never by user-facing request traffic. A materialized view is stale until
-- refreshed; this migration performs the initial REFRESH but does NOT wire a
-- refresh call into that import tooling -- tracked as a deliberate, minimal-scope
-- follow-up (matching how 20260820155601 itself deferred this same
-- materialization as follow-up work), not included here so this change stays
-- limited to the query-performance fix. Until that follow-up lands, quality
-- scores reflect the catalog as of this migration/the last manual
-- `REFRESH MATERIALIZED VIEW CONCURRENTLY games_library.game_quality_score;`.
--
-- Explicitly unchanged: scoring weights, candidate eligibility, ranking/order
-- semantics, the RPC's signature/security/search_path, and every predicate in
-- score_today_recommendations (protected migration 20260820155601, not
-- modified here).
begin;

drop view games_library.game_quality_score;

create materialized view games_library.game_quality_score as
with critic_ranked as (
  select
    game_scores.game_id,
    game_scores.critic_score,
    game_scores.critic_count,
    row_number() over (
      partition by game_scores.game_id
      order by case game_scores.score_source
        when 'metacritic' then 1
        when 'metacritic_staging' then 2
        when 'igdb' then 3
        when 'rawg' then 4
        when 'vgsales' then 5
        when 'metacritic_review_sentiment' then 6
        else 7
      end
    ) as critic_rank
  from games_library.game_scores
  where game_scores.critic_score is not null
),
user_ranked as (
  select
    game_scores.game_id,
    game_scores.user_score,
    game_scores.user_count,
    row_number() over (
      partition by game_scores.game_id
      order by case game_scores.score_source
        when 'rawg' then 1
        when 'metacritic' then 2
        when 'igdb' then 3
        when 'vgsales' then 4
        when 'metacritic_staging' then 5
        when 'metacritic_review_sentiment' then 6
        else 7
      end
    ) as user_rank
  from games_library.game_scores
  where game_scores.user_score is not null
)
select
  coalesce(c.game_id, u.game_id) as game_id,
  c.critic_score,
  u.user_score,
  c.critic_count,
  u.user_count
from (
  select critic_ranked.game_id, critic_ranked.critic_score, critic_ranked.critic_count
  from critic_ranked
  where critic_ranked.critic_rank = 1
) c
full join (
  select user_ranked.game_id, user_ranked.user_score, user_ranked.user_count
  from user_ranked
  where user_ranked.user_rank = 1
) u on u.game_id = c.game_id;

create unique index game_quality_score_game_id_idx
  on games_library.game_quality_score (game_id);

-- Security note (do not grant anon/authenticated here): 20260716131832 set
-- the previous plain view to `security_invoker = true` specifically so a
-- direct anon/authenticated query against it would run under the caller's
-- own RLS context -- and since games_library.game_scores is RLS-private
-- ("intentionally available through the recommendation RPC only", per that
-- migration), such a query returned zero rows rather than raw scores.
-- Materialized views cannot use security_invoker, and Postgres does not
-- support RLS on materialized views at all (confirmed locally: `ALTER
-- MATERIALIZED VIEW ... ENABLE ROW LEVEL SECURITY` errors as unsupported),
-- so granting anon/authenticated SELECT here would newly expose every row
-- unconditionally -- a real regression of that boundary, not merely a
-- structural change. Omitting the grant reproduces the same practical
-- outcome (no usable direct access for anon/authenticated) through a
-- mechanism materialized views do support. games_library.score_today_recommendations
-- is unaffected: it is owned by, and executes as, the `postgres` superuser
-- (SECURITY DEFINER), which bypasses grants entirely -- confirmed via
-- pg_proc locally (proowner=postgres, prosecdef=true).
grant select on games_library.game_quality_score to service_role;

comment on materialized view games_library.game_quality_score is
  'Materialized for query performance (20260824145027) -- was a plain view whose '
  'two window-function passes over game_scores were the dominant cost inside '
  'score_today_recommendations, causing production statement_timeout failures on '
  'the first Play Next recommendation after onboarding. Source: game_scores, '
  'written only by offline catalog-import scripts. Not auto-refreshed by this '
  'migration''s follow-up -- run REFRESH MATERIALIZED VIEW CONCURRENTLY '
  'games_library.game_quality_score after catalog imports that touch game_scores.';

commit;
