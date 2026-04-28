# Wireframe Spec

## Goal

Define the minimum low-fidelity wireframes needed to explain the product.

This document is not a visual design system.

It is a screen-by-screen structure for:

- onboarding
- first recommendation output
- game finder

Each wireframe is defined by:

- purpose
- layout blocks
- primary action
- secondary action
- key states

## Wireframe 1: Landing

### Purpose

Explain the promise of the product and set the right expectation.

### Layout

```text
[Header / Product name]

[Hero title]
Stop choosing games for prestige.
Start choosing games that actually fit you.

[Short supporting copy]

[Primary CTA: Build my profile]
[Secondary CTA: See how it works]

[Optional proof strip]
- Continue
- Next up
- Avoid for now
- Upcoming worth watching
```

### Primary Action

- `Build my profile`

### Secondary Action

- `See how it works`

### Notes

- This screen should frame the product around fit, not popularity.
- It should not mention CSVs, operators, or internal tooling.

## Wireframe 2: Platform Setup

### Purpose

Capture what the user can actually play.

### Layout

```text
[Progress indicator]
Step 1 of 4

[Title]
Where do you play?

[Helper copy]
We use this to avoid recommending games you can't actually access.

[Platform checklist]
- PlayStation 5
- Xbox Series X|S
- Nintendo Switch
- Nintendo Switch 2
- PC
- Older handhelds / legacy platforms

[Optional access state]
Available / Limited / Planned

[Primary CTA: Continue]
[Secondary CTA: Skip for now]
```

### Primary Action

- `Continue`

### Secondary Action

- `Skip for now`

### Key States

- nothing selected
- some selected
- skipped

## Wireframe 3: Taste Anchors

### Purpose

Escape cold start with a small amount of high-value signal.

### Layout

```text
[Progress indicator]
Step 2 of 4

[Title]
Give us a few anchors

[Section A]
3 games you loved
[search input + selected chips/list]

[Section B]
3 games you dropped or didn't enjoy
[search input + selected chips/list]

[Section C]
What are you playing right now? (optional)
[single search input]

[Section D]
What are you curious about? (optional)
[search input + selected chips/list]

[Primary CTA: Continue]
[Secondary CTA: I don't know enough yet]
```

### Primary Action

- `Continue`

### Secondary Action

- `I don't know enough yet`

### Key States

- title match found
- title not found
- duplicate title
- not enough anchors

### Notes

- The search should be forgiving.
- Free-text fallback is acceptable if a title is missing.

## Wireframe 4: AI Interview

### Purpose

Turn examples into structured taste and friction signals.

### Layout

```text
[Progress indicator]
Step 3 of 4

[Title]
Tell us a little more

[Chat-like prompt block]
Why did you love Final Fantasy VII?

[Answer input]

[Next prompt]
What usually makes you drop a game?

[Answer input]

[Optional compact summary rail]
What we are learning:
- story matters
- slow pacing is risky
- repetition hurts fit

[Primary CTA: Build my profile]
[Secondary CTA: Answer later]
```

### Primary Action

- `Build my profile`

### Secondary Action

- `Answer later`

### Key States

- user still answering
- enough signal gathered
- low confidence, ask one more question

### Notes

- This should feel like a short guided interview, not a form.
- Limit to 5-8 short prompts.

## Wireframe 5: Profile Confirmation

### Purpose

Make the model inspectable and let the user correct it.

### Layout

```text
[Progress indicator]
Step 4 of 4

[Title]
This is what we think fits you

[Column A]
You tend to like:
- Strong story
- Clear progression
- Fast engagement
- Strong atmosphere

[Column B]
You tend to bounce when:
- Starts slowly
- Feels repetitive
- Gets confusing
- Lacks emotional pull

[Editable controls]
[x] keep
[edit]
[remove]

[Primary CTA: See my recommendations]
[Secondary CTA: Refine profile]
```

### Primary Action

- `See my recommendations`

### Secondary Action

- `Refine profile`

### Key States

- all confirmed
- some corrected
- low-confidence signals highlighted

## Wireframe 6: First Recommendations

### Purpose

Show immediate product value.

### Layout

```text
[Header]

[Hero card]
Current run / Next up
[cover]
[title]
[affinity]
[confidence]
[2-4 explanation bullets]
[Primary CTA]

[Secondary cards row]
- Best resume
- Avoid for now
- Upcoming worth watching

[Profile summary strip]
Top signals we are using
```

### Primary Action

- `Continue`
- or `Start this next`

### Secondary Actions

- `Why this?`
- `Not for now`
- `Show another option`

### Key States

- no current run
- current run exists
- confidence low
- no resume candidate

### Notes

- This is the first moment the product must feel useful.
- Confidence must be visible when the signal is still thin.

## Wireframe 7: Game Finder

### Purpose

Let the user search any game and inspect likely fit.

### Layout

```text
[Header]
[Search input: Search a game or series]

[Search results list]
- title
- series
- platform availability
- affinity badge

[Selected game panel]
[cover]
[title]
[affinity]
[confidence]
[trap risk]
[why it fits]
[why it may fail]
[available platforms]

[Actions]
[Add to next-up candidates]
[Mark as curious]
[Not for me]
```

### Primary Action

- `Add to next-up candidates`

### Secondary Actions

- `Mark as curious`
- `Not for me`

### Key States

- no query
- no results
- exact match
- metadata-only prediction
- history-backed prediction

### Notes

- This screen is the clearest bridge from prototype to product.
- It should search both visible catalog and hidden universe data.

## Wireframe 8: Lightweight Check-In

### Purpose

Improve the model with minimal user effort.

### Layout

```text
[Small modal or inline card]
How did this session feel?

[Choice group]
- Good
- Mixed
- Stalled

[Choice group]
Do you want to come back soon?
- Yes
- Maybe
- No

[Optional text field]
What caused friction?

[Primary CTA: Save check-in]
[Secondary CTA: Skip]
```

### Primary Action

- `Save check-in`

### Secondary Action

- `Skip`

### Key States

- quick answer only
- answer plus friction note
- skipped

## Wireframe 9: Upcoming

### Purpose

Show future releases ordered by date with fit and availability context.

### Layout

```text
[Section header]
Upcoming

[Ordered list / table]
- Release date
- Title
- Platforms
- Fit tier
- In your universes
- Available to you
- Short reason
```

### Primary Action

- `Track this`

### Secondary Action

- `Dismiss`

### Key States

- exact date
- release window only
- no platform available to user

## Flow Order

Recommended user flow:

1. Landing
2. Platform Setup
3. Taste Anchors
4. AI Interview
5. Profile Confirmation
6. First Recommendations
7. Game Finder
8. Lightweight Check-In
9. Upcoming

## Minimum Prototype Set

If only a few wireframes are needed first, start with:

1. Landing
2. Taste Anchors
3. AI Interview
4. Profile Confirmation
5. First Recommendations
6. Game Finder

That set is enough to communicate the product clearly.

## Next Step

After this document, the next useful artifact is one of:

- low-fidelity ASCII mockups with more spacing detail
- a Figma-ready screen list
- a static HTML product concept page
