#!/usr/bin/env bash
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
