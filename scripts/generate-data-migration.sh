#!/usr/bin/env bash
# Dumps games_library + games_library_private data from the local DB as a
# plain-SQL migration file, safe to apply via `supabase db push --linked`
# (or `supabase db reset` locally) without a direct Postgres connection.
#
# Wraps the dump with DISABLE/ENABLE TRIGGER for the games_library
# array<->table bidirectional sync triggers. These aren't declared FKs, so
# pg_dump can't order tables around them - loading `games` (which carries a
# denormalized tags/aliases/platforms array) before its sync triggers'
# target tables are populated causes FK violations, and loading
# `user_game_states` re-fires a trigger that stomps `profiles.updated_at`
# with the restore time instead of the original value.
#
# Usage:
#   ./scripts/generate-data-migration.sh <output-file>
set -euo pipefail

OUT="${1:?Usage: generate-data-migration.sh <output-file>}"
CONTAINER="supabase_db_games-library"

SYNC_TRIGGERS=(
  "games_library.games:games_aliases_array_sync"
  "games_library.games:games_platforms_array_sync"
  "games_library.games:games_tags_array_sync"
  "games_library.game_aliases:game_aliases_sync"
  "games_library.game_aliases:game_aliases_sync_games"
  "games_library.game_platforms:game_platforms_sync_games"
  "games_library.game_tags:game_tags_sync"
  "games_library.game_tags:game_tags_sync_games"
  "games_library.user_game_states:sync_profile_game_states_trigger"
)

DISABLE_FILE="$(mktemp)"
ENABLE_FILE="$(mktemp)"
trap 'rm -f "${DISABLE_FILE}" "${ENABLE_FILE}"' EXIT

for entry in "${SYNC_TRIGGERS[@]}"; do
  table="${entry%%:*}"
  trigger="${entry##*:}"
  echo "alter table ${table} disable trigger ${trigger};" >> "${DISABLE_FILE}"
  echo "alter table ${table} enable trigger ${trigger};" >> "${ENABLE_FILE}"
done

echo "Dumping data from ${CONTAINER}..."
docker exec "${CONTAINER}" pg_dump -U postgres -d postgres \
  --data-only --column-inserts --rows-per-insert=1000 \
  --schema=games_library --schema=games_library_private \
  -f /tmp/data_migration_raw.sql
docker cp "${CONTAINER}:/tmp/data_migration_raw.sql" /tmp/data_migration_raw.sql
docker exec "${CONTAINER}" rm -f /tmp/data_migration_raw.sql

# pg_dump adds \restrict/\unrestrict psql meta-commands (not valid SQL) that
# break any non-psql runner, including `supabase db push`/`db reset`.
sed -i '' '/^\\restrict /d; /^\\unrestrict /d' /tmp/data_migration_raw.sql

cat "${DISABLE_FILE}" /tmp/data_migration_raw.sql "${ENABLE_FILE}" > "${OUT}"
rm -f /tmp/data_migration_raw.sql

echo "Data migration written to ${OUT} ($(wc -l < "${OUT}") lines, $(du -h "${OUT}" | cut -f1))"
