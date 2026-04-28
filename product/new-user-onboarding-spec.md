# New User Onboarding Spec

## Goal

Define the minimum onboarding flow for a new user with an empty base.

The onboarding must do two things at once:

- create enough structured signal to produce a first useful recommendation
- avoid making the user do spreadsheet work

## Product Constraint

The product should not require a user to build a full library before seeing value.

The onboarding must feel like:

- a short guided interview
- not a database setup task

## Core Principle

The first session should answer:

1. What kinds of games usually work for this person?
2. What kinds of games usually fail for this person?
3. What can we recommend right now with honest confidence?

## Ideal Outcome

In less than 5 minutes, a new user should reach a first dashboard that shows:

- Current run, if they already have one
- Next up
- Avoid for now
- Initial profile signals

All of those should be clearly labeled as:

- initial recommendations
- medium or low confidence if the signal is still thin

## Onboarding Flow

### Step 1: Promise Screen

Purpose:

- explain what the product does
- set the right expectation

Suggested copy:

This product helps you stop choosing games for reputation and start choosing games that actually fit your taste and playing habits.

What the user does:

- clicks `Start`

Data saved:

- none

## Step 2: Platform Access

Purpose:

- know what the user can actually play

What the user does:

- selects owned or accessible platforms
- optional: marks a platform as `available`, `limited`, or `planned`

Minimum fields created:

- `platforms.csv` stays canonical
- user rows go to `user_platform_access.csv`

Why this matters:

- recommendations should not surface games the user cannot play
- upcoming releases need `Available to you`

## Step 3: Taste Anchors

Purpose:

- collect the fastest possible cold-start signal

What the user does:

- enters:
  - 3 games they loved
  - 3 games they dropped or did not enjoy
  - 1 game they are currently playing, optional
  - 3 games they are curious about, optional

Input mode:

- search-driven title picker
- free text fallback when a title is not found

Data created:

- draft `user_game_opinions.csv` rows
- initial `status`
- rough seed for `recommendation_log.csv` if the curiosity list is used

Why this matters:

- it creates a first contrast between positive and negative examples
- it avoids long questionnaires before value appears

## Step 4: AI Interview

Purpose:

- transform raw examples into structured taste signals

What the AI asks:

- Why did you love this game?
- Why did this one fail for you?
- What frustrates you most when playing?
- What matters more to you: story, pace, progression, combat, atmosphere, challenge?
- When a game fails, do you usually drop it, pause it, or watch the rest?

Rules:

- no more than 5 to 8 short questions
- use adaptive follow-up only when confidence is low
- avoid asking for ratings on everything

Data created:

- `user_profile.csv`
- structured notes and tags on `user_game_opinions.csv`
- early friction patterns

AI responsibility:

- map natural language into structured tags
- infer a first profile
- identify obvious risk factors

Human responsibility:

- answer honestly
- correct false assumptions

## Step 5: Profile Confirmation

Purpose:

- make the system legible
- let the user fix bad inferences early

What the UI shows:

- You tend to like:
  - strong story
  - clear progression
  - fast engagement
- You tend to bounce when:
  - pacing is slow
  - systems feel confusing
  - the loop feels repetitive

What the user does:

- confirms
- edits
- removes wrong assumptions

Data updated:

- corrected `user_profile.csv`

Why this matters:

- this prevents the product from feeling like a black box

## Step 6: First Recommendation Output

Purpose:

- show value immediately after onboarding

What the UI shows:

- `Current run`
- `Next up`
- `Avoid for now`
- `Upcoming worth watching`

Each recommendation must include:

- affinity
- confidence
- 2-4 short reasons

Important:

- if confidence is low, say so directly
- do not pretend to have strong certainty from weak data

## Step 7: Feedback Loop

Purpose:

- improve the model without burden

What the user does after playing:

- answers 3 short check-in prompts:
  - Did this session feel good, mixed, or stalled?
  - Do you want to come back soon?
  - What caused friction, if any?

Data updated:

- `session_checkins.csv`
- optional updates to `user_game_opinions.csv`

Why this matters:

- the product becomes more accurate through lightweight feedback instead of heavy reviews

## Minimum Data Needed To Escape Cold Start

This is the minimum viable onboarding payload:

- 3 liked games
- 3 disliked or dropped games
- platform access
- 1 short AI interview

That is enough to produce:

- an initial profile
- first-pass affinity
- early avoidance signals

## What The AI Does Behind The Scenes

During onboarding, AI should:

- normalize title inputs
- infer likely matches when titles are ambiguous
- transform natural language into structured tags
- create a first user profile
- estimate affinity for unseen games
- generate explanation bullets

The AI should not:

- fabricate certainty
- invent ownership/platform access
- overwrite explicit user corrections

## Data Flow

### User Input

- selected platforms
- liked games
- dropped/disliked games
- currently playing game, optional
- curiosity list, optional
- short natural-language answers

### Structured Outputs

- `user_platform_access.csv`
- `user_game_opinions.csv`
- `user_profile.csv`
- `session_checkins.csv`, later

### Derived Outputs

- current run
- next up
- avoid for now
- upcoming fit

## Portfolio Framing

This onboarding is useful in a portfolio because it demonstrates:

- cold-start product thinking
- explainable AI usage
- conversion from natural language to structured user modeling
- pragmatic scoping

## Versioning Recommendation

Keep two modes in mind:

### Operator Mode

- current workflow
- Codex edits CSVs
- useful for prototyping and internal validation

### User Mode

- onboarding conversation replaces manual CSV work
- the app becomes a real product surface

The product should be presented as moving from operator mode toward user mode.

## Next Design Artifact

After this spec, the next useful artifact is:

- a screen-by-screen onboarding wireframe

That wireframe should include:

- the minimum input fields
- the AI prompt moments
- the profile confirmation step
- the first recommendation screen
