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

## Production behavior (2026-09-21)

Production runs on a Supabase **Nano** instance (shared CPU, up to 0.5 GB), in `us-east-1`, the
same region as the Vercel functions (`iad1`). Measured from Vercel and Supabase logs plus an
in-browser session:

- One `score_today_recommendations` call takes about 0.45 s locally but about **2 s in
  production** (4-5 s after idle). Score cost is per catalog scan, not per profile size, and the
  `LIMIT 20` per bucket does not change it.
- Concurrent calls saturate the instance: a burst of 27 calls in five minutes gave a 9.9 s
  median, statement timeouts (`57014`) and even `get_profile` stalling for 11 s. Requests for the
  same model are now coalesced per server instance and the core-loop analytics route no longer
  scores.
- Writes (`apply_profile_transition`, `save_profile`) take about 0.7 s each.
- Play Next's first load used to chain `platforms`, `profile`, `games/batch` and `today`
  (about 13.5 s cold, 2.5 s warm). The profile and today's recommendations are now requested as
  soon as a session exists, in parallel with the platform list.

Reading Vercel runtime logs with the CLI only reaches back a few minutes; Supabase `edge_logs`
(`response.origin_time` per RPC) and `postgres_logs` cover longer windows.

## Next safe optimization

If the empty-tag path becomes a user-facing latency problem, prefer one of these strategies:

1. Cache the empty-profile result for a short TTL.
2. Use a bounded quality-ranked candidate view/table for cold profiles.
3. Measure the RPC through production observability before changing its scoring semantics.

Do not add more indexes to address the full-catalog branch; the plan shows computation and row
scoring, not an avoidable lookup miss, as the dominant cost.
