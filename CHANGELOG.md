# Changelog

All notable project-facing changes are tracked here. This project uses practical release notes
rather than strict semantic-version releases while it is prepared as a portfolio repository.

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
