# Play MVP Product Brief

## Purpose

`/play` is the public MVP experience for Playfit. Its job is not to be a game
library, tracker, wishlist, or catalog browser. Its job is to help a player
answer one concrete question:

```text
What should I play next?
```

The product should feel like a decision assistant: quick calibration, one clear
recommendation, human reasons, fast feedback, and visible learning.

## Product Thesis

Most players do not need another place to manage a backlog first. They need help
turning vague intent, owned platforms, past taste, and current hesitation into a
specific next choice.

Playfit creates value when the user can say:

- "This recommendation makes sense."
- "I understand why Playfit chose it."
- "I can correct it if Playfit is wrong."
- "The next recommendation improves after my feedback."

## Value Proposition

Find what to play next without building a full library first.

The MVP promise:

```text
Pick your platforms, 3 games you loved, and 1 that missed.
Get one clear next pick, understand why, and make it better with feedback.
```

## Primary Loop

```text
Platforms
  -> 3 loved games
  -> 1 game that missed
  -> Play Next
  -> Feedback
  -> Better Play Next
  -> Your Taste
```

The loop should stay short. The MVP wins when the user reaches a useful
recommendation quickly and gives at least one signal back.

## Routes

| Route | Purpose |
|---|---|
| `/play` | Main MVP entry and Play Next recommendation surface |
| `/play/game/[gameId]` | Focused dossier explaining a recommendation |
| `/play/picks` | Short ordered list of saved Playfit recommendations |
| `/play/taste` | Explanation and correction layer for taste signals |

`/app` remains the broader product shell. It should not define the first-contact
experience for this MVP.

## Target User

The MVP is for players who have enough gaming history to name a few games they
loved and one that did not work for them, but who do not want to manually curate
a full library before getting value.

Strong fit:

- Players with backlog fatigue.
- Players choosing between many games across platforms.
- Players who know what they liked before but cannot translate that into the
  next choice.
- Players who want recommendations with reasons, not opaque rankings.

Weak fit for the MVP:

- Users who only want a full collection manager.
- Users who expect automatic importers as the first feature.
- Users who want release calendars, achievements, hours played, or social
  features before recommendations.

## Experience Contract

### `/play`

For a new user, `/play` must show a lightweight launcher and immediately lead to
`Tune your taste`. It must not require login.

The onboarding contract:

- Choose available platforms.
- Choose 3 games the user loved.
- Choose 1 game that missed or did not work.
- Generate the first recommendation.

For a calibrated user, `/play` must open directly on the decision surface:

- One primary recommendation: `Play this next`.
- 2-3 secondary alternatives.
- Human reasons.
- Watch-outs.
- Confidence.
- Fast actions.

Required actions:

| Action | Product meaning |
|---|---|
| `Add to Playfit Picks` | User saves a strong, unplayed recommendation |
| `Already played` | Recommendation is stale for this user; ask how it landed |
| `Not for me` | Recommendation is wrong; steer away |
| `Show another` | Rotate without saving a taste signal |
| `See why` | Open the dossier |

`Show another` must not train the profile. It is a local decision convenience,
not a taste judgment.

### `/play/game/[gameId]`

The dossier should deepen trust, not become a catalog page.

It should prioritize:

- The recommended action.
- Whether the game is already in `Playfit Picks`.
- Match.
- Watch-outs.
- Confidence.
- Human reasons.
- User feedback.
- Link back to Play Next.
- Link to `Your Taste`.

It should de-emphasize:

- Same-series browsing.
- Similar-games browsing.
- Backlog or wishlist management.
- Collection details.

### `/play/picks`

`Playfit Picks` is a short, ordered list of games Playfit thinks are worth the
user's time next.

It should include:

- Saved recommendations only.
- Automatic ordering by current fit.
- Match, watch-outs, confidence, and reasons.
- Actions: `Started`, `Already played`, `Not for me`, `Remove`, `See why`.

It must not become a backlog, wishlist, or manually managed library. Users cannot
add arbitrary games to this list in the MVP.

### `/play/taste`

`Your Taste` answers:

```text
What does Playfit think it knows about me, and why?
```

It should include:

- `Taste Map`: divergent traits with `Lean toward` and `Steer away from`.
- `Taste History`: editable list of taste signals used by Playfit.
- Correction actions: change a signal, remove a signal, open dossier.

It must not become a full history, stats dashboard, or library.

## Learning Contract

Playfit learns only from meaningful taste signals.

Positive signals:

- Onboarding loved games.
- `Loved it`.
- `Liked it`.
- `Already played -> Loved it`.
- `Already played -> Liked it`.

Mixed signal:

- `Mixed`.
- `Already played -> Mixed`.

Negative signals:

- Onboarding miss.
- `Not for me`.
- `Already played -> Dropped it`.

Not taste signals:

- `Maybe later`.
- Backlog.
- Wishlist.
- Playfit Picks.
- Session-only skips from `Show another`.

The recommendation model must not recommend games that are already:

- `completed`
- `beaten`
- `abandoned`
- `excluded`

`Your Taste` is derived from existing onboarding and game state data. It should
not require new tables or migrations.

`Playfit Picks` is also derived from game state. It is intention/curation, not
taste evidence.

## Feedback Mapping

| User decision | Internal effect |
|---|---|
| `Add to Playfit Picks` | `inPlayfitPicks: true` |
| `Started` | `status: "playing"`, `inPlayfitPicks: false` |
| `Maybe later` | `status: "shelved"`, `inBacklog: true` |
| `Not for me` | `rating: 2`, `excluded: true` |
| `Loved it` | `rating: 5` |
| `Liked it` | `rating: 4` |
| `Mixed` | `rating: 3` |
| `Already played -> Loved it` | `status: "completed"`, `rating: 5` |
| `Already played -> Liked it` | `status: "completed"`, `rating: 4` |
| `Already played -> Mixed` | `status: "completed"`, `rating: 3` |
| `Already played -> Dropped it` | `status: "abandoned"`, `rating: 2`, `excluded: true` |

The UI should not describe this as "training the algorithm". It should feel like
normal user decisions.

## Trust Requirements

Trust is the main product risk.

The MVP must avoid:

- Empty recommendation states without a useful explanation.
- Search failures that look like "no games found" when the catalog or API is
  actually broken.
- Recommending a game the user has already completed, abandoned, or excluded.
- Making the user guess what to do if a recommendation is stale.
- Hiding why a game was recommended.
- Showing taste conclusions without a way to correct the evidence.

If platforms or catalog data fail to load, the UI should show a useful error
instead of silently presenting an empty flow.

## Copy Guidelines

Use decision language:

- `Play Next`
- `Find what to play next`
- `Play this next`
- `Add to Playfit Picks`
- `Playfit Picks`
- `Worth checking`
- `Skip for now`
- `Not for me`
- `Already played`
- `See why`
- `Your Taste`

Avoid tracker-first language in `/play`:

- `My Games`
- `Library`
- `Collection`
- `Wishlist`
- `Upcoming`
- `Manage backlog`

Those concepts can exist elsewhere, but they should not frame the MVP.

## Success Criteria

The MVP is working if a first-time user can:

1. Open `/play` without signing in.
2. Understand the promise immediately.
3. Complete calibration without needing a library import.
4. Receive one clear recommendation.
5. Understand why it was recommended.
6. Save a strong recommendation to `Playfit Picks`.
7. Mark a saved pick as started, stale, or wrong.
8. See that `Your Taste` reflects actual taste decisions.
9. Correct a wrong signal without resetting everything.

Useful metrics:

- Onboarding start rate.
- Onboarding completion rate.
- First recommendation generated.
- First recommendation saved to `Playfit Picks`.
- First feedback action used.
- `Already played` usage.
- `Not for me` usage.
- `See why` usage.
- `Your Taste` visits.
- `Playfit Picks` visits.
- Taste signal corrections.
- Empty search and empty recommendation rates.

## Non-Goals For This MVP

Do not add these until the decision loop is validated:

- Automatic library importers.
- Social features.
- AI chat.
- Deep analytics.
- Hours played.
- Achievements.
- Release calendar as a primary surface.
- Full collection management inside `/play`.
- New database tables for taste history.

## Product Bar

Before `/play` is considered public-ready, it should satisfy this standard:

```text
A new user can get a defensible recommendation in one short session,
understand it, correct it, and see Playfit learn from that correction.
```
