#!/usr/bin/env bash
# Seed catalog data after a fresh supabase db reset --local
# Usage: bash scripts/seed-catalog.sh [--require-db]
set -euo pipefail

SEED_DIR="data/seed"
SEED_FILE="${SEED_DIR}/games_library_seed.sql"
BACKUP_ROOT="${PLAYFIT_BACKUP_ROOT:-/Volumes/Elements/Playfit/Backups}"
REQUIRE_DB=false
[[ "${1:-}" == "--require-db" ]] && REQUIRE_DB=true

# Check if seed dump exists locally
if [ -f "$SEED_FILE" ]; then
  echo "→ Seeding from local file: ${SEED_FILE}"
  psql "$(supabase db url)" -f "$SEED_FILE"
  echo "✓ Catalog seeded from local dump."
  exit 0
fi

# Preferred path: a curated runtime-only catalog on the external drive.
if [ -d "${BACKUP_ROOT}/runtime_catalog" ]; then
  echo "→ Seeding runtime catalog from Expanse: ${BACKUP_ROOT}/runtime_catalog"
  PLAYFIT_BACKUP_ROOT="$BACKUP_ROOT" node scripts/restore-runtime-catalog.mjs
  echo "✓ Runtime catalog seeded from Expanse."
  exit 0
fi

# Option A: Pull from staging (requires access)
if command -v supabase &>/dev/null; then
  STAGING_URL="${STAGING_SUPABASE_URL:-}"
  STAGING_KEY="${STAGING_SUPABASE_SERVICE_KEY:-}"

  if [ -n "$STAGING_URL" ] && [ -n "$STAGING_KEY" ]; then
    echo "→ No local seed found. Attempting staging pull..."
    echo "  To pull from staging, run:"
    echo "    supabase db dump --linked -f ${SEED_FILE} --schema games_library"
    echo "  Then re-run this script."
    echo ""
    echo "  Or manually: pg_dump --schema=games_library --data-only ..."
  fi
fi

# Option B: Scrape from RAWG
echo ""
echo "→ No seed data available. You can:"
echo ""
echo "  1. Create a seed dump from a populated DB:"
echo "     mkdir -p ${SEED_DIR}"
echo "     supabase db dump --local -f ${SEED_FILE} --schema games_library --data-only"
echo ""
echo "  2. Scrape from RAWG API (needs RAWG_API_KEY in .env):"
echo "     node scripts/scrape-rawg.mjs"
echo ""

if [ "$REQUIRE_DB" = true ]; then
  echo "ERROR: --require-db was set but no seed data found."
  exit 1
fi
