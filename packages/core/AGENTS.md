# @playfit/core — Agent Rules

Shared domain logic, Zod schemas, seed loading, and browser profile persistence. Consumed by
`apps/web` and referenced (not imported directly) by the native mobile clients, which
reimplement the same contract in Swift/Kotlin — see `../tasks/cross-platform-parity.md`.

## What this package is for

Pure domain logic and shared contracts — recommendation scoring, onboarding rules, taste
profile math, schema validation. It should not know about Next.js, React, or any specific
UI framework.

## Imports

Prefer the focused entrypoints over the root barrel:

- `@playfit/core/domain` — recommendations, onboarding, feedback logic
- `@playfit/core/types` — shared types
- `@playfit/core/store` — browser profile persistence
- `@playfit/core/data` — catalog/tag seed helpers
- `@playfit/core/supabase` — browser Supabase client

The root `@playfit/core` entrypoint exists for compatibility. Don't add new imports against
it — use the focused subpath instead. (Two current exceptions,
`apps/web/src/app/api/games/route.ts` and `apps/web/src/lib/games-db.ts`, are a known cleanup
item, not a pattern to copy.)

## Changing a contract here

A change to `types.ts` or `schemas.ts` is a change to the cross-platform contract, not just to
this package — iOS and Android carry their own equivalent models and will drift silently if
this changes without them knowing. Check `../tasks/cross-platform-parity.md` and flag the change
there before assuming it's contained to `apps/web`.

## What NOT to do

Don't remove an exported helper (tag normalization, seed loading, default state constants)
just because it looks unused from `apps/web` alone — `packages/core` is consumed by scripts in
`scripts/` too, and an import-based dead-code check from one consumer isn't proof it's unused
by the others. Grep across `apps/web`, `scripts/`, and any nested `AGENTS.md`-documented
consumer before removing an export.
