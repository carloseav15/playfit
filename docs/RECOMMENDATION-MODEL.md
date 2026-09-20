# Operational recommendation model

Playfit helps a player choose a next game from explicit taste evidence and available platforms.
This document describes the operational SQL engine, not the Python research model.

## Request flow

A verified session loads persisted state. Discovery uses `score_today_recommendations`;
Picks and dossiers use `score_recommendation_games` after the shared-scoring migration.
Both call `games_library_private.score_recommendation_candidates` for the numeric calculation.
The API then hydrates catalog records and human-readable reasons. Clients display server scores.

The per-game endpoint can score an already-played, unrelated or unavailable game so that its
existing dossier remains inspectable. Scoring a game is not a claim that it is eligible for
Play Next. Discovery retains its existing exclusion and platform rules.

## Calculation

Positive and negative weighted tag cosine similarities contribute separately:

- Affinity starts at 15; positive similarity contributes up to 85 before confidence scaling.
- Matching genre adds 8; externally rated quality can add up to 3, limited by rating volume.
- Risk starts at 10; negative similarity contributes up to 90 before confidence scaling.
- Avoided genre and specific difficulty/horror combinations add watch-outs.
- Game-vector regularization reduces exaggerated similarity from sparse metadata.
- Confidence uses outcome-count tiers: below 3, 3–5, and 6 or more. It scales signal strength
  by 0.65, 0.9, or 1.0. It is not a probability of enjoyment.

Discovery excludes risk scores of 58 or more, then sorts affinity descending and risk ascending.
That means risk primarily acts as a filter and tie-breaker, not a continuous trade-off against
positive fit. These weights are heuristics, not learned or calibrated probabilities.

## Consistency and caching

Recommendation cache identity includes the user, state version and model version. Picks also
includes the saved IDs. New feedback must not reuse a result computed from an older profile.
The dossier exposes a retry state if the server cannot score; it does not silently substitute a
second numerical model. Explanation text uses the shared TypeScript tag vocabulary; its fallback
weight snapshot is not a live catalog attribution or proof of the numerical contribution.

## Known limits

- Dominant-side evidence loses the magnitude of disagreement. The lab evaluates a representation
  retaining both sides; it is not enabled in persisted profiles.
- Outcome-count confidence does not capture trait relevance, contradiction or metadata quality.
- Rejection cannot identify which specific trait caused the user to dislike a game.
- There is no real-user calibration study or established enjoyment probability.
- Unit and fixture SQL parity checks do not establish full-catalog performance.

## Reproduce

```sh
npm test
npm run typecheck
npm run validate:scoring:local
```

The SQL check requires the project's local Supabase Docker database, uses a synthetic catalog,
and rolls back. Apply migration `20260912204151_share_recommendation_scoring.sql` before deploying
its API consumers. The test does not apply it persistently or modify production.
