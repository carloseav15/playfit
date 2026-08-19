# Dogfooding readout

This is the minimal measurement kit for the first controlled dogfooding
period. It does not add new events or new tables — everything here reads
`games_library.core_loop_events` as defined in
[CORE_LOOP_INSTRUMENTATION.md](./CORE_LOOP_INSTRUMENTATION.md). Session-level
sequences come first; aggregates come second and should not be trusted at
small N.

The schema has no `session_id`. Sessions below are approximated by a
30-minute inactivity gap per user, which is standard practice and good
enough for a handful of dogfooding testers. Do not over-interpret a session
boundary that falls exactly on the gap threshold.

## 1. Session narrative (read this first)

The primary artifact for early dogfooding is not a KPI, it's the literal
sequence of what one person saw and did. This reconstructs it in order,
labels each session, and carries `recommendation_id`/`rank`/`state_version`
so any row can be traced back to the exact model that produced it.

```sql
with ordered as (
  select
    e.*,
    lag(occurred_at) over (partition by user_id order by occurred_at) as prev_at
  from games_library.core_loop_events e
  where e.event_name in (
    'onboarding_completed', 'recommendation_generated', 'recommendation_shown',
    'recommendation_skipped', 'recommendation_saved', 'recommendation_started',
    'recommendation_outcome', 'recommendation_rejected', 'recommendation_decision_undone'
  )
), sessioned as (
  select
    *,
    sum(case when prev_at is null or occurred_at - prev_at > interval '30 minutes'
             then 1 else 0 end)
      over (partition by user_id order by occurred_at) as session_seq
  from ordered
)
select
  user_id,
  client_platform,
  session_seq,
  occurred_at,
  event_name,
  recommendation_id,
  game_id,
  rank,
  outcome,
  state_version,
  operation_id,
  target_operation_id
from sessioned
where user_id = :user_id
order by occurred_at;
```

**Ordering caveat, checked by running this against real data**: `occurred_at`
has no companion sequence column, so if two rows ever land at the identical
microsecond, their relative order in the output is whatever Postgres
returns, not necessarily insertion order. Running this exact query against a
synthetic session confirmed the effect — but only when every event was
inserted inside one shared SQL transaction (`now()` is frozen for the whole
transaction, so every row gets the same timestamp). That situation cannot
happen for a real dogfooding session: `recommendation_shown`/`skipped`/
`saved` are each their own HTTP request/transaction, and a decision request
for a card cannot reach the server before the request that rendered that
card did. So the ordering is reliable for real traffic; treat a same-session
tie in exported data as a sign the export itself batched several rows into
one transaction, not as evidence of an out-of-order event.

Reading it: each `recommendation_generated`/`recommendation_shown` pair with
the same `recommendation_id` (`play-next:<stateVersion>`) is one exposure.
A `recommendation_outcome` or `recommendation_rejected` row inherits the
`recommendation_id`/`rank` of the exposure that produced it (via
`attach_recommendation_provenance`), and its own `state_version` is the
*post*-decision version — so "what changed after this outcome" is just: the
next `recommendation_generated` row whose `state_version` is one higher.
A `recommendation_decision_undone` row's `target_operation_id` names exactly
which prior row it invalidates.

Concretely, the pattern from the brief —
`shown A → skip → shown B → save → shown C → Loved` — is legible directly
from this output as consecutive `recommendation_shown` rows with
`game_id` A/B/C, interleaved with the matching `recommendation_skipped` /
`recommendation_saved` / `recommendation_outcome` rows, each carrying its own
`recommendation_id`. What the *next* recommendation was is simply the next
`recommendation_generated` row after the outcome, and its `state_version`
tells you whether it came from the updated (N+1) profile or not.

## 2. Effective vs raw

Always compute funnel counts from the **effective** set — canonical rows not
targeted by a later `recommendation_decision_undone` — exactly as specified
in CORE_LOOP_INSTRUMENTATION.md. Undo intentionally leaves the original row
in place for audit; counting raw rows will overstate outcomes.

```sql
create or replace view games_library.core_loop_events_effective as
select e.*
from games_library.core_loop_events e
where not exists (
  select 1 from games_library.core_loop_events u
  where u.user_id = e.user_id
    and u.event_name = 'recommendation_decision_undone'
    and u.target_operation_id = e.operation_id
);
```

(A view, not a new table — purely a read convenience over existing rows.)

## 3. Minimal aggregate signals

Every query below is per-tester-cohort, not global; do not blend
dogfooding users with anyone else. Replace `:since` with the dogfooding
start date.

```sql
-- Onboarding -> first recommendation shown (funnel entry)
select
  count(*) filter (where event_name = 'onboarding_completed') as onboarded,
  count(*) filter (where event_name = 'recommendation_shown') as ever_shown
from games_library.core_loop_events_effective
where occurred_at >= :since;

-- Shown / skip / save per session
with ordered as (
  select *, lag(occurred_at) over (partition by user_id order by occurred_at) as prev_at
  from games_library.core_loop_events_effective
  where occurred_at >= :since
), sessioned as (
  select *,
    sum(case when prev_at is null or occurred_at - prev_at > interval '30 minutes' then 1 else 0 end)
      over (partition by user_id order by occurred_at) as session_seq
  from ordered
)
select
  user_id, session_seq,
  count(*) filter (where event_name = 'recommendation_shown') as shown,
  count(*) filter (where event_name = 'recommendation_skipped') as skipped,
  count(*) filter (where event_name = 'recommendation_saved') as saved,
  count(*) filter (where event_name in ('recommendation_outcome', 'recommendation_rejected')) as decided
from sessioned
group by user_id, session_seq
order by user_id, session_seq;

-- Outcome distribution (Loved/Liked/Mixed/Dropped) + rejection rate
select
  count(*) filter (where event_name = 'recommendation_rejected') as not_for_me,
  count(*) filter (where outcome = 'loved') as loved,
  count(*) filter (where outcome = 'liked') as liked,
  count(*) filter (where outcome = 'mixed') as mixed,
  count(*) filter (where outcome = 'dropped') as dropped,
  count(*) filter (where outcome in ('loved', 'liked'))::numeric
    / nullif(count(*) filter (where outcome is not null), 0) as positive_outcome_rate
from games_library.core_loop_events_effective
where occurred_at >= :since;

-- Recommendations shown before the first positive outcome, per user
with ranked as (
  select
    user_id, event_name, outcome, occurred_at,
    row_number() over (partition by user_id order by occurred_at) as seq
  from games_library.core_loop_events_effective
  where occurred_at >= :since and event_name in ('recommendation_shown', 'recommendation_outcome')
), first_positive as (
  select user_id, min(seq) as positive_seq
  from ranked
  where event_name = 'recommendation_outcome' and outcome in ('loved', 'liked')
  group by user_id
)
select r.user_id, count(*) filter (where r.event_name = 'recommendation_shown') as shown_before_positive
from ranked r
join first_positive fp on fp.user_id = r.user_id and r.seq <= fp.positive_seq
group by r.user_id;

-- Repeated-rejection pattern: users who skipped/rejected 3+ times in a row with no save/positive outcome between
with ordered as (
  select user_id, event_name, outcome, occurred_at,
    row_number() over (partition by user_id order by occurred_at) as seq
  from games_library.core_loop_events_effective
  where event_name in ('recommendation_skipped', 'recommendation_rejected', 'recommendation_saved', 'recommendation_outcome')
), flagged as (
  select *, case when event_name in ('recommendation_skipped', 'recommendation_rejected') then 0 else 1 end as is_negative
  from ordered
), streaks as (
  select *, seq - sum(1 - is_negative) over (partition by user_id order by seq) as grp
  from flagged
)
select user_id, min(occurred_at) as streak_start, count(*) as streak_len
from streaks
where is_negative = 0
group by user_id, grp
having count(*) >= 3
order by streak_len desc;

-- Does the model behave differently once a user has real outcomes? (directional only, not a statistical claim)
select
  case when ratedCount_before = 0 then 'pre-first-rating' else 'post-first-rating' end as phase,
  count(*) filter (where outcome in ('loved', 'liked'))::numeric / nullif(count(*), 0) as positive_rate
from (
  select e.*,
    (select count(*) from games_library.core_loop_events_effective p
     where p.user_id = e.user_id and p.event_name = 'recommendation_outcome'
       and p.outcome in ('loved','liked','mixed','dropped') and p.occurred_at < e.occurred_at) as ratedCount_before
  from games_library.core_loop_events_effective e
  where e.event_name = 'recommendation_outcome' and e.occurred_at >= :since
) t
group by 1;
```

That's the whole kit: one narrative query, one view, six aggregates. Nothing
here requires a dashboard; a notebook or a saved query is enough for the
first cohort.

## 4. Interpretation rules

Classify every dogfooding observation into exactly one of these before
acting on it. The order matters — check "technical bug" first, because a bug
can masquerade as any of the others.

**Technical bug** — something in the data is structurally impossible or
inconsistent with the contract in CORE_LOOP_INSTRUMENTATION.md /
CANONICAL_TASTE_FEEDBACK.md:
- `recommendation_generated`/`recommendation_shown` state_version sequence
  goes backwards for a user, or a `recommendation_shown` references a
  `state_version` that was never generated.
- A canonical outcome's `state_version` is not exactly one greater than the
  state_version of the decision that preceded it for that user.
- The same `operation_id` appears on two different canonical rows with
  different `outcome`/`event_name` (idempotency contract violated).
- A `recommendation_outcome`/`recommendation_rejected`/`recommendation_started`
  row's `recommendation_id`/`rank` points at a game that was not the primary
  candidate in the `recommendation_generated` row for that `state_version`.
- An effective-set query (undo-aware) still counts a row that a
  `recommendation_decision_undone` targets.
- Two clients (e.g. a resumed web tab and a mobile app) show materially
  different canonical state for the same user at the same wall-clock time
  with no pending operation between them.
→ **Stop and fix before drawing any product conclusion from that session.**
This is the only category that blocks trusting the data itself.

**Recommendation-quality issue** — the pipeline is behaving exactly as
designed (correct sequence, correct provenance, correct state transitions),
but the *content* is wrong: a tester repeatedly gets Dropped/Not for me on
recommendations that look reasonable on paper, or the same weak candidate
keeps resurfacing. Evidence: clean event trail, poor outcome distribution.
→ Log it, do not touch scoring yet (out of scope for this loop) — wait for
enough sessions to see a pattern, then take it to a separate scoring pass.

**UX issue** — the recommendation may well be correct, but the session
trail shows the user didn't do what you'd expect a person who liked/disliked
it to do: e.g., many `recommendation_shown` with no follow-up decision
event at all for a long stretch, or an outsized skip rate concentrated in
the first session (may mean onboarding didn't set expectations, not that
the picks are bad).
→ Look at the actual product surface with a person, not the data alone.

**Insufficient evidence** — one or two testers, a handful of sessions. Do
not fit a story to it. Say explicitly "N is too small to conclude X" rather
than letting a single bad streak read as a systemic problem in either the
pipeline or the scoring.

## 5. What this readout deliberately does not do

No new events, no new tables beyond one read-only view, no dashboard, no
statistical model, no change to scoring/onboarding/Search/Picks. If a
question in the objective genuinely cannot be answered from
`core_loop_events` as it exists today, that is worth flagging explicitly
rather than silently adding an event to route around it.
