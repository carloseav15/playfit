# Performance Notes

This document records measured database behavior so future optimizations stay evidence-based.

## Search

The title and alias search fallback uses `ILIKE '%term%'`. B-tree indexes do not accelerate a
leading-wildcard predicate, so the trigram migration adds GIN indexes for both columns.

Local `EXPLAIN (ANALYZE, BUFFERS)` for `zelda` improved from approximately **87 ms with a
sequential scan** to **0.1 ms with a bitmap index scan**.

Migration:

```text
supabase/migrations/20260716161953_add_search_trigram_indexes.sql
```

## Recommendations

`score_today_recommendations` already benefits from the existing `games.tags` GIN index when a
profile has tags. Local measurements showed:

| Input | Execution time | Plan conclusion |
|---|---:|---|
| Empty liked/disliked tags | ~806 ms | Full catalog scoring; no simple index fixes this branch |
| One liked tag (`action_combat`) | ~8 ms | Existing tags GIN index narrows candidates |

Profile lookup uses `profiles.user_id` primary/unique indexes, and platform filtering uses the
existing `game_platforms(platform_id, game_id)` indexes. No additional recommendation index was
justified by the measured plans.

## Next safe optimization

If the empty-tag path becomes a user-facing latency problem, prefer one of these strategies:

1. Cache the empty-profile result for a short TTL.
2. Use a bounded quality-ranked candidate view/table for cold profiles.
3. Measure the RPC through production observability before changing its scoring semantics.

Do not add more indexes to address the full-catalog branch; the plan shows computation and row
scoring, not an avoidable lookup miss, as the dominant cost.
