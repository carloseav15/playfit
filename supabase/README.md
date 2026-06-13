# Supabase Local Schema

Playfit stores catalog and profile data in the `games_library` schema.

## Local Reset

```bash
supabase start
supabase db reset --local
```

The migration creates the schema, tables, grants, indexes, and RLS policies. It does not seed the
full catalog; import catalog data separately before running the app against a fresh database.

## Security Model

- `games` and `platforms` are read-only for `anon` and `authenticated`.
- `profiles` is readable/writable only by authenticated users whose `auth.uid()` matches `user_id`.
- Local anonymous profiles use a browser `deviceId` and are accessed only through `/api/profile`
  with the server-side service-role client. Treat `deviceId` as a convenience identifier, not a
  strong security boundary.

## Validation

```bash
supabase migration list --local
npm run check:covers
```
