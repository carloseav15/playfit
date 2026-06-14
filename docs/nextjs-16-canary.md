# Next.js 16 Canary — Breaking Changes

This project pins `next@16.3.0-canary.34`. This version has several breaking changes from the stable Next.js 15 / 16 that LLM training data may not reflect.

## Known Breaking Changes

### `params` and `searchParams` are Promises

Page, layout, and route handler props must be `await`ed:

```tsx
// Correct
export default async function Page(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
}

// Wrong — params.gameId is undefined at runtime
export default function Page({ params }: { params: { id: string } }) {
  params.id;
}
```

### `cookies()`, `headers()`, `draftMode()` are async

```tsx
const cookieStore = await cookies();
const headersList = await headers();
```

### Parallel route slots require explicit `default.js`

Build fails without a `default.js` file in parallel route slot directories.

### `next/image` with query strings

Requires `images.localPatterns.search` in `next.config.ts`.

### Turbopack is the default bundler

May affect custom webpack configs — verify if adding custom loaders.

## Full Reference

Read the complete upgrade guide at:
`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
