# Migration squash — propuesta histórica (reemplazada)

Generada y validada el 2026-07-07. Fue reemplazada el 2026-07-16 por el historial
canónico reducido que sí vive en `supabase/migrations/`. Conservamos este directorio
como evidencia del análisis original, no como instrucciones operativas. Para recuperar
el sistema actual, usar `docs/OPERACIONES-DATOS.md` y
`docs/MIGRATIONS_SQUASH_GUIDE.md`.

## The numbers

107 migration files, 50,121 lines total, classified by content:

| Class | Files | Lines | What it means |
|---|---:|---:|---|
| DATA_ONLY | 33 | 32,182 | Pure backfill/merge/apply — no schema change, just one-time data operations |
| MIXED | 40 | 11,244 | Schema change bundled with data (e.g. add column + backfill it) |
| DDL_ONLY | 17 | 2,162 | Genuine schema-only changes |
| CORRECTIVE | 4 | 3,561 | Explicit revert/rollback of an earlier migration's mistake |
| OTHER | 13 | 972 | Small grants/alters that didn't match the classifier's patterns (checked by hand, nothing surprising) |

**87% of all migration content (43,426 of 50,121 lines) is one-time data operations**,
not schema evolution. Replaying 107 files to reconstruct "how the schema got here" makes
a future reader (or an interviewer skimming the repo) wade through 43K lines of ETL to
find the 2,162+11,244 lines that actually shaped the schema.

## La propuesta original

`baseline_schema.sql` in this directory is `pg_dump --schema-only` of the **current
real local schema** (all 3 schemas: `games_library`, `games_library_private`,
`igdb_raw`) — not a replay, a direct snapshot of the end state. It would replace all 107
files in `supabase/migrations/` with this one.

## Validation done (2026-07-07)

Applied this exact file to a fresh, fully disposable Supabase project (own containers/
ports, separate from the main local project), then dumped `--schema-only` from both the
disposable project and the real local DB and diffed them.

**Result: byte-for-byte identical**, except for a random per-invocation `\restrict`
token pg_dump embeds (not schema content). Zero structural drift.

## What this does NOT do

- Does not touch data. Data comes back via `scripts/restore-all.sh` (see
  `docs/MIGRATIONS_SQUASH_GUIDE.md`), not migration replay.
- Does not delete the 107 original files anywhere but your approval — they'd move out
  of `supabase/migrations/` (so a fresh `supabase db reset` only runs the one baseline)
  but nothing is proposed to be deleted from git history.

## Estado actual

La consolidación ya fue aplicada y validada por contrato, con datos runtime fuera de
Git. Este archivo no debe usarse para reemplazar las migraciones actuales.
