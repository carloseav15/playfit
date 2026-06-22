# Security Policy

## Supported Versions

This repository tracks the current `main` branch only.

## Reporting a Vulnerability

Do not open a public issue for secrets, authentication bypasses, data exposure,
or RLS policy problems. Email the maintainer listed in the GitHub profile with:

- A short description of the issue.
- Steps to reproduce.
- Affected route, function, table, or workflow.
- Whether any token, key, or personal data may be exposed.

## Secrets

Never commit `.env`, service-role keys, access tokens, database passwords, or
real external API keys. `.env.example` must use placeholders only.

## Supabase Boundary

Frontend code may use only public Supabase configuration. Privileged database
work belongs in migrations, scripts, Edge Functions, or SECURITY DEFINER RPCs
with documented access patterns.
