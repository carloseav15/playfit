# Games Library — Development Guide

## Commands

```bash
npm run dev          # Start dev server (apps/web)
npm run build        # Build all workspaces
npm run lint         # Biome check all workspaces
npm run typecheck    # TS check all workspaces
npm test             # Run unit tests all workspaces
npm run test:e2e     # Playwright e2e (apps/web)
npx tsc -b --noEmit  # TypeScript check (apps/web)
```

## Database Migrations

Migrations live in `supabase/migrations/`. **Enabled** in config.toml — run:
```bash
supabase db reset --local   # Rebuild DB from migrations
```

### Naming convention
```
YYYYMMDDNNNN_description.sql
```
Each migration must be idempotent (`if not exists`, `create or replace`, etc.).

### Down migrations
Each migration includes a `-- Down:` comment block at the bottom. The file
`20260612999999_down_migration.sql` reverts all audit fixes if needed.

### Key migration: 20260612000001
- `profiles.user_id` type: text → uuid (matches `auth.uid()`)
- RLS: removed `::text` casts on `auth.uid()` comparisons
- New tables: `rate_limits` (persistent rate limiter)
- New functions: `get_profile`, `upsert_profile`, `delete_profile`, `migrate_profile` (SECURITY DEFINER)
- Sync trigger: `game_aliases` INSERT/DELETE → `games.aliases[]`
- `tags.name` column added and populated

### Migrations 20260613 — Security, Performance, Maintenance
- `20260613000001_rls_and_user_id_type` — RLS en `rate_limits` y `audit_log`, `user_id` → uuid
- `20260613000002_api_cache_and_indexes` — `api_cache` table (Postgres cache entre serverless), funciones `get_cache`/`set_cache`, índices compuestos en `user_game_states`, cleanup helpers
- `20260613000003_fts_search_document_extended` — FTS index extendido a series + genre names
- `20260613000004_updated_at_triggers` — Triggers `updated_at` en genres, series, tags, join tables, user_game_states

### Down migration
`20260612999999_down_migration.sql` reverts all migrations. Reescrita para evitar bugs de orden (drop table antes de alter column).

## Supabase Auth Architecture

The API route (`/api/profile`) uses **SECURITY DEFINER functions** for profile CRUD —
no `service_role` key in runtime code. The `SUPABASE_SERVICE_KEY` is only needed
for local dev and migration scripts, never at app runtime.

Flow:
1. Anonymous users → `rate_limits` table tracks IP → SECURITY DEFINER functions access profiles
2. Authenticated users → SSR cookie + `auth.getUser()` → SECURITY DEFINER functions access profiles
3. Device→Auth migration → `migrate-profile` Edge Function atomically moves data (async, best-effort)

### Security
- `rate_limits` and `audit_log` have **RLS enabled** — INSERT policies restrict writes
- `user_id` is **uuid** across all tables (rate_limits, audit_log, profiles, user_game_states)
- Device ID validation via UUID regex in query params (GET/PATCH/DELETE)
- Edge Function `migrate-profile` uses try/catch + sanitized error messages (no key leaks)

### Caching
- `api_cache` table (Postgres) for shared cache between serverless instances
- `get_cache`/`set_cache` SECURITY DEFINER functions (anon-accessible via RPC)
- Used by `/api/recommendations/today` and `similar` for catalog data (TTL 5min)

## UI Kit

Living documentation at `/ui-kit`. All components live in `apps/web/src/components/ui/`.

### Adding a new component

1. Create file `components/ui/<name>.tsx`
2. Export in `components/ui/index.ts` (alphabetical order)
3. Add section in `app/ui-kit/page.tsx` (nav items + body)
4. Verify: `npx tsc -b --noEmit` + `npm run lint`

### Component audit checklist

Before merging, verify:

- [ ] `className` prop with `cn()` for customization
- [ ] `focus-visible:ring-2 ring-ring` on interactive elements
- [ ] `disabled:opacity-50 cursor-not-allowed` where applicable
- [ ] Dark mode via CSS token variables, no hardcoded values
- [ ] States: hover, focus, disabled, loading, error, empty (as applicable)
- [ ] Exported in `components/ui/index.ts`
- [ ] Section in `app/ui-kit/page.tsx`
- [ ] No TS errors (`npx tsc -b --noEmit`)
- [ ] No Biome errors (`npm run lint`)

## Conventions

- Named exports only (no defaults)
- `"use client"` only when using hooks or browser APIs
- Tailwind v4 with `@theme inline` for tokens
- No comments in component code

## Environment

- `.env` is gitignored; secrets use GitHub Actions secrets + Vercel env vars
- Never commit `SUPABASE_SERVICE_KEY` or any secret to git
- `.env.example` documents required vars with placeholder values
