# Games Taste Engine

A local-first game recommendation experiment with three explicit surfaces:

- **Public landing** at `/`: explains the Games Taste Engine product idea.
- **Public prototype** at `/app/`: onboarding, profile, finder, and recommendations that work with or without AI.
- **Personal workbench** at `/workbench/`: private CSV-based workspace for tuning recommendations against personal play history.

The default build is safe for a public GitHub repository: it publishes only the landing, the prototype, and public seed data.

## Project Structure

```text
app/                 Public prototype HTML entry
data/public/         Public seed CSVs used by the prototype
data/personal/       Private local CSVs for the workbench, ignored by git
product/             Product strategy and portfolio notes
product-site/        Landing page assets and scripts
src/product/         Public prototype app
src/workbench/       Personal CSV workbench app
src/shared/          Shared types
workbench/           Personal workbench HTML entry
```

## Setup

```bash
npm install
npm run dev:public
```

Open:

- Landing: `http://localhost:5173/`
- Prototype: `http://localhost:5173/app/`

For the personal workbench:

```bash
npm run dev:workbench
```

The workbench expects private CSV files in `data/personal/`. Those files are intentionally ignored by git.

## AI Mode

The prototype runs in local-only mode by default. To enable AI-assisted profile and insight generation:

```bash
cp .env.example .env
# add OPENAI_API_KEY to .env
npm run dev:product
```

`dev:product` starts both Vite and the local AI proxy.

## Builds

```bash
npm run build          # safe public build
npm run build:public   # landing + prototype + data/public
npm run build:workbench
```

`build:public` runs a guard that fails if private workbench CSVs are found in `dist/`.

## Validation

```bash
npm test
npx tsc --noEmit
npm run build:public
```

## Data Policy

Do not commit personal CSVs from `data/personal/`. The public prototype should use only `data/public/` seed data.

