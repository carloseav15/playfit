#!/usr/bin/env bash
# Restores every schema backed up by scripts/backup-all.sh: games_library,
# games_library_private, and igdb_raw. Thin wrapper around
# scripts/restore-schema.mjs, which does the actual pg_restore per schema.
#
# Restores the newest dump per schema unless --dir points at a specific
# backup set. Safe to re-run: restore-schema.mjs uses
# pg_restore --clean --if-exists.
#
# Usage:
#   ./scripts/restore-all.sh [--dir <backup-root>]
set -euo pipefail

SCHEMAS=(games_library games_library_private igdb_raw)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

BACKUP_ROOT=""
if [ "${1:-}" = "--dir" ]; then
  BACKUP_ROOT="$2"
fi

for schema in "${SCHEMAS[@]}"; do
  echo "=== Restoring ${schema} ==="
  if [ -n "${BACKUP_ROOT}" ]; then
    node "${SCRIPT_DIR}/restore-schema.mjs" --schema "${schema}" --dir "${BACKUP_ROOT}/${schema}"
  else
    node "${SCRIPT_DIR}/restore-schema.mjs" --schema "${schema}"
  fi
  echo ""
done

echo "All schemas restored: ${SCHEMAS[*]}"
