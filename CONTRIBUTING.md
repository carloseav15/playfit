# Contributing

Playfit is a portfolio-grade product repository. Contributions should keep the
repo easy to review, easy to run locally, and honest about operational limits.

## Local Setup

```bash
npm install
cp .env.example .env
supabase start
bash scripts/seed-catalog.sh
npm run dev
```

Only run `supabase db reset --local` against a disposable local database. It
rebuilds the schema from migrations and removes existing local data.

The migrations create schema and policies. They do not include the full catalog;
import or restore catalog data before testing recommendation flows against a
fresh database.

## Quality Gate

Run the relevant checks before opening a PR:

```bash
npm run check:ci
npm run test:e2e
npm run check:covers
```

When touching Supabase schema, also run:

```bash
npm run validate:migrations
```

## Standards

- Keep runtime secrets out of source control.
- Use named exports.
- Keep `"use client"` scoped to files that need hooks or browser APIs.
- Keep route handlers validated with schemas for external payloads.
- Prefer `packages/core` for pure domain logic.
- Keep generated reports and screenshots out of the root repo surface.

## Pull Requests

PRs should include the user-facing reason for the change, validation performed,
and any known limits. If a check is skipped, explain why.
