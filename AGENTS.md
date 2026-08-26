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
Not every migration includes a `-- Down:` block — only add one when a migration needs to
be reversible during active development. Check the current `supabase/migrations/`
directory for what actually exists; do not assume a specific down-migration file without
verifying it first.

The migration history was squashed on 2026-07-16; the current baseline starts at
`20260707115959_drop_legacy_schemas_for_squash.sql`. For the full backup/restore/squash
flow see `docs/MIGRATIONS_SQUASH_GUIDE.md`; for the consolidated current schema see
`docs/SCHEMA.md`. Do not rely on migration filenames or numbers mentioned in other docs
or old commits — verify against the live directory.

## Supabase Auth Architecture

The API route (`/api/profile`) uses **SECURITY DEFINER functions** for profile CRUD.
The `SUPABASE_SERVICE_KEY` is never exposed to the client. It may be used at runtime
only by explicit server-side helpers such as the protected recommendations cache;
it must never reach client components or `NEXT_PUBLIC_*` variables.

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
