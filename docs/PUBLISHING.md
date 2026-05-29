# Publishing Checklist

Use this checklist before pushing the project to GitHub or deploying to Vercel.

## Required Checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## Vercel Setup

- Project root: repository root
- Framework preset: Next.js
- Build command: `npm run build`
- Development command: `npm run dev`
- Install command: `npm install`

The build command compiles `packages/core`, prepares public assets for `apps/web`, and runs `next build`.

## Private Data Rules

- `data/personal/` is ignored by git.
- Do not force-add personal CSVs.
- Do not publish `.env` or API keys.
- Public seed data lives in `data/public/` and is copied into `apps/web/public/data/public/`.

## GitHub Setup

```bash
git status --short
git add .
git commit -m "migrate Playfit to Next.js portfolio stack"
gh repo create playfit --public --source=. --remote=origin --push
```

Use `--private` instead of `--public` if you want to review the deployed portfolio privately first.
