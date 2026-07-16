# Data Quality Reports

This directory stores curated catalog-cleanup artifacts that are useful for
understanding Playfit's data-maintenance process.

Generated screenshots, HTML exports, and exploratory CSVs should stay in the
local `reports/` directory, which is ignored by git. Move only durable evidence
or reviewer-facing summaries into this docs area.

## Search catalog quality strategy

Search quality should improve in stages, with each stage measured against a small
review set before it changes user-visible results:

1. Keep canonical games searchable even when their names use punctuation or
   unusual casing; do not hide records based only on a leading `.`, `_`, or `...`.
2. Use existing metadata signals first: canonical identity, release state, genre,
   tags, cover availability, and duplicate/alias relationships.
3. Add a review-only report of suspicious rows before adding any hard exclusion.
   A row should become hidden only when the rule is explainable and reversible,
   such as an explicitly flagged import artifact or duplicate.
4. Apply quality ordering to browse results only after the candidate set and
   pagination contract are covered by API tests.

The current low-risk next step is a report and test fixture for suspicious titles,
not a title-pattern blacklist. This avoids removing legitimate games such as
`.hack` entries while still making catalog noise measurable and reviewable.

The unfiltered browse endpoint now uses `games_library.game_catalog_browse` to
assign a reversible metadata-based quality score before pagination. It does not
hide or delete records. Browse requests with genre or platform filters retain the
existing query path until their filtered-pagination contract is covered separately.

The quality report also labels probable import artifacts and demo/promotional
records separately. Those labels are review candidates only; they are not an
automatic deletion rule.
