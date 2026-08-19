# Core-loop instrumentation

This document freezes the measurement contract for the Playfit decision loop.
It does not change recommendation scoring or taste-learning semantics.

## Event matrix

| Signal | Web | API/database | iOS | Android | Canonical | Reliable |
| --- | --- | --- | --- | --- | --- | --- |
| `onboarding_completed` | profile persistence | profile trigger | profile persistence | profile persistence | server | yes |
| `recommendation_generated` | Play Next route | validated append | Play Next route | Play Next route | server | yes |
| `recommendation_shown` | `/api/core-loop-events` | validated append | visible Today card | visible Play Next card | no | yes |
| `recommendation_started` | canonical command | profile trigger | canonical command | canonical command | yes | yes |
| `recommendation_outcome` | canonical command | profile trigger | canonical command | canonical command | yes | yes |
| `recommendation_rejected` | canonical command | profile trigger | canonical command | canonical command | yes | yes |
| `recommendation_skipped` | `/api/core-loop-events` | validated append | `skip` action | `skipRecommendation` | no | yes |
| `recommendation_saved` | `/api/core-loop-events` | validated append | `addPick` action | `togglePick` recommendation | no | yes |

The server-triggered rows are shared by Web, iOS, and Android because all three
use `/api/decisions`. `started` remains a product-acceptance fact only; it does
not alter taste traits. Client observations share a vocabulary, recommendation
identity, rank lookup, and endpoint on all three clients.

## Payload and identity

`games_library.core_loop_events` stores only event identity and attribution:
`event_id`, `event_key`, pseudonymous authenticated `user_id`, name/source,
server timestamp, `state_version`, `recommendation_id`, game ID/rank, canonical
operation IDs, and an allowed outcome. It never stores profile JSON, trait/tag
arrays, titles, free-form content, email, device ID, or IP address.

`recommendation_id` is `play-next:<stateVersion>`. The corresponding candidate
rank comes from the same authoritative Play Next model. A client event supplies
a UUID `eventId`; the unique `(user_id, event_key)` makes retry, restart, and
duplicate HTTP delivery harmless. A canonical row uses `canonical:<operationId>`;
the existing mutation idempotency and unique operation index make offline replay
and retry harmless as well.

The client event endpoint rejects a stale version and validates game/rank against
the authenticated user's current authoritative model. It is intentionally not
used for canonical facts.

## Attribution and undo

Before a canonical transition, `/api/decisions` snapshots the current Play Next
candidate list. If the acted-on game is present, it attaches that model identity
and rank to the trigger-created canonical event. Search/manual state mutations do
not use this canonical endpoint, so they cannot silently become recommendation
conversions. Outcomes inherit the most recent non-undone Started recommendation
provenance for the same game.

Undo appends `recommendation_decision_undone` with `target_operation_id`; it
never deletes history. Effective metrics exclude any canonical event whose
operation is later targeted by that undo row. Thus an undone Started is retained
for audit but is not a final conversion.

## Query proof

Run against local Supabase only. Every query below uses effective canonical rows.

```sql
with effective as (
  select e.* from games_library.core_loop_events e
  where not exists (
    select 1 from games_library.core_loop_events u
    where u.user_id = e.user_id
      and u.event_name = 'recommendation_decision_undone'
      and u.target_operation_id = e.operation_id
  )
)
select event_name, count(*)
from effective
where event_name in ('recommendation_shown', 'recommendation_started', 'recommendation_rejected', 'recommendation_skipped')
group by event_name;

with effective as (
  select e.* from games_library.core_loop_events e
  where not exists (
    select 1 from games_library.core_loop_events u
    where u.user_id = e.user_id and u.event_name = 'recommendation_decision_undone'
      and u.target_operation_id = e.operation_id
  )
), evaluated as (
  select outcome from effective where event_name = 'recommendation_outcome'
)
select
  count(*) filter (where event_name = 'recommendation_started')::numeric /
    nullif(count(*) filter (where event_name = 'recommendation_shown'), 0) as shown_to_started,
  count(*) filter (where outcome in ('loved', 'liked'))::numeric /
    nullif(count(*), 0) as positive_outcome_rate,
  count(*) filter (where outcome = 'loved')::numeric / nullif(count(*), 0) as loved_rate,
  count(*) filter (where outcome = 'dropped')::numeric / nullif(count(*), 0) as drop_rate
from effective full join evaluated on false;
```

For decision latency, pair the first `recommendation_shown` with the subsequent
effective `recommendation_started` for the same user/recommendation/game. The
event timestamps are server receipt time, not an untrusted client clock.
