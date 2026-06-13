# Playfit

Playfit is a Next.js App Router app that turns a game catalog, platform access, ratings, and profile
signals into practical recommendations for what to start, resume, or skip.

## Stack

- Next.js 16 App Router, React 19, TypeScript strict mode, Tailwind CSS v4
- Supabase Auth and Postgres in the `games_library` schema
- `@playfit/core` workspace package for domain logic, schema validation, seed loading, and profile persistence
- Biome for linting and Vitest/Playwright for automated checks

Next is pinned to `16.3.0-canary.34` intentionally. On June 9, 2026, `next@16.2.7`
reintroduced a moderate `postcss` audit finding in this repo, while the canary plus the current
PostCSS override kept `npm audit --audit-level=moderate` clean.

## Commands

```bash
npm install
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
npm audit --audit-level=moderate
npm run test:e2e
npm run check:covers
```

Use Node 22 (`.nvmrc`) for local development and CI parity.

## Architecture

- `apps/web` contains the Next.js app, route handlers, UI, and Playwright e2e tests.
- `packages/core` contains shared domain logic, Zod schemas, Supabase seed loading, and browser profile persistence.
- Prefer focused core entrypoints:
  - `@playfit/core/domain` for recommendations and onboarding logic
  - `@playfit/core/types` for shared types
  - `@playfit/core/store` for browser profile persistence
  - `@playfit/core/supabase` for the browser Supabase client

The root `@playfit/core` entrypoint remains for compatibility, but new imports should use the
focused entrypoints to avoid pulling browser/database infrastructure into pure domain code.

## Supabase

Local schema lives in `supabase/`. The migration creates `games`, `platforms`, and `profiles`, plus
grants, indexes, and RLS policies.

```bash
supabase start
supabase db reset --local
```

The migration does not seed the full catalog. Import catalog data separately before using a fresh DB
as the main app backend.

Profile API behavior:

- Authenticated users are resolved through Supabase `auth.getUser(jwt)`.
- Anonymous local mode uses a browser `deviceId` and persists through `/api/profile` with the
  server-side service-role client.
- `deviceId` is a convenience identifier for local/private use, not a strong security boundary.

## Data Quality

`npm run check:covers` validates the live Supabase catalog against `apps/web/public/covers/games`.
It fails on missing local cover files or unsupported local cover paths, and reports duplicate catalog
title groups for manual review.
