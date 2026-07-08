#!/usr/bin/env bash
# Backs up every schema that matters for disaster recovery: games_library,
# games_library_private, and igdb_raw. Thin wrapper around
# scripts/backup-schema.mjs, which does the actual pg_dump per schema.
#
# Usage:
#   ./scripts/backup-all.sh [--out <dir>]
#
# Defaults to PLAYFIT_BACKUP_ROOT (or /Volumes/Elements/Backups) via
# backup-schema.mjs's own default, one subdirectory per schema.
set -euo pipefail

SCHEMAS=(games_library games_library_private igdb_raw)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

OUT_DIR=""
if [ "${1:-}" = "--out" ]; then
  OUT_DIR="$2"
fi

for schema in "${SCHEMAS[@]}"; do
  echo "=== Backing up ${schema} ==="
  if [ -n "${OUT_DIR}" ]; then
    node "${SCRIPT_DIR}/backup-schema.mjs" --schema "${schema}" --out "${OUT_DIR}"
  else
    node "${SCRIPT_DIR}/backup-schema.mjs" --schema "${schema}"
  fi
  echo ""
done

echo "All schemas backed up: ${SCHEMAS[*]}"
