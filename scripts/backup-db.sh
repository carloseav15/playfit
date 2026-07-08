#!/usr/bin/env bash
# DEPRECATED (2026-07-07): only backs up games_library, missing
# games_library_private and igdb_raw entirely. Replaced by
# scripts/backup-all.sh, which covers all 3 schemas. See
# docs/MIGRATIONS_SQUASH_GUIDE.md.
set -euo pipefail

BACKUP_DIR="${HOME}/db-backups"
mkdir -p "$BACKUP_DIR"

# Remove backups older than 7 days
find "$BACKUP_DIR" -name 'playfit_*.dump' -mtime +7 -delete

FILENAME="playfit_$(date +%Y%m%d_%H%M%S).dump"
echo "→ Backing up games_library schema to ${BACKUP_DIR}/${FILENAME}"

DB_CONTAINER="${DB_CONTAINER:-supabase_db_games-library}"

docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres \
  --schema=games_library --format=custom \
  -f "/tmp/${FILENAME}"

docker cp "$DB_CONTAINER:/tmp/${FILENAME}" "$BACKUP_DIR/"
docker exec "$DB_CONTAINER" rm -f "/tmp/${FILENAME}"

echo "✓ Done ($(du -h "${BACKUP_DIR}/${FILENAME}" | cut -f1))"
