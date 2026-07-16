#!/usr/bin/env bash
# Rebuilds the full local enrichment environment from Expanse backups.
# This intentionally resets the local database; it never targets production.
set -euo pipefail

if [[ "${1:-}" != "--confirm" ]]; then
  echo "Refusing to reset the local database without --confirm."
  exit 1
fi

export PLAYFIT_BACKUP_ROOT="${PLAYFIT_BACKUP_ROOT:-/Volumes/Elements/Playfit/Backups}"
[[ -d "$PLAYFIT_BACKUP_ROOT" ]] || { echo "Backup drive unavailable: $PLAYFIT_BACKUP_ROOT"; exit 1; }

supabase db reset --local
./scripts/restore-all.sh --dir "$PLAYFIT_BACKUP_ROOT"
echo "Full local enrichment environment restored from Expanse."
