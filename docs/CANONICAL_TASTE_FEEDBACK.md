# Canonical Taste Feedback

Playfit's canonical decision path covers `started`, `not_for_me`, `loved`, `liked`, and all four Already Played outcomes across Web, iOS, and Android.

## Started semantics

`started` means the user accepted a Playfit recommendation and began playing it. It is a
product-acceptance signal, not a taste signal.

| Effect | Result |
| --- | --- |
| Game state | `status: "playing"`; clears backlog, exclusion, and any Playfit Pick |
| Rating and taste evidence | Unchanged; no rating is invented and no trait affinity is rebuilt |
| Maturity | Unchanged |
| Version and ranking | Advances to N+1 and reranks eligibility so the started game is not in Play Next |
| Undo | A canonical N+2 transition restores the prior game/Pick state and profile semantics |

The command has the same `operationId`, `expectedStateVersion`, retry, FIFO offline, conflict,
and authoritative-snapshot rules as taste outcomes. Its strict payload has `actionType: "started"`
and `gameId`; it deliberately has no `played` or rating field.

No product-analytics event is emitted in this slice. A later instrumentation change should emit
`recommendation_started` only after the authoritative `started` response, correlated to the
recommendation exposure; it must not feed taste training.

## Played-outcome semantics

| Outcome | Game state | Rating | Taste evidence | Maturity | Exclusion | Ranking |
| --- | --- | --- | --- | --- | --- | --- |
| Loved | `completed` | 5 | strong positive | increases | yes, by terminal state | N+1 reflects positive fit and removes this game |
| Liked | `completed` | 4 | positive | increases | yes, by terminal state | N+1 reflects positive fit and removes this game |
| Mixed | `completed` | 3 | none | unchanged | yes, by terminal state | N+1 removes this game without changing trait fit/friction |
| Dropped | `abandoned` | 2 | negative | increases | `true` | N+1 reflects negative evidence and removes this game |

“Already Played” is an intent-only entry point: opening or dismissing its selector performs no mutation. It becomes a decision only after an outcome is chosen. `mixed` is intentionally neutral, not weak directional evidence: Core excludes rating 3 from tags, profile signals, and `ratedCount`.

## Ownership

- Core owns the deterministic transition from a supported action to game state and adaptive profile.
- The API owns authentication, catalog hydration, orchestration, error classification, and the authoritative response.
- Supabase owns concurrency control, idempotency, atomic state/profile persistence, and the monotonic profile revision.
- Web, iOS, and Android submit intent and replace their state and Play Next pool with the authoritative response. Native clients persist canonical commands FIFO for offline delivery and reuse the same `operationId` on retry.

## Request and response contract

Every action request carries a unique `operationId`, an `expectedStateVersion`, the supported `actionType`, `gameId`, and only the optional `played` fact required by the Already Played flow.

Canonical Undo uses the same endpoint with `actionType: "undo_decision"`, a new `operationId`, the current `expectedStateVersion`, and `targetOperationId` pointing to the decision being undone. The target must be the immediately preceding canonical decision. The browser never submits a replacement game state or profile.

A successful response returns the incremented `stateVersion`, the authoritative state, resulting game state, rebuilt versioned profile, and Play Next model. The profile and model repeat that state version, and the model includes ordered candidate identity metadata. These values must agree before the API returns success.

## Invariants

1. A transition is persisted only when the expected revision matches the locked profile revision.
2. Replaying the same operation is idempotent; reusing its ID for different input is rejected.
3. Game state and rebuilt profile are written in one database transaction.
4. The transition RPC returns the locked persisted snapshot from the same transaction; the API ranks that snapshot after persistence succeeds.
5. Ranking uses the persisted N+1 revision and the existing scoring formula.
6. Web hides the retired candidate while the operation is pending and never promotes a candidate from the N pool as though it were N+1.
7. General debounced profile saves also compare their snapshot revision, so they cannot overwrite a canonical transition that wins the race. An authoritative mobile snapshot removes older legacy per-game writes before a sync drain can replay them.
8. A save failure preserves the N pool. A saved transition followed by ranking failure preserves N+1 state but clears stale recommendations and reports the partial failure.
9. Undo is a new transition: N+1 advances to N+2 while restoring the semantic state from N.
10. PostgreSQL captures the prior game state and profile when the original decision is applied. Undo restores that locked pre-decision snapshot inside the database transaction; Core reconstruction is used by the API to validate the transition shape, never as a client authority.
11. Undo after another operation is rejected instead of overwriting later work. Replaying the same Undo is idempotent.

## Database rollout

Migration `20260818000000_canonical_taste_feedback.sql` adds `profiles.state_version`, operation replay metadata, a version-returning general profile save RPC, and the compare-and-set transition RPC. Existing profiles begin at revision `0`; their next successful write advances them to `1`.

Migration `20260818211550_canonical_undo.sql` adds the minimal prior-state metadata for the last canonical decision, extends `apply_profile_transition`, and adds `get_undo_transition_context` plus `apply_profile_undo`. Migration `20260818234907_canonical_undo_authoritative_restore.sql` makes the stored pre-decision profile the restoration source, including for valid legacy profiles. Neither creates an event log or retains an unbounded operation history.

The new RPCs remain behind authenticated execution grants and validate `auth.uid()` inside `SECURITY DEFINER` functions with a fixed `search_path`.

## Remaining legacy boundaries

Picks generally, Search, navigation, Intelligence Lab, and scoring changes remain outside this slice. Their older save paths still exist, but full-profile saves use `stateVersion` compare-and-set and cannot overwrite a canonical transition. Mobile clients discard all queued legacy PATCH/DELETE commands whenever an authoritative snapshot is applied, because those commands have no version guard.
