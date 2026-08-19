# Migration Backup/Restore and Squash Guide

> **Updated 2026-07-16.** The previous version of this guide (Steps 3–4 using the
> legacy restore flow) was **confirmed unsafe** and removed: it covered only 9 of the
> 67 real tables (`games_library` + `games_library_private` + `igdb_raw`), and those 9
> used an old schema shape (before surrogate keys) that no longer matches the current
> columns. Use `scripts/backup-all.sh` and `scripts/restore-all.sh` for the current flow.
> This document now describes the real backup/restore flow, validated against a disposable
> Supabase project (containers and ports separate from the primary local project) on
> 2026-07-07: identical row counts and data checksums across all 67 tables in the three
> schemas, plus one real bug found and fixed along the way (see below). On 2026-07-16,
> the schema contract and data were permanently separated: migrations remain lightweight
> in Git and recoverable dumps live on Expanse. Rebuilding production with the external
> runtime catalog was validated on a temporary instance.

---

## Actual Scope

Three schemas matter for full-database recovery:

- `games_library`: 39 base tables + 15 views (catalog, profiles, tags, etc.)
- `games_library_private`: 24 base tables (duplicate-merge audit logs, cleanup tables,
  and some `tmp_*` tables from a previous coverage analysis)
- `igdb_raw`: 4 tables, dominated by `igdb_raw.entities` (raw IGDB API mirror, ~8.3M
  rows, ~4.5GB — most of the database size)

Out of scope (explicit decision, 2026-07-07): the Supabase `auth` schema — the ~51 local
accounts are test accounts and can be recreated if lost.

---

## Prerequisites

- Docker running.
- Supabase CLI installed.
- External drive `/Volumes/Elements` connected (default backup destination; it has ~3TB
  free while the primary drive usually has limited space).

---

## Step 1: Backup

From the `product` repository root:

```bash
./scripts/backup-all.sh
```

This runs `scripts/backup-schema.mjs` for each of the three schemas
(`games_library`, `games_library_private`, `igdb_raw`), writing one custom-format
`pg_dump` file per schema to `/Volumes/Elements/Playfit/Backups/<schema>/`. Point it to
another destination with `./scripts/backup-all.sh --out <dir>` or the
`PLAYFIT_BACKUP_ROOT` environment variable.

---

## Step 2: Structure, Catalog, and Squash

Migrations now represent only the production structure and contract. The runtime catalog
is stored outside Git on Expanse and loaded afterward with `npm run seed:catalog`; full
development data is recovered with the backups described here. Do not run
`npx supabase db squash` again: the current history has already been consolidated.
The operation and its limits are documented in `docs/OPERACIONES-DATOS.md`.

---

## Step 3: Reset the Local Database

> [!WARNING]
> This step deletes **all** content from `games_library`, `games_library_private`, and
> `igdb_raw` in the local container (all 67 tables across the three schemas). Make sure
> Step 1 completed successfully before continuing.

```bash
npx supabase db reset
```

---

## Step 4: Restore

```bash
./scripts/restore-all.sh
```

This runs `scripts/restore-schema.mjs` for each schema, restoring the newest dump from
each one (`pg_restore --clean --if-exists`, safe to rerun). For `games_library`, the
script also forces a recalculation of `games.search_document` after restore; see the bug
note below.

---

## Step 5: Verification

```bash
./scripts/backup-all.sh --out /tmp/verify   # or perform any manual count check
```

Alternatively, compare per-table counts in all three schemas with the backup counts.
The complete detail of what was validated (counts and data checksums across all 67 tables)
is in the 2026-07-07 work session, not in a fixed script. There is no short list of
"expected tables" like in the old version of this guide because the set contains 67 tables
and continues to grow.

---

## Bug Found and Fixed During Validation (2026-07-07)

`games_library.games.search_document` is a `generated always as (...) stored` column that
calls `get_series_name()`/`get_genre_name()` — functions marked `immutable` that actually
query other tables (`series`, `genres`). `pg_restore` does not guarantee that those tables
are loaded before `games` (foreign keys are added only at the end of the restore, so data
load order does not respect dependencies). The generated value can therefore be incomplete
immediately after a restore, missing genre/series lexemes when those tables were empty while
Postgres recalculated the column. `scripts/restore-schema.mjs` now runs a no-op
`UPDATE` (`SET game_id = game_id`) on `games_library.games` at the end of that schema's
restore to force recalculation after everything is loaded. Before and after validation
confirmed that without the fix the `games` checksum differed despite matching row counts;
with the fix, it matches exactly.
