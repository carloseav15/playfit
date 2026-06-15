# Onboarding Guide

## Step 1: Prerequisites

- **Node.js 22** (`.nvmrc` — run `nvm use` if using nvm)
- **npm 10+**
- **Docker Desktop** (required for local Supabase)
- **Supabase CLI**: `npm install -g supabase` or `brew install supabase/tap/supabase`
- **Git**

## Step 2: Clone & Install

```bash
git clone <repo-url> games-library
cd games-library
npm install
```

## Step 3: Start Supabase

```bash
supabase start
supabase db reset --local
```

**Verify:**
- Supabase Studio at http://127.0.0.1:54323
- You should see 18+ tables in `games_library` schema

**Troubleshooting:**
- `Connection refused` → Docker not running or `supabase start` needed
- `relation does not exist` → `supabase db reset --local` again

## Step 4: Environment Variables

```bash
cp .env.example .env
# For local dev, default values work out of the box
```

Variables in `.env`:
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase API URL (local: `http://127.0.0.1:54321`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon key from `supabase start` output
- `SUPABASE_SERVICE_KEY` — Service role key from `supabase start` output
- `RAWG_API_KEY` — Only needed for scraping scripts

## Step 5: Catalog Data

The migration creates empty tables. You need catalog data to use the app:

```bash
bash scripts/seed-catalog.sh
```

This script tries (in order):
1. **Local seed dump** at `data/seed/games_library_seed.sql`
2. **Staging pull** if `STAGING_SUPABASE_URL` + `STAGING_SUPABASE_SERVICE_KEY` are set
3. **Instructions** to create a dump from a populated DB or scrape from RAWG

> If you have access to a populated DB: `mkdir -p data/seed && supabase db dump --local -f data/seed/games_library_seed.sql --schema games_library --data-only`

> If you need to scrape from RAWG: set `RAWG_API_KEY` in `.env` and run `node scripts/scrape-rawg.mjs`

## Step 6: Start Dev Server

```bash
npm run dev
```

Open http://127.0.0.1:3000

## Step 7: Verification Checklist

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] App loads at http://127.0.0.1:3000
- [ ] Game catalog loads (search works)
- [ ] `/api/health` returns `{ "ok": true }`

## Common Issues

| Issue | Solution |
|---|---|
| `params.gameId is undefined` | See `docs/nextjs-16-canary.md` — params is a Promise now |
| Build fails — missing `default.js` | Add `default.js` to parallel route slot directories |
| `tsc --noEmit` errors in `packages/core` | Run `npm run build -w packages/core` first |
| E2E tests can't connect to Supabase | Set `NEXT_PUBLIC_SUPABASE_URL` in GitHub secrets |
| Port 54321 in use | Stop other Supabase projects or change port in `supabase/config.toml` |

## Project Map

```
docs/                     # Documentation
  ARCHITECTURE.md         # System architecture + diagrams
  SCHEMA.md               # Database schema
  SCRIPTS.md              # Script reference
  ONBOARDING.md           # This guide
  nextjs-16-canary.md     # Next.js 16 breaking changes
AGENTS.md                 # Dev conventions, migrations, auth, UI kit
supabase/migrations/      # 39 migration files (see SCHEMA.md for consolidated view)
apps/web/src/
  app/api/                # All API endpoints
  app/app/                # Main app pages
  app/play/               # Play feature
  components/ui/          # Reusable UI kit
packages/core/src/
  domain/                 # Pure domain logic
  store/                  # IndexedDB persistence
```

## How to Make Your First Change

1. Read `AGENTS.md` (conventions)
2. Check `docs/nextjs-16-canary.md` (framework quirks)
3. Find the relevant source file
4. Make your change
5. `npm run typecheck && npm run lint && npm test`

## Estimated Time to Productivity

- **Basic setup**: 30 min
- **Understand architecture**: 1-2 hours
- **Make a simple change**: 2-3 hours
- **Full productivity**: 8-16 hours
