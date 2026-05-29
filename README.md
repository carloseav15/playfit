# Playfit

A local-first game recommendation product built as a portfolio-ready web app.

The visible public stack is now:

- **Next.js App Router + React + TypeScript** for `/`, `/app`, and `/case-study`
- **Tailwind CSS v4 + shadcn/ui-style primitives** for the visual system
- **Motion** for restrained microinteractions
- **React Hook Form + Zod** for typed form and state validation
- **IndexedDB** for local-first user state
- **Vercel-ready monorepo** with `apps/web` and `packages/core`

## Surfaces

- `/` - product landing page
- `/app` - interactive Playfit app
- `/case-study` - portfolio case study
- `src/workbench` - legacy/internal Vite workbench for private CSV exploration

## Project Structure

```text
apps/web/           Next.js public portfolio app
packages/core/      Framework-independent scoring, onboarding, CSV, schemas, storage
data/public/        Public CSV seed data copied into apps/web/public at dev/build time
data/personal/      Private local CSVs for the legacy workbench, ignored by git
product/            Product strategy and portfolio notes
src/workbench/      Internal Vite workbench code
workbench/          Internal workbench HTML entry
```

## Setup

```bash
npm install
npm run dev
```

Open:

- Landing: `http://localhost:3000/`
- App: `http://localhost:3000/app`
- Case study: `http://localhost:3000/case-study`

For the legacy personal workbench:

```bash
npm run dev:workbench
```

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## Data Policy

- Do not commit personal CSVs from `data/personal/`.
- The public Next.js app uses only `data/public/`.
- `apps/web/scripts/prepare-public.mjs` copies public assets and public CSVs into `apps/web/public` before `dev` and `build`.

## Product Framing

Playfit answers a narrower and more useful question than generic game discovery:

> Which game am I actually likely to enjoy and finish next?

The scoring engine separates affinity, friction, confidence, and access so the recommendation is inspectable instead of magical. Supabase is intentionally deferred until the product needs auth or cloud sync.
