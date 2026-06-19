#!/usr/bin/env bash
# Export external catalog match review reports from the local Supabase DB.
# Usage:
#   bash scripts/export-external-catalog-match-report.sh [reports/external-catalog]
set -euo pipefail

CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_games-library}"
OUT_DIR="${1:-reports/external-catalog}"

mkdir -p "$OUT_DIR"

psql_copy() {
  local sql="$1"
  local output="$2"
  docker exec "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off \
    -c "copy (${sql}) to stdout with csv header" > "$output"
}

psql_html() {
  local sql="$1"
  local output="$2"
  {
    printf '<!doctype html><html><head><meta charset=\"utf-8\"><title>External Catalog Match Report</title>'
    printf '<style>body{font-family:-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;margin:32px;color:#171717}table{border-collapse:collapse;margin:16px 0;width:100%%}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left}th{background:#f4f4f5}h1,h2{margin-bottom:8px}.muted{color:#666}</style>'
    printf '</head><body><h1>External Catalog Match Report</h1>'
    printf '<p class=\"muted\">Generated from local Supabase container %s.</p>' "$CONTAINER"
    docker exec "$CONTAINER" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -P pager=off -H -c "$sql"
    printf '</body></html>'
  } > "$output"
}

summary_sql="
select
  source,
  source_dataset,
  status,
  candidate_count,
  avg_confidence,
  distinct_games,
  applied_count
from games_library.external_match_candidate_summary
order by source, source_dataset, status
"

candidates_sql="
select
  source,
  source_dataset,
  status,
  confidence_score,
  matched_by,
  game_id,
  source_title,
  source_platform_text,
  source_platform_id,
  source_release_year,
  signals,
  review_notes
from games_library.game_external_match_candidates
order by
  case status
    when 'auto_approved' then 1
    when 'needs_review' then 2
    when 'low_confidence' then 3
    when 'approved' then 4
    when 'rejected' then 5
    else 6
  end,
  confidence_score desc,
  source,
  source_title
"

review_sql="
select
  source,
  source_dataset,
  confidence_score,
  matched_by,
  game_id,
  source_title,
  source_platform_text,
  source_release_year,
  signals
from games_library.game_external_match_candidates
where status = 'needs_review'
order by confidence_score desc, source, source_title
limit 1000
"

review_sentiment_sql="
select
  game_id,
  platform_id,
  source_dataset,
  source_key,
  source_release_date,
  source_release_year,
  metascore,
  user_score_100,
  positive_critics,
  neutral_critics,
  negative_critics,
  critic_review_count,
  positive_users,
  neutral_users,
  negative_users,
  user_review_count,
  developer_text,
  genre_text,
  number_players_text,
  rating
from games_library.game_review_sentiment_snapshots
order by critic_review_count desc, user_review_count desc, game_id
"

external_review_lanes_sql="
select
  source,
  source_dataset,
  review_lane,
  review_priority,
  candidate_count,
  distinct_games,
  avg_confidence
from games_library.external_match_review_lane_summary
order by review_priority, source, source_dataset, candidate_count desc
"

external_needs_review_sql="
select
  candidate_id,
  source,
  source_dataset,
  review_lane,
  review_priority,
  confidence_score,
  matched_by,
  source_title,
  source_platform_text,
  source_release_year,
  game_id,
  game_title,
  game_release_year,
  title_group_count,
  platform_match,
  year_signal,
  review_instruction
from games_library.external_match_review_queue
order by review_priority, confidence_score desc, source_dataset, source_title
limit 2000
"

duplicate_review_sql="
select
  group_key,
  review_lane,
  review_priority,
  candidate_count,
  known_year_count,
  group_user_ref_count,
  recommended_winner_game_id,
  recommended_winner_title,
  recommended_keep_rows,
  recommended_merge_rows,
  release_years,
  source_types,
  candidate_game_ids,
  review_instruction
from games_library.game_duplicate_manual_review_queue
order by review_priority, candidate_count desc, group_key
limit 2000
"

tag_quality_sql="
select
  tag_id,
  name,
  game_count,
  catalog_pct,
  quality_lane,
  suggested_weight_multiplier
from games_library.tag_quality_profile
order by catalog_pct desc, tag_id
"

recommendation_signals_sql="
select
  game_id,
  title,
  release_year,
  genre_id,
  tag_count,
  best_critic_score,
  best_user_score,
  critic_review_count,
  user_review_count,
  sentiment_critic_reviews,
  sentiment_user_reviews,
  critic_positive_ratio,
  user_positive_ratio,
  total_global_sales_millions,
  data_confidence_score,
  suggested_quality_adjustment
from games_library.game_recommendation_enrichment_signals
order by data_confidence_score desc, suggested_quality_adjustment desc, title
limit 5000
"

psql_copy "$summary_sql" "${OUT_DIR}/summary.csv"
psql_copy "$candidates_sql" "${OUT_DIR}/candidates.csv"
psql_copy "$review_sql" "${OUT_DIR}/needs-review-top-1000.csv"
psql_copy "$review_sentiment_sql" "${OUT_DIR}/review-sentiment-snapshots.csv"
psql_copy "$external_review_lanes_sql" "${OUT_DIR}/external-review-lanes.csv"
psql_copy "$external_needs_review_sql" "${OUT_DIR}/external-needs-review-top-2000.csv"
psql_copy "$duplicate_review_sql" "${OUT_DIR}/duplicate-review-top-2000.csv"
psql_copy "$tag_quality_sql" "${OUT_DIR}/tag-quality-profile.csv"
psql_copy "$recommendation_signals_sql" "${OUT_DIR}/recommendation-enrichment-signals-top-5000.csv"
psql_html "
select * from games_library.external_match_candidate_summary
order by source, source_dataset, status;
" "${OUT_DIR}/index.html"

echo "Wrote:"
echo "  ${OUT_DIR}/summary.csv"
echo "  ${OUT_DIR}/candidates.csv"
echo "  ${OUT_DIR}/needs-review-top-1000.csv"
echo "  ${OUT_DIR}/review-sentiment-snapshots.csv"
echo "  ${OUT_DIR}/external-review-lanes.csv"
echo "  ${OUT_DIR}/external-needs-review-top-2000.csv"
echo "  ${OUT_DIR}/duplicate-review-top-2000.csv"
echo "  ${OUT_DIR}/tag-quality-profile.csv"
echo "  ${OUT_DIR}/recommendation-enrichment-signals-top-5000.csv"
echo "  ${OUT_DIR}/index.html"
