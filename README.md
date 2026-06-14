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

## Prerequisites

- **Node.js 22** (`.nvmrc`)
- **Docker Desktop** — required for local Supabase
- **Supabase CLI** — `npm install -g supabase` or `brew install supabase/tap/supabase`
- **RAWG API key** — register at https://rawg.io/register (free tier: 20k requests/month)

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Start Supabase locally
supabase start
supabase db reset --local

# 3. Copy environment variables
cp .env.example .env

# 4. Start the dev server
npm run dev
```

> The migration creates the schema but does **not** seed the full catalog. After a fresh DB reset, import catalog data separately (contact the team for a seed dump or run `scripts/scrape-rawg.mjs`).

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

## API Endpoints

| Method | Path | Description | Auth |
|---|---|---|---|
| GET | `/api/health` | Health check (DB connection + game count) | None |
| GET | `/api/games?q=&page=&pageSize=` | Search / paginate game catalog | None |
| GET | `/api/games/:gameId` | Game detail (resolves redirects) | None |
| POST | `/api/games/batch` | Batch lookup (max 500 game IDs) | None |
| GET | `/api/profile?device_id=` | Read user profile | Cookie / Bearer / deviceId |
| POST | `/api/profile` | Save user profile | Cookie / Bearer / deviceId |
| DELETE | `/api/profile?device_id=` | Reset user profile | Cookie / Bearer / deviceId |
| PATCH | `/api/profile/games/:gameId` | Update game state (status, rating, etc.) | Cookie / Bearer / deviceId |
| DELETE | `/api/profile/games/:gameId` | Delete game state | Cookie / Bearer / deviceId |
| POST | `/api/recommendations/today` | Today's recommendation (uses cached catalog) | None |
| POST | `/api/recommendations/similar` | Similar + series games for a game ID | None |
| POST | `/api/recommendations/profile` | Build adaptive profile from onboarding + states | Cookie / Bearer |

## Deployment

**Staging** — auto-deployed from `main` via GitHub Actions → Vercel preview.

**Production** — not yet documented (pending pipeline setup).

### Vercel

- Framework: Next.js (`vercel.json`)
- Build command: `npm run build`
- Environment variables configured in Vercel dashboard (see `.env.example`)
- Custom domain: `playfit.app`

### Database

- Staging uses Supabase cloud (connection details in GitHub secrets)
- Automatic daily backup via GitHub Actions (`.github/workflows/backup.yml`)
- Local backup: `bash scripts/backup-db.sh`
- Restore: `bash scripts/restore-backup.sh <path-to-backup.dump>`

### CI Pipeline

`.github/workflows/ci.yml` runs on every push/PR to `main`:
- TypeScript check, Biome lint, Vitest unit tests, Next.js build
- Migration validation (naming, begin/commit, idempotency)
- Playwright e2e tests (if Supabase URL available)
- Cover integrity check (if service key available)

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---|---|---|
| `params.gameId is undefined` | Next.js 16 canary — `params` is a Promise | `const { gameId } = await props.params` |
| `Connection refused` on port 54321 | Supabase not running | `supabase start` |
| `relation "games_library.games" does not exist` | Migrations not applied | `supabase db reset --local` |
| `npm audit` shows moderate findings | PostCSS version mismatch | `npm audit --audit-level=moderate` (override in package.json) |
| Catalog is empty | Seed data not imported | Import catalog data separately (see Getting Started) |
| Build fails with `default.js` missing | Next.js 16 parallel routes requirement | Add `default.js` to parallel route slot directories |

## Documentation

Additional documentation is available in the `docs/` directory:

- `ARCHITECTURE.md` — system architecture, data flow, component relationships
- `SCHEMA.md` — consolidated database schema (tables, columns, relationships)
- `SCRIPTS.md` — reference for all scripts in `scripts/`
- `ONBOARDING.md` — step-by-step guide for new developers
- `nextjs-16-canary.md` — breaking changes and upgrade notes for Next.js 16 canary
- `AGENTS.md` (root) — development guide, migration strategy, auth architecture, UI kit conventions
