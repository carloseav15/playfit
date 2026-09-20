# Changelog

All notable project-facing changes are tracked here. This project uses practical release notes
rather than strict semantic-version releases while it is prepared as a portfolio repository.

## 2026-09-20

### Changed

- Redesigned web **My Picks** as a poster grid: cover, title and a match badge per game, with the
  whole card linking to the game dossier. Per-card actions (Already Played, Not for me, Remove
  Pick) now live only in the dossier, and going back from the dossier returns to My Picks.
- Unified the feature name to "My Picks" across the navigation, page title, headings and status
  messages, and dropped the `%` suffix on match scores in favor of the 0-100 scale the dossier uses.
- `CoverArt` now falls back to its initials placeholder when a cover image fails to load.

### Fixed

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
