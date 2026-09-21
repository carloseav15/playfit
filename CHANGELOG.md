# Changelog

All notable project-facing changes are tracked here. This project uses practical release notes
rather than strict semantic-version releases while it is prepared as a portfolio repository.

## 2026-09-21

### Changed

- Play Next now moves to the next candidate immediately after "Not for me", "Loved" and "Liked"
  (including their "already played" variants) instead of replacing the screen with a loading
  skeleton until `/api/decisions` answers (about 4 s in production). The decided game is hidden at
  once, the server's authoritative ranking replaces the pool when it arrives without swapping the
  card the user is looking at, and a decision that fails to save brings the game back. Undo restores
  the game. Decisions made in quick succession still run in order.
- Opening Play Next as a returning visitor now requests the profile and today's recommendations as
  soon as a session exists, in parallel with the platform list, instead of waiting for each step
  in turn (`platforms`, then `profile`, then `games/batch`, then `today`). The early requests are
  single-use, expire after 15 s and are ignored if the signed-in user changed; the app falls back
  to its normal requests if they fail.

### Fixed

- After an optimistic decision the Play Next screen could fall back to the "Finding recommendations"
  skeleton and stay there until a reload. The fetched model looked "newer than the pool" to the
  loading check because the decision response had already advanced the pool, and nothing refreshed
  it any more; a fetched model older than the applied pool is no longer treated as pending.

## 2026-09-20

### Changed

- Reorganized web **Settings** into a section menu (Your platforms, Account, Appearance, Data &
  privacy, ordered by importance) that shows one section at a time, with the active section in the
  URL (`/settings?section=...`) and a one-line summary per entry. Destructive actions are grouped
  in a "Danger zone". The mobile menu now uses the same order.
- Redesigned web **My Picks** as a poster grid: cover, title and a match badge per game, with the
  whole card linking to the game dossier. Per-card actions (Already Played, Not for me, Remove
  Pick) now live only in the dossier, and going back from the dossier returns to My Picks.
- Reorganized web **My Taste** on desktop into a section menu (Taste DNA, Visual map, Activity)
  instead of two nested tab bars, with the active section in the URL (`/taste?section=...`), a
  one-line summary per entry, and the profile summary and stats inside Taste DNA. Selecting a trait
  still jumps to Activity filtered by that trait. Mobile keeps its existing menu.
- Unified the feature name to "My Picks" across the navigation, page title, headings and status
  messages, and dropped the `%` suffix on match scores in favor of the 0-100 scale the dossier uses.
- `CoverArt` now falls back to its initials placeholder when a cover image fails to load.
- **Search** hides the platform and genre filters behind `SEARCH_FILTERS_ENABLED` (off), no longer
  requests filter metadata, and focuses the search input when the page opens.

### Fixed

- Bursts of requests after a decision no longer pile up scoring work on the database. Concurrent
  requests for the same recommendation model now share a single computation, the play-next cache is
  written before the model is returned, and `/api/core-loop-events` checks an event against the
  cached model instead of scoring recommendations again (an event with no cached model is now
  rejected with 409 rather than recomputed). In production a burst of about 27 scoring calls had
  driven `score_today_recommendations` to a 9.9 s median with statement timeouts; locally, 8
  simultaneous requests now trigger 1 scoring call instead of 4 and finish in ~0.8 s instead of up
  to ~4.6 s.
- The dossier's Save/Remove Picks button read a stale session-cached recommendation instead of live
  state, so a game saved from Play Next offered "Save to Picks" again after opening it from My Picks.

### Removed

- The list-style Picks cards (`PicksDesktop`, `PicksMobile`) and their per-card actions.

## 2026-06-22

### Added

- Public repository readiness files: license, contributing guide, security policy, issue templates,
  and pull request template.
- GitHub CI for typecheck, lint, unit tests, production build, dependency audit, and migration
  validation.
- Manual verification workflow for Playwright e2e and optional cover integrity checks.
- Roadmap and known-limitations documentation for deferred deploy, catalog cleanup, and future
  structure work.

### Changed

- Renamed the public repository identity to Playfit.
- Updated `/app` to use the same local-first behavior as `/play`.
- Migrated the Next.js request guard from Middleware to Proxy.
- Moved generated catalog reports out of the root repository surface.
- Made staging deploy and database backup workflows manual instead of automatic.

### Security

- Replaced real-looking `.env.example` values with placeholders.
- Preserved service-role usage outside runtime client code.

## Pre-publication baseline

- Next.js App Router monorepo with `apps/web` and `packages/core`.
- Supabase-backed catalog, profile persistence, recommendation routes, and RLS-aware migrations.
- Vitest and Playwright coverage for recommendation, profile, and local-first flows.
