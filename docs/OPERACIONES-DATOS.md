# Data Operations and Recovery

The **Expanse** external drive is mounted at `/Volumes/Elements`. Playfit's large,
recoverable data lives in `/Volumes/Elements/Playfit/Backups`; it is not stored in Git
or deployed to production.

## What Belongs Where

| Lugar | Contenido |
| --- | --- |
| Location | Contents |
| --- | --- |
| Git | Lightweight migrations, code, and recovery scripts |
| Expanse | Full backups, IGDB mirror, and runtime catalog seed |
| Production | 17 runtime tables and the catalog required by the web app |
| Active local database | Enriched environment for development and imports |

Full backups are `games_library`, `games_library_private`, and `igdb_raw`.
The `runtime_catalog` seed contains public catalog data only: never profiles, game
states, rate limits, audit data, or cache data.

## Normal Operation

```bash
npm run backup:all
npm run backup:runtime-catalog
npm run backup:verify
```

Run these three commands before bulk data changes, a reset, or IGDB maintenance.

## Local Automation on Expanse

`npm run backup:scheduled` runs the three commands above and then rotates only dumps
older than 30 days. In each group (`games_library`, `games_library_private`, `igdb_raw`,
`runtime_catalog`) it always keeps the newest dump; it never rotates the last backup,
even when it is old.

To run it manually:

```bash
npm run backup:scheduled
PLAYFIT_BACKUP_RETENTION_DAYS=60 npm run backup:scheduled
```

There is currently no Playfit cron job or LaunchAgent installed. To automate this on
macOS, create a LaunchAgent that invokes `npm run backup:scheduled` when Expanse is
mounted. Disable it with `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.playfit.backup.plist`
and re-enable it with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.playfit.backup.plist`.
The job is not installed or loaded automatically from the repository.

## Recover the Enriched Development Environment

This command is destructive **only to the local database**. It rebuilds the schema
and restores the full catalog, private tables, and IGDB mirror from Expanse:

```bash
npm run recover:local
```

Do not point this flow at production. The script requires Expanse to be mounted and
the dumps to exist.

## Rebuild the Reduced Contract

On a disposable local database, apply the migrations and load the external runtime catalog:

```bash
supabase db reset --local
npm run seed:catalog
```

The expected result is the production contract: 17 runtime tables, 65,118 games,
36 platforms, and valid recommendations with empty platform selections.

## Deliberate Boundary

The active local database keeps large data so development remains operational without
an hours-long restore. Expanse is the canonical recoverable copy of that data; do not
delete a large local table until losing immediate availability is accepted or Docker
storage is explicitly migrated to the external drive.
