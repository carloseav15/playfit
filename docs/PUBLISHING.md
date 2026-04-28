# Publishing Checklist

Use this checklist before pushing the project to GitHub.

## Required Checks

```bash
npm test
npx tsc --noEmit
npm run build:public
```

Confirm the public build contains only public data:

```bash
find dist/data -maxdepth 3 -type f | sort
node scripts/verify-public-build.mjs
```

## Private Data Rules

- `data/personal/` is ignored by git.
- Do not force-add personal CSVs.
- Do not publish `.env` or API keys.
- Public seed data lives in `data/public/`.

## GitHub Setup

```bash
git init
git add .
git status --short
git commit -m "prepare public Games Taste Engine repo"
gh repo create games-taste-engine --public --source=. --remote=origin --push
```

If you want the repository private first, use `--private` instead of `--public`.

