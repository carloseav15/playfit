# Scripts Reference

All entries live in `scripts/` and are run from the `product/` root. The directory currently contains 80 files: 69 `.mjs`, 7 `.sh`, 2 `.sql`, one HTML utility, and one historical log. Read a script's header and run its dry-run mode where available before allowing writes.

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

## External catalog acquisition

### GamesDatabase

- Scrape metadata: `scrape-gamesdatabase-ds.mjs`, `scrape-gamesdatabase-gba.mjs`, `scrape-gamesdatabase-ps1.mjs`, `scrape-gamesdatabase-ps2.mjs`, `scrape-gamesdatabase-psp.mjs`, `scrape-gamesdatabase-saturn.mjs`, `scrape-gamesdatabase-snes.mjs`.
- Match to Playfit: `match-gamesdatabase-ds.mjs`, `match-gamesdatabase-gba.mjs`, `match-gamesdatabase-ps1.mjs`, `match-gamesdatabase-ps2.mjs`, `match-gamesdatabase-psp.mjs`, `match-gamesdatabase-saturn.mjs`, `match-gamesdatabase-snes.mjs`.
- Download covers: `download-gamesdatabase-covers.mjs` (parameterized by platform: `ds`, `gba`, `ps1`, `psp`, `saturn`, `snes`).
- Generate/import: `generate-gamesdatabase-migration.mjs`, `backfill-thegamesdb.mjs`, `backfill-thegamesdb-images.mjs`.

### PSXDataCenter and other sources

- `scrape-psxdatacenter.mjs`, `scrape-psxdatacenter-ps1.mjs`, `match-psxdatacenter.mjs`, `match-psxdatacenter-ps1.mjs`, `download-psxdatacenter-covers.mjs`, `download-psxdatacenter-ps1-covers.mjs`.
- `scrape-rawg.mjs` imports/enriches from RAWG and requires `RAWG_API_KEY`.
- `wikipedia-scrape.mjs` is a supplemental source.
- `import-external-catalog-data.sh`, `import-metacritic-review-sentiment.sh`, and `export-external-catalog-match-report.sh` operate on staged external datasets/reports.

## Catalog maintenance

| Area | Scripts |
|---|---|
| Taxonomy and assignments | `assign-series.mjs`, `assign-tags.mjs`, `cleanup-series.mjs`, `enrich-genres.mjs`, `enrich-platforms.mjs`, `enrich-series.mjs`, `enrich-tags.mjs`, `seed-platforms.mjs` |
| Covers | `backfill-covers.mjs`, `link-covers.mjs`, `check-cover-integrity.mjs` |
| Legacy backfills/generation | `backfill-years.mjs`, `generate-snes-sql.mjs`, `seed-catalog.sh` |
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

To inspect `PlayfitProvider` render cost locally, run the app with
`NEXT_PUBLIC_PROFILE_RENDERS=1`. Development logs will include `react_render`
events with actual and base render duration; production builds keep this disabled.
| `backup-all.sh` / `restore-all.sh` | Whole-catalog backup/restore across the managed schemas |
| `restore-data.sql` | SQL restore helper; inspect before manual execution |
| `validate-migrations.sh` | Validate migration naming and SQL safety conventions |

```bash
npm run catalog:backup
npm run catalog:restore
npm run validate:migrations
```

`grove.html` is an internal static utility, not a Node script. `scrape-ps1.log` is historical output and must not be executed or treated as a source of truth.

To regenerate the inventory:

```bash
find scripts -maxdepth 1 -type f | sort
```
