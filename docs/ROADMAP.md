# Roadmap and Known Limitations

This document keeps public-review expectations honest. It is not a promise of dates; it explains
what is live, what is protected by tests or workflow gates, and what remains future work.

## Current Publish-Readiness Scope

- Keep `/play` as the focused MVP entry point for first-contact recommendation flow.
- Keep `/app` as the broader product shell, now aligned with `/play` local-first behavior.
- Treat [playfit-gold.vercel.app](https://playfit-gold.vercel.app) as the current public product demo.
- Preserve local data during development; do not reset local Supabase unless the database is
  disposable.
- Use CI for reproducible source checks and manual workflows for environment-dependent verification.

## Public Demo Follow-Up

- Add a dedicated custom domain when the public URL should move away from the Vercel alias.
- Keep production backups current before larger catalog or Auth changes.
- Confirm GitHub repository description and topics match the product positioning.
- Run manual Playwright and cover-integrity workflows after material UX or data changes.

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
