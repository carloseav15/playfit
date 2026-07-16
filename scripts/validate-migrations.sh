#!/usr/bin/env bash
# Validates Supabase migration files before applying
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$PROJECT_ROOT/supabase/migrations"
ERRORS=0

echo "=== Migration Validation ==="
echo ""

# 1. Check naming convention
echo "--- Naming convention (YYYYMMDDNNNN_description.sql) ---"
for f in "$MIGRATIONS_DIR"/*.sql; do
  basename=$(basename "$f")
  if [[ ! "$basename" =~ ^[0-9]{14}_.+\.sql$ ]]; then
    echo "  FAIL: $basename does not match YYYYMMDDNNNN_description.sql"
    ERRORS=$((ERRORS + 1))
  else
    echo "  OK: $basename"
  fi
done

echo ""

# 2. Check begin/commit balance
echo "--- begin / commit balance ---"
for f in "$MIGRATIONS_DIR"/*.sql; do
  basename=$(basename "$f")
  begins=$(grep -c "^begin;" "$f" || true)
  commits=$(grep -c "^commit;" "$f" || true)
  rollbacks=$(grep -c "^rollback;" "$f" || true)

  if [ "$begins" -ne "$commits" ] && [ "$rollbacks" -eq 0 ]; then
    echo "  FAIL: $basename has $begins begin(s) but $commits commit(s)"
    ERRORS=$((ERRORS + 1))
  elif [ "$begins" -eq 0 ] && [ "$commits" -eq 0 ]; then
    echo "  INFO: $basename has no transaction wrappers (intentional?)"
  else
    echo "  OK: $basename ($begins begin(s), $commits commit(s))"
  fi
done

echo ""

# 3. Check for idempotent patterns (IF NOT EXISTS / OR REPLACE)
echo "--- Idempotency check ---"
for f in "$MIGRATIONS_DIR"/*.sql; do
  if grep -qi "create table\|create index\|alter table.*add\|create function" "$f" 2>/dev/null; then
    # Check that at least one idempotent pattern is used
    if ! grep -qi "if not exists\|create or replace" "$f" 2>/dev/null; then
      basename=$(basename "$f")
      echo "  WARN: $basename has CREATE/ALTER without IF NOT EXISTS or OR REPLACE"
    fi
  fi
done

echo ""

# 4. Check down migration references all up migrations
echo "--- Down migration coverage ---"
DOWN_FILE="$MIGRATIONS_DIR/20260612999999_down_migration.sql"
if [ ! -f "$DOWN_FILE" ]; then
  DOWN_FILE="$PROJECT_ROOT/supabase/scripts/20260612999999_down_migration.sql"
fi
if [ -f "$DOWN_FILE" ]; then
  for f in "$MIGRATIONS_DIR"/*.sql; do
    basename=$(basename "$f")
    if [ "$basename" = "20260612999999_down_migration.sql" ]; then
      continue
    fi

    # Extract key operations from the migration
    operations=$(grep -E "^create table|^create index|^create function|^alter table" "$f" || true)
    if [ -n "$operations" ] && [ "$basename" != "20260612000001_fix_profile_user_id_type.sql" ] && [ "$basename" != "20260612000002_fts_search_document.sql" ]; then
      # Check if the down migration has corresponding DROP for the tables/indexes created
      tables_created=$(grep "^create table" "$f" | sed -E 's/.*[[:space:]]([a-zA-Z_]+)\(.*/\1/' | sed -E 's/.*\.([a-zA-Z_]+).*/\1/' || true)
      if [ -n "$tables_created" ]; then
        for table in $tables_created; do
          if grep -q "drop.*table.*$table" "$DOWN_FILE" 2>/dev/null; then
            echo "  OK: $basename table '$table' covered in down migration"
          else
            echo "  WARN: $basename table '$table' NOT found in down migration"
          fi
        done
      fi
    fi
  done
else
  echo "  WARN: No down migration file found"
fi

echo ""
echo "=== Results: $ERRORS error(s) ==="
exit $ERRORS
