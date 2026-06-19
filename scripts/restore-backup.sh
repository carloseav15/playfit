#!/usr/bin/env bash
set -euo pipefail

BACKUP_FILE="${1:-$HOME/db-backups/playfit_20260610_125041.dump}"
DB_HOST="${DB_HOST:-host.docker.internal}"
DB_PORT="${DB_PORT:-54322}"
DB_USER="${DB_USER:-postgres}"
DB_PASS="${DB_PASS:-postgres}"
DB_NAME="${DB_NAME:-postgres}"
IMAGE="postgres:18-alpine"

BACKUP_DIR="$(dirname "${BACKUP_FILE}")"
BACKUP_NAME="$(basename "${BACKUP_FILE}")"

TEMP_SCHEMA="_backup_import"
ORIG_SCHEMA="games_library"
TEMP_CONTAINER="pg_restore_temp"

psql_cmd() {
  docker run --rm --network=host -e PGPASSWORD="${DB_PASS}" -i "${IMAGE}" \
    psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" "$@"
}

echo "=== Restoring from backup: ${BACKUP_FILE} ==="

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "ERROR: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo ""
echo ">>> 1/6 Creating backup import schema in Supabase..."
psql_cmd <<-EOSQL
DROP SCHEMA IF EXISTS ${TEMP_SCHEMA} CASCADE;
CREATE SCHEMA ${TEMP_SCHEMA};

CREATE TABLE ${TEMP_SCHEMA}.games (
  game_id text NOT NULL,
  title text NOT NULL,
  aliases text[] DEFAULT '{}',
  series text,
  primary_genre text,
  release_year integer,
  release_state text,
  source_type text,
  source_ref text,
  cover_url text,
  tags text[] DEFAULT '{}',
  notes text,
  sort_date date,
  release_label text,
  PRIMARY KEY (game_id)
);

CREATE TABLE ${TEMP_SCHEMA}.platforms (
  id text NOT NULL PRIMARY KEY,
  name text NOT NULL,
  rawg_id integer
);

CREATE TABLE ${TEMP_SCHEMA}.game_platforms (
  game_id text NOT NULL,
  platform_id text NOT NULL,
  PRIMARY KEY (game_id, platform_id)
);

CREATE TABLE ${TEMP_SCHEMA}.profiles (
  id uuid NOT NULL PRIMARY KEY,
  user_id text NOT NULL,
  game_states jsonb,
  profile jsonb,
  onboarding jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
EOSQL

echo ""
echo ">>> 2/6 Starting temp PostgreSQL container with backup mounted..."
docker rm -f "${TEMP_CONTAINER}" 2>/dev/null || true
docker run -d --name "${TEMP_CONTAINER}" -e POSTGRES_PASSWORD=postgres \
  -v "${BACKUP_DIR}:/backup:ro" "${IMAGE}" > /dev/null

for i in $(seq 1 10); do
  if docker exec "${TEMP_CONTAINER}" pg_isready -U postgres > /dev/null 2>&1; then
    break
  fi
  sleep 1
done
sleep 3

echo ""
echo ">>> 3/6 Creating old-schema tables in temp container..."
docker exec "${TEMP_CONTAINER}" psql -U postgres -d postgres \
  -c "CREATE SCHEMA IF NOT EXISTS ${ORIG_SCHEMA}" \
  -c "CREATE TABLE ${ORIG_SCHEMA}.games (game_id text NOT NULL, title text NOT NULL, aliases text[] DEFAULT '{}', series text, primary_genre text, release_year integer, release_state text, source_type text, source_ref text, cover_url text, tags text[] DEFAULT '{}', notes text, sort_date date, release_label text, PRIMARY KEY (game_id))" \
  -c "CREATE TABLE ${ORIG_SCHEMA}.platforms (id text NOT NULL PRIMARY KEY, name text NOT NULL, rawg_id integer)" \
  -c "CREATE TABLE ${ORIG_SCHEMA}.game_platforms (game_id text NOT NULL, platform_id text NOT NULL, PRIMARY KEY (game_id, platform_id))" \
  -c "CREATE TABLE ${ORIG_SCHEMA}.profiles (id uuid NOT NULL PRIMARY KEY, user_id text NOT NULL, game_states jsonb, profile jsonb, onboarding jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now())"

echo ""
echo ">>> 4/6 Restoring dump data into temp container..."
docker exec -e PGPASSWORD=postgres "${TEMP_CONTAINER}" \
  pg_restore --dbname="postgresql://postgres:postgres@localhost:5432/postgres" \
    --data-only "/backup/${BACKUP_NAME}" 2>&1

GAMES_IN_TEMP=$(docker exec -e PGPASSWORD=postgres "${TEMP_CONTAINER}" \
  psql -U postgres -d postgres -t -A -c "SELECT count(*) FROM ${ORIG_SCHEMA}.games;")
echo "   Games in temp container: ${GAMES_IN_TEMP}"

if [ "${GAMES_IN_TEMP}" = "0" ] || [ -z "${GAMES_IN_TEMP}" ]; then
  echo "ERROR: No data restored to temp container."
  docker rm -f "${TEMP_CONTAINER}" > /dev/null
  exit 1
fi

echo ""
echo ">>> 5/6 Copying data from temp container to backup schema..."
docker exec -e PGPASSWORD="${DB_PASS}" "${TEMP_CONTAINER}" \
  sh -c "pg_dump --data-only --schema=${ORIG_SCHEMA} 'postgresql://postgres:postgres@localhost:5432/postgres' 2>/dev/null | sed 's/${ORIG_SCHEMA}\\./${TEMP_SCHEMA}./g'" | \
  docker run --rm --network=host -e PGPASSWORD="${DB_PASS}" -i "${IMAGE}" \
    psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" 2>&1 | grep -v "^SET\|^SELECT\|^COPY\|^$" | head -5

GAMES_IN_BACKUP=$(psql_cmd -t -A -c "SELECT count(*) FROM ${TEMP_SCHEMA}.games;")
echo "   Games in backup schema: ${GAMES_IN_BACKUP}"

if [ "${GAMES_IN_BACKUP}" = "0" ] || [ -z "${GAMES_IN_BACKUP}" ]; then
  echo "ERROR: No data in backup schema. Aborting."
  docker rm -f "${TEMP_CONTAINER}" > /dev/null
  exit 1
fi

echo ""
echo ">>> Cleaning up temp container..."
docker rm -f "${TEMP_CONTAINER}" > /dev/null

echo ""
echo ">>> 6/6 Transforming data into current schema..."
psql_cmd -v ON_ERROR_STOP=1 <<-EOSQL
BEGIN;

-- 6a. Series
INSERT INTO ${ORIG_SCHEMA}.series (id, name)
SELECT DISTINCT ON (lower(btrim(g.series)))
  regexp_replace(lower(btrim(g.series)), '[^a-z0-9_]+', '_', 'g'),
  btrim(g.series)
FROM ${TEMP_SCHEMA}.games g
WHERE g.series IS NOT NULL AND btrim(g.series) != ''
ON CONFLICT (id) DO NOTHING;

-- 6b. Genres
INSERT INTO ${ORIG_SCHEMA}.genres (id, name)
SELECT DISTINCT ON (lower(btrim(genre_part)))
  regexp_replace(lower(btrim(genre_part)), '[^a-z0-9_]+', '_', 'g'),
  btrim(genre_part)
FROM ${TEMP_SCHEMA}.games g,
  unnest(string_to_array(g.primary_genre, ';')) AS genre_part
WHERE g.primary_genre IS NOT NULL AND btrim(g.primary_genre) != ''
ON CONFLICT (id) DO NOTHING;

-- 6c. Tags
INSERT INTO ${ORIG_SCHEMA}.tags (id, name)
SELECT DISTINCT ON (lower(btrim(tag_name)))
  regexp_replace(lower(btrim(tag_name)), '[^a-z0-9_]+', '_', 'g'),
  btrim(tag_name)
FROM ${TEMP_SCHEMA}.games g,
  unnest(g.tags) AS tag_name
WHERE array_length(g.tags, 1) > 0
ON CONFLICT (id) DO NOTHING;

-- 6d. Games
INSERT INTO ${ORIG_SCHEMA}.games (
  game_id, title, aliases, release_year, release_state,
  source_type, source_ref, cover_url, tags, notes,
  sort_date, release_label, genre_id, series_id
)
SELECT
  g.game_id,
  g.title,
  COALESCE(g.aliases, '{}'),
  COALESCE(g.release_year, 0),
  COALESCE(g.release_state, 'released'),
  COALESCE(g.source_type, 'finder'),
  COALESCE(g.source_ref, ''),
  COALESCE(g.cover_url, ''),
  COALESCE(g.tags, '{}'),
  COALESCE(g.notes, ''),
  COALESCE(g.sort_date, '1970-01-01'),
  COALESCE(g.release_label, ''),
  CASE
    WHEN g.primary_genre IS NOT NULL AND btrim(g.primary_genre) != ''
    THEN regexp_replace(lower(btrim(split_part(g.primary_genre, ';', 1))), '[^a-z0-9_]+', '_', 'g')
    ELSE NULL
  END,
  CASE
    WHEN g.series IS NOT NULL AND btrim(g.series) != ''
    THEN regexp_replace(lower(btrim(g.series)), '[^a-z0-9_]+', '_', 'g')
    ELSE NULL
  END
FROM ${TEMP_SCHEMA}.games g
ON CONFLICT (game_id) DO NOTHING;

-- 6e. Game-Platforms
INSERT INTO ${ORIG_SCHEMA}.game_platforms (game_id, platform_id)
SELECT gp.game_id, gp.platform_id
FROM ${TEMP_SCHEMA}.game_platforms gp
WHERE EXISTS (SELECT 1 FROM ${ORIG_SCHEMA}.platforms p WHERE p.id = gp.platform_id)
ON CONFLICT DO NOTHING;

-- 6f. Game-Tags
INSERT INTO ${ORIG_SCHEMA}.game_tags (game_id, tag_id)
SELECT DISTINCT g.game_id, t.id
FROM ${TEMP_SCHEMA}.games g,
  unnest(g.tags) AS tag_name
JOIN ${ORIG_SCHEMA}.tags t ON t.id = regexp_replace(lower(btrim(tag_name)), '[^a-z0-9_]+', '_', 'g')
WHERE array_length(g.tags, 1) > 0
ON CONFLICT DO NOTHING;

-- 6g. Game-Aliases
INSERT INTO ${ORIG_SCHEMA}.game_aliases (game_id, alias)
SELECT g.game_id, unnest(g.aliases)
FROM ${TEMP_SCHEMA}.games g
WHERE array_length(g.aliases, 1) > 0
ON CONFLICT DO NOTHING;

COMMIT;
EOSQL

echo ""
echo ">>> Cleaning up backup schema..."
psql_cmd <<-EOSQL
DROP SCHEMA IF EXISTS ${TEMP_SCHEMA} CASCADE;
EOSQL

echo ""
echo "=== Verifying results ==="
psql_cmd <<-EOSQL
SELECT 'games:' || count(*)::text AS count FROM ${ORIG_SCHEMA}.games
UNION ALL
SELECT 'game_platforms:' || count(*)::text FROM ${ORIG_SCHEMA}.game_platforms
UNION ALL
SELECT 'game_tags:' || count(*)::text FROM ${ORIG_SCHEMA}.game_tags
UNION ALL
SELECT 'game_aliases:' || count(*)::text FROM ${ORIG_SCHEMA}.game_aliases
UNION ALL
SELECT 'series:' || count(*)::text FROM ${ORIG_SCHEMA}.series
UNION ALL
SELECT 'genres:' || count(*)::text FROM ${ORIG_SCHEMA}.genres
UNION ALL
SELECT 'tags:' || count(*)::text FROM ${ORIG_SCHEMA}.tags
UNION ALL
SELECT 'profiles:' || count(*)::text FROM ${ORIG_SCHEMA}.profiles
UNION ALL
SELECT 'platforms:' || count(*)::text FROM ${ORIG_SCHEMA}.platforms;
EOSQL

echo ""
echo "=== Restore complete! ==="
