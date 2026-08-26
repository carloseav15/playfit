# Scripts Reference

All entries live in `scripts/` and are run from the `product/` root. The directory currently
contains 51 files: 37 `.mjs`, 9 `.sh`, 3 `.ts`, 2 `.sql`. Read a script's header and run its
dry-run mode where available before allowing writes.

IGDB is the only external catalog source in active use. The web-scraping era (GamesDatabase,
PSXDataCenter, RAWG, Wikipedia, TheGamesDB) was retired 2026-08-25 — those scripts produced
data that is already in `games_library`, and none of them are wired into `package.json` or CI.
If similar coverage gaps come up again, extend the IGDB pipeline below rather than reviving a
scraper for a different source.

## Environment and safety

- Supabase scripts default to the local stack where their header says so. Set `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_KEY` explicitly for privileged operations.
- IGDB fetches require `IGDB_CLIENT_ID` and `IGDB_CLIENT_SECRET`.
- Apply/import scripts can mutate substantial catalog data. Use `--dry-run`, limits, or platform/tier filters when offered and inspect generated files under `reports/` first.
- `supabase db reset` destroys the large local catalog and `igdb_raw` mirror. Use the schema backup/restore tools instead unless a reset and restore are explicitly planned.
- Do not point a maintenance script at production implicitly.

## IGDB pipeline

The normal staged workflow is fetch to `reports/`, inspect, then apply. Each apply script documents whether it fills gaps, replaces source-specific values, or inserts new catalog rows.

| Stage | Scripts |
|---|---|
| Raw mirror | `sync-igdb-mirror.mjs` (`--mode full`, `--resume`, or `--mode incremental`) |
| Catalog and matching | `fetch-igdb-catalog.mjs`, `match-igdb-covers.mjs`, `resolve-igdb-title-collisions.mjs`, `apply-igdb-covers.mjs` |
| Existing-game enrichment | `fetch-igdb-enrichment.mjs`, `apply-igdb-enrichment.mjs`, `apply-igdb-game-genres.mjs`, `backfill-tags-from-igdb-themes.mjs` |
| Series | `fetch-igdb-franchises.mjs`, `apply-igdb-series.mjs` |
| Releases and ratings | `fetch-igdb-releases.mjs`, `apply-igdb-releases.mjs`, `fetch-igdb-age-ratings.mjs`, `apply-igdb-age-ratings.mjs` |
| Quality/company/score data | `fetch-igdb-quality-check.mjs`, `apply-igdb-quality-check.mjs` |
| Similarity and taxonomies | `fetch-igdb-similar-games.mjs`, `apply-igdb-similar-games.mjs`, `fetch-igdb-taxonomies.mjs`, `apply-igdb-taxonomies.mjs` |
| New canonical games | `fetch-igdb-new-games.mjs`, `apply-igdb-new-games.mjs` |

Convenience commands:

```bash
npm run igdb:mirror -- --mode incremental
npm run igdb:mirror:backup
npm run igdb:mirror:restore
```

## External data import (non-scraping)

These operate on datasets or reports staged by hand, not live scraping — kept separate from
the retired scraper family above:

- `import-external-catalog-data.sh`, `import-metacritic-review-sentiment.sh`, and
  `export-external-catalog-match-report.sh` operate on staged external datasets/reports
  (e.g. a manually downloaded Metacritic export) for review-sentiment and cross-catalog
  matching, independent of IGDB.

## Catalog maintenance

| Area | Scripts |
|---|---|
| Taxonomy and assignments | `assign-series.mjs`, `assign-tags.mjs`, `cleanup-series.mjs`, `enrich-series.mjs`, `seed-platforms.mjs` |
| Covers | `link-covers.mjs`, `check-cover-integrity.mjs` |
| Catalog seeding | `seed-catalog.sh` |
| Game identity | `generate-game-identity-candidates.ts` — read-only candidate generation for `edition_of` review |
| User cleanup | `cleanup-users.sql` |

Run the cover check with:

```bash
npm run check:covers
```

## Automated browser quality

Run the headless accessibility audit against the landing, search, and how-it-works pages:

```bash
npm run test:e2e -w apps/web -- e2e/accessibility.spec.ts
```

The Playwright suite runs Chromium and Mobile Safari locally. CI uses a production build with
one retry to reduce development-server variability.

For the complete local quality gate:

```bash
npm run quality
```

## Backup, restore, and migration validation

| Script | Purpose |
|---|---|
| `backup-schema.mjs` / `restore-schema.mjs` | Back up or restore one large local schema, including `games_library` and `igdb_raw` |
| `report-catalog-quality.mjs` | Read-only report of catalog rows with missing metadata or leading punctuation |
| `backup-all.sh` / `restore-all.sh` | Whole-catalog backup/restore across the managed schemas |
| `backup-local.mjs` / `backup-runtime-catalog.mjs` / `restore-runtime-catalog.mjs` | Local and runtime-catalog-only backup/restore variants |
| `verify-playfit-backups.mjs` | Checks a backup's integrity |
| `recover-enriched-local.sh` | Recovers a previously enriched local catalog dump |
| `restore-data.sql` | SQL restore helper; inspect before manual execution |
| `generate-data-migration.sh` | Dumps local `games_library`/`games_library_private` data as a plain-SQL migration, safe for `supabase db push --linked` |
| `validate-migrations.sh` | Validate migration naming and SQL safety conventions |
| `validate-canonical-undo-local.ts` | Validates the canonical undo flow against a local DB |

To inspect `PlayfitProvider` render cost locally, run the app with
`NEXT_PUBLIC_PROFILE_RENDERS=1`. Development logs will include `react_render`
events with actual and base render duration; production builds keep this disabled.

`generate-landing-demo.ts` is a one-time/occasional code generator, not a maintenance
script — it writes `apps/web/src/components/playfit/landing/demo-data.ts`, which the
marketing landing page imports directly. Re-run it whenever the pinned demo taste
profile or its recommendation results should be refreshed.

```bash
npm run catalog:backup
npm run catalog:restore
npm run validate:migrations
```

To regenerate the inventory:

```bash
find scripts -maxdepth 1 -type f | sort
```
