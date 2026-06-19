#!/usr/bin/env bash
# Import the metacritic_games.xls CSV export into review sentiment side tables.
# Usage:
#   bash scripts/import-metacritic-review-sentiment.sh [--csv /path/file.csv] [--reset-candidates] [--apply-auto-approved]
set -euo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_games-library}"
REVIEW_SENTIMENT_CSV="${METACRITIC_REVIEW_SENTIMENT_CSV:-/Users/carancibia/Downloads/metacritic_games.xls}"
RESET_CANDIDATES=false
APPLY_AUTO_APPROVED=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --csv)
      REVIEW_SENTIMENT_CSV="${2:-}"
      shift 2
      ;;
    --reset-candidates)
      RESET_CANDIDATES=true
      shift
      ;;
    --apply-auto-approved)
      APPLY_AUTO_APPROVED=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

if [[ -z "$REVIEW_SENTIMENT_CSV" || ! -f "$REVIEW_SENTIMENT_CSV" ]]; then
  echo "Missing file: ${REVIEW_SENTIMENT_CSV}" >&2
  exit 1
fi

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

echo "-> Checking local Supabase DB container: ${CONTAINER}"
docker exec "$CONTAINER" pg_isready -U postgres -d postgres >/dev/null

run_sql "truncate table games_library_private.staging_metacritic_review_sentiment restart identity;"

copy_csv \
  "games_library_private.staging_metacritic_review_sentiment" \
  "game_title, platform_text, developer_text, genre_text, number_players_text, rating_text, release_date_text, positive_critics_text, neutral_critics_text, negative_critics_text, positive_users_text, neutral_users_text, negative_users_text, metascore_text, user_score_text" \
  "$REVIEW_SENTIMENT_CSV"

REVIEW_SENTIMENT_ESCAPED="$(sql_escape "$REVIEW_SENTIMENT_CSV")"
run_sql "
update games_library_private.staging_metacritic_review_sentiment
set
  source_dataset = 'metacritic_review_sentiment',
  source_file = '${REVIEW_SENTIMENT_ESCAPED}',
  normalized_title_key = games_library_private.normalize_external_key(game_title),
  normalized_platform_id = games_library_private.map_external_platform_id(platform_text),
  release_year = games_library_private.extract_external_year(release_date_text),
  imported_at = now();
"

if [[ "$RESET_CANDIDATES" == true ]]; then
  run_sql "
  delete from games_library.game_external_match_candidates
  where source = 'metacritic'
    and source_dataset = 'metacritic_review_sentiment'
    and status not in ('approved', 'rejected')
    and applied_at is null;
  "
fi

echo "-> Refreshing Metacritic review sentiment match candidates"
run_sql "select * from games_library_private.refresh_metacritic_review_sentiment_candidates();"

if [[ "$APPLY_AUTO_APPROVED" == true ]]; then
  echo "-> Applying auto-approved review sentiment candidates into side tables"
  run_sql "select * from games_library_private.apply_approved_metacritic_review_sentiment();"
else
  echo "-> Not applying candidates. Review auto_approved/needs_review first or rerun with --apply-auto-approved."
fi

echo "-> Candidate summary"
run_sql "
select *
from games_library.external_match_candidate_summary
where source = 'metacritic'
  and source_dataset = 'metacritic_review_sentiment'
order by status;
"

echo "-> Review sentiment snapshot summary"
run_sql "
select *
from games_library.review_sentiment_enrichment_summary
order by source, source_dataset;
"
