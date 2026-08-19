# Minimum Production Database Contract

Verification date: 2026-07-15.

This document defines the minimum required by the published web app. Production is not expected
to replicate every enrichment table available locally; it was deliberately reduced for the free tier.

## Parity Rule

Required parity is **runtime contract parity**, not table-count parity:

- Tables, views, policies, and functions consumed by `apps/web` must exist and retain their expected
  columns, types, and permissions.
- Ingestion, scraping, bulk-audit, and auxiliary-taxonomy tables may remain local while no production
  endpoint or RPC reads them.
- A production migration must modify the runtime contract explicitly and verifiably; do not run
  `supabase db push` from a tree with migration history pending squash.

## Canonical Production History

On 2026-07-15 the remote ledger was reconciled with verified schema effects. Current migrations,
in the same order locally and in production:

1. `20260707115959_drop_legacy_schemas_for_squash`
2. `20260707120000_baseline_schema`
3. `20260708000000_restrict_api_cache_access`
4. `20260708175936_remaining_tables`
5. `20260709000000_trim_to_production_essentials`
6. `20260710093000_fix_cold_start_recommendations`

The local data snapshot `20260708180011_remaining_tables.sql` was removed from the migration
directory: it contained 90 MB of `INSERT` statements and must not run in production. Its historical
copy and recoverable backups live on Expanse; local data is not reproduced through schema history.

### Reproducibility Status

The local and production ledgers are aligned. A `db reset` rebuilds the reduced contract; the
external `runtime_catalog` seed is then loaded for the public catalog. A temporary-database test
confirmed the sequence: 17 runtime tables, 65,118 games, 36 platforms, and valid cold-start
recommendations.

The runtime catalog seed, without profiles or user data, lives outside Git on Expanse and is loaded
after applying the reduced contract. The enriched local environment is recovered from Expanse's
three full backups. See `docs/OPERACIONES-DATOS.md` for the procedure and limits.

## Tables Queried Directly by the Web App

These tables appear in `from(...)` queries in `apps/web` or `packages/core`:

| Table | Usage |
| --- | --- |
| `games` | catalog, detail, search, health, and profile recommendations |
| `platforms` | platform selector |
| `game_platforms` | availability and game detail |
| `game_tags` | seed catalog data |
| `game_aliases` | identifier resolution and catalog |
| `game_redirects` | canonical ID redirects |
| `game_similar_games` | similar recommendations |
| `series` | series metadata |
| `audit_log` | profile-endpoint auditing |

## Required User State and RPCs

The browser does not write user state directly. The contract consists of these RPCs and their
internal tables: `profiles`, `user_game_states`, `rate_limits`, and `api_cache`.

| Function | Responsibility |
| --- | --- |
| `check_rate_limit` | protect profile and library writes |
| `get_profile`, `upsert_profile`, `delete_profile` | profile and onboarding |
| `upsert_game_state`, `delete_game_state` | local/synchronized state for each game |
| `get_cache`, `set_cache` | server cache |

The public signatures of these functions are part of the contract. Any change must test
`/api/profile` and `/api/profile/games/:gameId`.

## Recommendations: Production Contract

`score_today_recommendations` is called from `apps/web/src/app/api/recommendations/shared.ts`.
In addition to the catalog tables above, it depends on:

- `game_scores` and `game_quality_score` for quality prioritization;
- `tag_weights` for tag similarity;
- `series`, `games`, and `game_platforms` to build recommendation buckets.

Empty platform selection is valid: a user may skip the platform step during onboarding. The
function must interpret an empty array as "no platform filter," not "no games." The
`fix_cold_start_recommendations` migration was applied in production on 2026-07-15 and verified
with an empty array: it returned 20 items in `nextUp`.

The inherited `score_today_recommendations_v2` function has no repository references, database
dependencies, or calls in the recent API logs reviewed. It is not part of the current contract.
Before removing it, keep an observation window or revoke execution if undocumented external clients
should be excluded.

## Reviewed Security Advisors

The `security_definer_view` advisor flagged `game_quality_score` because PostgreSQL views are
privileged by default. Migration `20260716131832_set_game_quality_score_security_invoker.sql`
changes it to `security_invoker=true`, preserves its five columns, and lets the privileged RPC
continue reading `game_scores`; direct anonymous access to this view is not part of the contract
because `game_scores` is not publicly readable.

RPC warnings do not mean every function should become `SECURITY INVOKER`: profile/state wrappers
and the rate limiter need privileged context, and `score_today_recommendations` is called by the
public recommendation API. `score_today_recommendations_v2` has no static use or observed traffic;
keep an observation window before revoking or deleting it.

## Tables That May Remain Local

These families are not read directly by the published web app and may remain in the local
ingestion/enrichment environment:

- IGDB taxonomy and relationships: `game_genres`, `game_themes`, `game_modes`, `game_perspectives`,
  `game_engines`, and their relationship tables;
- snapshots and external sources: `game_releases`, `game_sales_snapshots`,
  `game_review_sentiment_snapshots`, `game_summaries`, `game_external_ids`;
- cleanup and reconciliation queues: `game_duplicate_candidates`, `game_duplicate_groups`,
  `game_external_match_candidates`, `series_cleanup_candidates`, and `series_cleanup_applied`.

A table being local does not authorize deleting a production table. First search static usage, SQL
dependencies, and API traffic.

## Minimum Verification After Each Change

1. Confirm `/api/health` responds and catalog/platform reads still work.
2. Call `score_today_recommendations` with available platforms and with `[]`; both must return a
   valid JSON model.
3. Compare RPC signatures and dependencies of altered views/functions.
4. Review remote migration history before any squash or bulk synchronization.
