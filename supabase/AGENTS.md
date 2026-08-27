# supabase/ — Agent Rules

This is the highest-risk surface in the repo: production user data, RLS policies, and the
catalog live behind what's defined here. Default to more caution here than anywhere else in
`product/`.

## Never do automatically

- Apply a migration to remote/production Supabase.
- Modify an RLS policy, a `SECURITY DEFINER` function, or a grant, and apply it anywhere but
  local.
- Run `supabase db reset` against anything but the local disposable stack.
- Touch production data directly (no ad-hoc `UPDATE`/`DELETE` against remote, even for a
  "quick fix").
- Use `service_role` outside the explicit scripts that already document why they need it.

## Can do locally, without asking

- `supabase start` / `supabase db reset --local` against the local stack.
- Write a new migration file (naming: `YYYYMMDDNNNN_description.sql`, idempotent).
- Run `supabase db lint --local --schema games_library`.
- Validate a migration with `npm run validate:migrations`.

## Before proposing any migration or RLS change

1. Check the current `supabase/migrations/` directory directly — don't trust a filename or
   migration number mentioned in another doc, an old commit, or a prior agent's summary. The
   history was squashed on 2026-07-16; anything referencing a pre-squash migration by name is
   stale by definition.
2. Test it against the local stack first, including a fresh `db reset --local`.
3. Prepare the migration, a summary of what it changes, and evidence it works locally (query
   output, `db lint` result) — then stop and hand it to the human for review before it goes
   anywhere near `db push --linked` or a remote project.

## Reference

`docs/SCHEMA.md` for the consolidated current schema, `docs/MIGRATIONS_SQUASH_GUIDE.md` for
the backup/restore/squash flow, `docs/PRODUCTION-DATABASE-CONTRACT.md` for what production
guarantees. All three are living docs — verify against the live directory/DB before trusting a
specific detail for anything consequential.
