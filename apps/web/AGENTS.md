<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version (16.3.0-canary.34) has breaking changes from training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code.

## Known breaking changes

- **`params` and `searchParams` are Promises** — must be `await`ed in page/layout/route
  ```tsx
  // ✅ Correct
  export default async function Page(props: { params: Promise<{ id: string }> }) {
    const { id } = await props.params;
  }
  // ❌ Wrong — `params.gameId` is undefined at runtime
  export default function Page({ params }: { params: { id: string } }) {
    params.id;
  }
  ```

- **`cookies()`, `headers()`, `draftMode()` are async** — must be `await`ed

- **Parallel route slots require explicit `default.js`** — build fails without one

- **`next/image` with query strings** needs `images.localPatterns.search` in config

- **Turbopack is the default bundler** — may affect custom webpack configs

For full details read `node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md`
<!-- END:nextjs-agent-rules -->
