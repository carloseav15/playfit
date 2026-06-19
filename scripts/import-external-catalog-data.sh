#!/usr/bin/env bash
# Import external catalog CSVs into private staging tables and refresh match candidates.
# Usage:
#   bash scripts/import-external-catalog-data.sh [--reset-candidates] [--apply-auto-approved] [--with-reviews]
set -euo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_games-library}"
MC_GAMES_CSV="${METACRITIC_GAMES_CSV:-/Users/carancibia/Downloads/archive/metacritic_games_master.csv}"
VGSALES_CSV="${VGSALES_CSV:-/Users/carancibia/Downloads/Video_Games_Sales_as_at_22_Dec_2016.csv}"
MC_REVIEWS_CSV="${METACRITIC_REVIEWS_CSV:-/Users/carancibia/Downloads/archive/metacritic_reviews_master.csv}"
WITH_REVIEWS=false
RESET_CANDIDATES=false
APPLY_AUTO_APPROVED=false

for arg in "$@"; do
  case "$arg" in
    --with-reviews)
      WITH_REVIEWS=true
      ;;
    --reset-candidates)
      RESET_CANDIDATES=true
      ;;
    --apply-auto-approved)
      APPLY_AUTO_APPROVED=true
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing file: $path" >&2
    exit 1
  fi
}

sql_escape() {
  local value="$1"
  value="${value//\'/\'\'}"
  printf "%s" "$value"
}

psql_exec() {
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off "$@"
}

run_sql() {
  printf "%s\n" "$1" | psql_exec
}

copy_csv() {
  local table="$1"
  local columns="$2"
  local file="$3"

  echo "-> Loading ${file} into ${table}"
  docker exec -i "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
    -c "copy ${table} (${columns}) from stdin with (format csv, header true, quote '\"', escape '\"')" \
    < "$file"
}

require_file "$MC_GAMES_CSV"
require_file "$VGSALES_CSV"
if [[ "$WITH_REVIEWS" == true ]]; then
  require_file "$MC_REVIEWS_CSV"
fi

echo "-> Checking local Supabase DB container: ${CONTAINER}"
docker exec "$CONTAINER" pg_isready -U postgres -d postgres >/dev/null

run_sql "
truncate table
  games_library_private.staging_metacritic_games,
  games_library_private.staging_vgsales
restart identity;
"

copy_csv \
  "games_library_private.staging_metacritic_games" \
  "csv_row_index, title, release_date_text, genre_text, platforms_text, developer_text, esrb_rating, esrb_descriptors, metascore_text, userscore_text, critic_reviews_text, user_reviews_text, num_players, summary" \
  "$MC_GAMES_CSV"

MC_GAMES_ESCAPED="$(sql_escape "$MC_GAMES_CSV")"
run_sql "
update games_library_private.staging_metacritic_games
set
  source_dataset = 'metacritic_games_master',
  source_file = '${MC_GAMES_ESCAPED}',
  normalized_title_key = games_library_private.normalize_external_key(title),
  normalized_platform_id = games_library_private.map_external_platform_id(platforms_text),
  release_year = games_library_private.extract_external_year(release_date_text),
  imported_at = now();
"

copy_csv \
  "games_library_private.staging_vgsales" \
  "name, platform_text, year_of_release_text, genre_text, publisher_text, na_sales_text, eu_sales_text, jp_sales_text, other_sales_text, global_sales_text, critic_score_text, critic_count_text, user_score_text, user_count_text, developer_text, rating_text" \
  "$VGSALES_CSV"

VGSALES_ESCAPED="$(sql_escape "$VGSALES_CSV")"
run_sql "
update games_library_private.staging_vgsales
set
  source_dataset = 'vgsales_2016',
  source_file = '${VGSALES_ESCAPED}',
  normalized_title_key = games_library_private.normalize_external_key(name),
  normalized_platform_id = games_library_private.map_external_platform_id(platform_text),
  release_year = games_library_private.parse_external_int(year_of_release_text),
  imported_at = now();
"

if [[ "$WITH_REVIEWS" == true ]]; then
  run_sql "truncate table games_library_private.staging_metacritic_reviews restart identity;"
  copy_csv \
    "games_library_private.staging_metacritic_reviews" \
    "csv_row_index, reviewer_id, game_title, rating_text, review_text" \
    "$MC_REVIEWS_CSV"

  MC_REVIEWS_ESCAPED="$(sql_escape "$MC_REVIEWS_CSV")"
  run_sql "
  update games_library_private.staging_metacritic_reviews
  set
    source_dataset = 'metacritic_reviews_master',
    source_file = '${MC_REVIEWS_ESCAPED}',
    normalized_title_key = games_library_private.normalize_external_key(game_title),
    imported_at = now();
  "
else
  echo "-> Skipping raw Metacritic reviews. Pass --with-reviews when you want the 280MB review text staged."
fi

if [[ "$RESET_CANDIDATES" == true ]]; then
  run_sql "
  delete from games_library.game_external_match_candidates
  where source in ('metacritic', 'vgsales')
    and source_dataset in ('metacritic_games_master', 'vgsales_2016')
    and status not in ('approved', 'rejected')
    and applied_at is null;
  "
fi

echo "-> Refreshing external match candidates"
run_sql "select * from games_library_private.refresh_external_match_candidates();"

if [[ "$APPLY_AUTO_APPROVED" == true ]]; then
  echo "-> Applying auto-approved candidates into enrichment side tables"
  run_sql "select * from games_library_private.apply_approved_external_enrichment();"
else
  echo "-> Not applying candidates. Review auto_approved/needs_review first or rerun with --apply-auto-approved."
fi

echo "-> Candidate summary"
run_sql "
select *
from games_library.external_match_candidate_summary
order by source, source_dataset, status;
"
