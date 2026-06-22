# Roadmap and Known Limitations

This document keeps public-review expectations honest. It is not a promise of dates; it explains
what is intentionally deferred and what is already protected by tests or workflow gates.

## Current Publish-Readiness Scope

- Keep `/play` as the focused MVP entry point for first-contact recommendation flow.
- Keep `/app` as the broader product shell, now aligned with `/play` local-first behavior.
- Preserve local data during development; do not reset local Supabase unless the database is
  disposable.
- Use CI for reproducible source checks and manual workflows for environment-dependent verification.

## Deferred Before Public Demo

- Restore or provision a stable staging catalog before advertising a live demo URL.
- Run a final manual Playwright pass against staging after deployment credentials are confirmed.
- Confirm GitHub repository description, topics, and social preview assets.

## Deferred Data-Quality Work

- Complete duplicate catalog cleanup in a dedicated review queue.
- Continue using redirects and canonical IDs to protect app lookups while cleanup is in progress.
- Keep generated reports under ignored paths or `docs/data-quality/reports/` when they are worth
  preserving.

## Future Technical Improvements

- Split older operational catalog scripts into smaller modules or dedicated tooling packages.
- Add a narrower smoke test for `/api/health` that can run in CI without a live Supabase catalog.
- Decide whether cover integrity should remain a manual check or become required once staging
  credentials are stable.
- Revisit broader folder reshaping only after the product behavior and public demo path are stable.
