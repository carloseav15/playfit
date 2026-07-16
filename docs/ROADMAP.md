# Roadmap and Known Limitations

This document keeps public-review expectations honest. It is not a promise of dates; it explains
what is live, what is protected by tests or workflow gates, and what remains future work.

## Current Publish-Readiness Scope

- Keep `/` as the focused MVP entry point for first-contact recommendation flow.
- Keep `/app` only as a legacy compatibility alias to the current routes; it is not a separate
  product shell.
- Treat [playfit-gold.vercel.app](https://playfit-gold.vercel.app) as the current public product demo.
- Preserve local data during development; do not reset local Supabase unless the database is
  disposable.
- Use CI for reproducible source checks and manual workflows for environment-dependent verification.

## Public Demo Follow-Up

- Add a dedicated custom domain when the public URL should move away from the Vercel alias.
- Keep production backups current before larger catalog or Auth changes.
- Confirm GitHub repository description and topics match the product positioning.
- Run manual Playwright and cover-integrity workflows after material UX or data changes.

## Deferred Data-Quality Work

- Complete duplicate catalog cleanup in a dedicated review queue.
- Continue using redirects and canonical IDs to protect app lookups while cleanup is in progress.
- Keep generated reports under ignored paths or `docs/data-quality/reports/` when they are worth
  preserving.

## Deferred Recommendation-Quality Work

Follow-ups from the 2026-07-05 `score_today_recommendations` performance and quality pass. None
of these are urgent with the current near-zero real user base; they matter more once there is
real usage to validate against.

- **Genre bonus proportional to evidence.** `GENRE_MATCH_BONUS`/`GENRE_MISMATCH_PENALTY` are flat
  constants applied via simple membership checks (`likedGenres`/`avoidedGenres` as plain string
  lists) — a genre backed by one rated game gets the same bonus as one backed by twenty. Fixing
  this properly means changing `likedGenres`/`avoidedGenres` from `string[]` to a counted map
  (mirroring how tag evidence already works) and changing what `score_today_recommendations`
  accepts for those two parameters — i.e. touching the RPC contract again. Low urgency: the genre
  bonus is a minor term (±8 points) next to tag similarity (up to 85 points), so this mostly
  affects tie-breaking between close candidates, not overall ranking quality.
- **Tag facets instead of one flat weight per tag.** Today every tag (difficulty, mood, session
  length, structure, mechanics) is mixed into a single cosine-similarity vector with one weight
  each. A more correct design would group tags into facets (e.g. difficulty, mood, session length,
  structure) and score each facet separately, so a user's profile could express "session length
  matters a lot to me, difficulty barely does" — something a single flat vector can't represent.
  This is a structural redesign, not a tuning change; revisit once there's a real reason to push
  recommendation quality further than tag-weight calibration allows.
- **Per-user tag weights learned from rating history**, instead of one global weight table shared
  by every user. Needs enough real per-user rating volume to fit reliably — not viable with the
  current near-zero real user base, but the right long-term direction once usage exists.
- **`game_similar_games` as an in-RPC affinity signal**, not just the `/similar` route. E.g. a
  small affinity bonus when a candidate is IGDB-similar to games the user has loved. Deferred
  because it touches `score_today_recommendations` again right after the Fase 1 performance fix;
  do it deliberately with fresh `EXPLAIN (ANALYZE, BUFFERS)` verification, not as a quick add-on.
- **Dead code left in place on purpose** (flagged, not removed, during the 2026-07-05 pass):
  `buildTodayModel` and `buildFallbackProfile` in `packages/core/src/domain` (no live callers,
  but exercised by real tests — `buildTodayModel` has 9 dependent test cases); `findSimilarGames`
  and `findSeriesGames` in `recommendations.ts` (dead after the `/similar` route was rewritten to
  query `game_similar_games`/`series_id` directly instead of scanning the full catalog in JS).

## Future Technical Improvements

- Split older operational catalog scripts into smaller modules or dedicated tooling packages.
- Add a narrower smoke test for `/api/health` that can run in CI without a live Supabase catalog.
- Decide whether cover integrity should remain a manual check or become required once staging
  credentials are stable.
- Revisit broader folder reshaping only after the product behavior and public demo path are stable.
