# Frontend Dependencies Guide

## Core Framework

| Package | Purpose | When to use |
|---|---|---|
| `next` (16.3.0-canary.34) | App Router, SSR, Route Handlers | Pages, layouts, API routes |
| `react` / `react-dom` 19 | UI rendering | Components, hooks |
| `typescript` 5.9 | Type checking | All `.ts`/`.tsx` files |

## Styling

| Package | Purpose | When to use |
|---|---|---|
| `tailwindcss` 4.1 | Utility-first CSS | All styling |
| `@tailwindcss/postcss` | PostCSS plugin for Tailwind v4 | Config (postcss.config.mjs) |
| `tailwind-merge` (`cn()`) | Merge Tailwind classes | `className` prop in UI components |
| `clsx` | Conditional class joining | Within `cn()` utility |
| `class-variance-authority` (`cva`) | Variant-based component API | UI components with multiple variants (button, badge, etc.) |

## UI Components

| Package | Purpose | When to use |
|---|---|---|
| `@radix-ui/react-slot` | Polymorphic `asChild` pattern | Component composition (Button asChild, etc.) |
| `lucide-react` | Icon library | All icons in the app |
| `motion` | Animations | Page transitions, micro-interactions |
| `next-themes` | Dark/light mode | ThemeProvider in root layout |

## Forms & Validation

| Package | Purpose | When to use |
|---|---|---|
| `react-hook-form` | Form state management | Complex forms (profile edit) |
| `@hookform/resolvers` | Zod resolver for react-hook-form | Form validation integration |
| `zod` 4 | Schema validation | API request parsing, form schemas |

## State & Persistence

| Package | Purpose | When to use |
|---|---|---|
| `@playfit/core` | Domain logic + Zod schemas + types | All imports from workspace |
| `@supabase/ssr` | Supabase SSR auth helpers | Middleware, server components |
| `@supabase/supabase-js` | Supabase client | API routes, lib/supabase |

## Development

| Package | Purpose | When to use |
|---|---|---|
| `@biomejs/biome` | Linting + formatting | All `npm run lint` |
| `vitest` | Unit testing | Test files (`*.test.ts`) |
| `@playwright/test` | E2E testing | E2E tests (`e2e/*.spec.ts`) |
| `@next/env` | Env loading in scripts | Scripts that need `.env` vars (check-covers, scrape-rawg) |

## Patterns

### ClassName Composition
```tsx
import { cn } from "@/lib/utils";

function MyComponent({ className }: { className?: string }) {
  return <div className={cn("base-class", className)} />;
}
```

### Variant Components
```tsx
import { cva } from "class-variance-authority";

const button = cva("base-styles", {
  variants: {
    variant: { primary: "bg-accent", secondary: "bg-secondary" },
    size: { sm: "px-2 py-1", lg: "px-4 py-2" },
  },
});
```

### Icon Usage
```tsx
import { Search } from "lucide-react";
<Search className="size-4" />;  // Always use size-4 or size-5
```

### Animations
```tsx
import { motion, AnimatePresence } from "motion/react";

<AnimatePresence mode="wait">
  <motion.div
    key={key}
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -12 }}
    transition={{ type: "spring", stiffness: 300, damping: 30 }}
  >
    {content}
  </motion.div>
</AnimatePresence>
```
