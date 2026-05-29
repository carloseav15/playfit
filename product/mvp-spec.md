# MVP Spec

## Goal

Ship the smallest version that feels like a real product and can be shown in a portfolio.

## Product Surface

The MVP has six tabs:

1. Onboarding (2-step: platforms + liked games)
2. Today (current run, next up, resume, avoid)
3. Finder (search + affinity scoring)
4. Library (playing now, backlog, wishlist, shelved, beaten, completed, abandoned)
5. Profile (taste profile, track record, export)
6. Upcoming (radar for future releases)

## 1. Today

Purpose:

- show the single active run
- show the best next fresh recommendation
- show the best resume candidate
- show the clearest avoid-for-now warning

Minimum requirements:

- `playing` is unique
- active run is always the primary hero when present
- `next up` excludes `on_hold`
- `resume` only uses `on_hold`
- each recommendation has 2-4 explanation bullets

## 2. Game Finder

Purpose:

- let the user search a title and see predicted affinity even if the game is not currently in the visible library

Minimum requirements:

- search by title and series
- search over active catalog plus hidden universe data
- show:
  - predicted affinity
  - fit tier
  - trap risk
  - short reasons
  - available platforms
- distinguish:
  - known by history
  - predicted from metadata only

## 3. Upcoming

Purpose:

- track future releases and show which ones are worth watching

Minimum requirements:

- ordered by earliest release date
- canonical platforms
- `In your universes` chip
- `Available to you` chip
- fit tier and short reason

## 4. Profile Signals

Purpose:

- make the system legible
- show the user what the engine thinks they like and avoid

Minimum requirements:

- top positive signals
- top negative signals
- patterns from completed vs dropped games
- ability to inspect why a game scored the way it did

## Data Requirements

Minimum structured data:

- game catalog with taste attributes
- user opinions and statuses
- platform ownership/access
- recommendation log
- current and upcoming release data
- drop reasons or friction reasons

## AI Use in the MVP

AI can help with:

- mapping natural language notes into structured tags
- enriching game metadata
- generating predicted affinity for unseen games
- generating short explanations
- maintaining upcoming data

The MVP should not depend on AI for:

- core truth about user preferences
- final status changes
- business rules

## Success Criteria

The MVP is good enough when:

1. A user can open the app and immediately know what to continue, what to start next, and what to avoid.
2. A user can search for a game and get a believable affinity read.
3. The recommendation feels inspectable instead of magical.

## What Not To Build Yet

- authentication
- cloud sync
- multi-user support
- recommendation marketplace
- mobile app
- large-scale ingestion of every platform catalog
