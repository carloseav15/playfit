# Scripts Reference

All scripts live in `scripts/`. Run them from the project root.

## Scraping & Enrichment

| Script | Purpose | Requires | Notes |
|---|---|---|---|
| `scrape-rawg.mjs` | Import/enrich games from RAWG API | `RAWG_API_KEY` env | Free tier: 20k req/month |
| `enrich-genres.mjs` | Normalize genre data | Supabase connection | One-time enrichment |
| `enrich-series.mjs` | Normalize series data | Supabase connection | One-time enrichment |
| `assign-series.mjs` | Assign series_id to games | Supabase connection | Batch assignment |
| `assign-tags.mjs` | Assign tags to games | Supabase connection | Batch assignment |
| `backfill-covers.mjs` | Download missing cover images | Supabase connection | Downloads to `apps/web/public/covers/games/` |
| `backfill-years.mjs` | Fill missing release_years | Supabase connection | Uses RAWG data |
| `link-covers.mjs` | Symlink cover paths | Filesystem | Post-migration cover path fixes |
| `wikipedia-scrape.mjs` | Scrape game data from Wikipedia | — | Supplemental data source |

## Data Quality & Validation

| Script | Purpose | Requires | Notes |
|---|---|---|---|
| `check-cover-integrity.mjs` | Validate local cover files vs DB catalog | `SUPABASE_SERVICE_KEY` env | Run via `npm run check:covers` |
| `validate-migrations.sh` | Validate migration file naming, syntax, idempotency | — | Run in CI |

## Database Operations

| Script | Purpose | Requires | Notes |
|---|---|---|---|
| `backup-db.sh` | Dump `games_library` schema to `~/db-backups/` | Docker (local Supabase) | Auto-cleans backups >7 days |
| `restore-backup.sh` | Restore dump to local Supabase | Docker | Transforms old schema → current |
| `seed-platforms.mjs` | Seed platform definitions | Supabase connection | Populates `platforms` table |
| `restore-data.sql` | SQL helper for manual data restore | psql | Reference only |

## Other

| Script | Purpose |
|---|---|
| `grove.html` | Internal reference / utility page |
| `cleanup-series.mjs` | Clean up generic series assignments |

## Quick Reference

```bash
# Validate local covers
npm run check:covers

# Backup local database
bash scripts/backup-db.sh

# Restore from backup
bash scripts/restore-backup.sh ~/db-backups/playfit_20260610_125041.dump

# Run migration validation
bash scripts/validate-migrations.sh
```
