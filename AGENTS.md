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
- `api_cache` table (Postgres) for shared cache between serverless instances, with RLS enabled
- `get_cache`/`set_cache` are `SECURITY DEFINER` but **`service_role`-only since migration
  `20260708000000_restrict_api_cache_access.sql`** — `anon`/`authenticated`/`public` execute
  was explicitly revoked (cache poisoning / reading other users' cached payloads was possible
  before that). Only server-side code can call these now; do not design around anon access.
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

## Agent Autonomy

See `docs/OWNERSHIP.md` for who implements/reviews/decides on each surface.

**Can do without asking:** read/explore anything; edit code within a single task's scope;
run typecheck/lint/test/build; run `supabase db reset --local` and reseed against the local
stack; create local commits (not push).

**Needs explicit approval:** `git push` / opening or merging PRs; any deploy (Vercel
staging/production); any migration or write against remote/production Supabase; adding a new
dependency; changing a CI workflow file; anything under `supabase/` — see
`supabase/AGENTS.md`.

**Never do automatically:** destructive operations against production Supabase (drop, reset,
bulk delete); commit secrets; force-push or rewrite git history without a separate, explicit
sign-off for that specific action; disable a CI check to make something pass.

## Review Discipline

Errors here have historically been the kind that compile and pass tests while being wrong —
stale docs, dead scripts, dead-feature copy shipped to users, drift nobody caught because
nothing was actively re-checking it. Concretely:

- **If a change makes another doc, comment, or `AGENTS.md` claim false, fix that claim in the
  same change.** Don't defer it to a future audit — that's exactly how the drift above
  happened in the first place.
- **Verify claims against the actual current code/DB/file state before acting on them** —
  including claims from another agent, another AI tool's report, or this file itself. A
  filename, endpoint, or convention mentioned anywhere (including here) can be stale; check
  before relying on it for anything consequential.
- **"Compiles" and "tests pass" are not the definition of done.** Confirm the actual claim
  being made (a script runs, an endpoint returns what the doc says, a UI copy matches a real
  feature) against real behavior, not against what was assumed true.
- **For high-risk changes (agents/hooks infra, auth, shared contracts, migrations,
  production, cross-platform), an independent second-pass review from another tool is worth
  getting**, recommended not mandatory, and it doesn't replace `qa` or the human's final
  decision — it's in addition to both. For it to be worth anything: the reviewer confirms
  current repo/branch/`HEAD`/worktree state before saying anything, reproduces checks rather
  than re-reading a prior report, and a conflicting verdict goes to the human, not to whichever
  tool sounds more confident. Full version, if available: `../roles/external-review-policy.md`
  — this checklist is copied here so it still holds if this repo is ever cloned on its own.
