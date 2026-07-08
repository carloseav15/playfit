"use client";

import { Container } from "@/components/ui/container";
import { Stack } from "@/components/ui/stack";
import { tokens, typography } from "../data";
import { SectionHeader, TokenSwatch } from "./helpers";

export function TokensSection() {
  return (
    <>
      <SectionHeader title="Design Tokens" id="tokens" />
      <p className="mb-5 text-sm text-muted-foreground">
        All CSS custom properties that drive theming. Toggle light/dark to see both sides.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {tokens.map((t) => (
          <TokenSwatch key={t.var} token={t} />
        ))}
      </div>
    </>
  );
}

export function ColorUsageSection() {
  return (
    <>
      <SectionHeader title="Color Usage" id="color-usage" />
      <p className="mb-5 text-sm text-muted-foreground">
        Rules for applying the palette consistently across the product.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="size-4 rounded bg-accent" />
            <strong className="text-sm font-bold">Accent — Action</strong>
          </div>
          <code className="font-mono text-xs text-muted-foreground">--accent</code>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Reserved for interactive elements: buttons, CTAs, active nav, toggle chips. Never for
            data display or metrics.
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="size-4 rounded bg-ink" />
            <strong className="text-sm font-bold">Cyan — Data / Confidence</strong>
          </div>
          <code className="font-mono text-xs text-muted-foreground">--ink</code>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Reserved for metrics, scores, affinity signals, and data highlights. Never for buttons,
            labels, or interactive states.
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="size-4 rounded bg-positive" />
            <strong className="text-sm font-bold">Semantic — Status only</strong>
          </div>
          <code className="font-mono text-xs text-muted-foreground">
            positive / warning / negative / info
          </code>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Green, amber, red, and blue express state: strong match, risk, caveat, or information.
            Never used for chrome or navigation.
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex gap-0.5">
              <div className="size-4 rounded bg-accent" />
              <div className="size-4 rounded bg-tone-accent" />
            </div>
            <strong className="text-sm font-bold">Token vs Badge naming</strong>
          </div>
          <code className="font-mono text-xs text-muted-foreground">--accent ≠ badge:info</code>
          <p className="mt-1.5 text-xs text-muted-foreground">
            <code className="font-mono">--accent</code> is orange/teal (action). Badge{" "}
            <code className="font-mono">info</code> uses{" "}
            <code className="font-mono">--tone-accent</code> (blue). They are different — do not
            assume accent maps orange everywhere.
          </p>
        </div>
      </div>
    </>
  );
}

export function LayoutSection() {
  return (
    <>
      <SectionHeader title="Container" id="container" />
      <p className="mb-5 text-sm text-muted-foreground">
        Centered max-width wrapper for page-level layout. Sizes control the content width boundary.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Container
          size="sm"
          className="rounded-lg border border-dashed border-border bg-card py-4 text-center text-xs text-muted-foreground"
        >
          sm — 48rem
        </Container>
        <Container
          size="md"
          className="rounded-lg border border-dashed border-border bg-card py-4 text-center text-xs text-muted-foreground"
        >
          md — 64rem
        </Container>
        <Container
          size="lg"
          className="rounded-lg border border-dashed border-border bg-card py-4 text-center text-xs text-muted-foreground"
        >
          lg — 80rem (default)
        </Container>
        <Container
          size="full"
          className="rounded-lg border border-dashed border-border bg-card py-4 text-center text-xs text-muted-foreground"
        >
          full — no max-width
        </Container>
      </div>

      <SectionHeader title="Stack" id="stack" />
      <p className="mb-5 text-sm text-muted-foreground">
        Flex layout component with unified gap and alignment props. Replaces manual flex classes.
      </p>
      <div className="space-y-6">
        <div className="rounded-md border border-border bg-card p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Column (default)
          </p>
          <Stack gap={3} className="items-center">
            <span className="rounded bg-accent/20 px-3 py-1.5 text-xs">Item 1</span>
            <span className="rounded bg-accent/20 px-3 py-1.5 text-xs">Item 2</span>
            <span className="rounded bg-accent/20 px-3 py-1.5 text-xs">Item 3</span>
          </Stack>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Row with wrap
          </p>
          <Stack direction="row" gap={2} wrap className="items-center">
            {["Action", "RPG", "Strategy", "Simulation", "FPS", "Puzzle", "Racing", "Sports"].map(
              (name) => (
                <span key={name} className="rounded bg-accent/20 px-3 py-1.5 text-xs">
                  {name}
                </span>
              ),
            )}
          </Stack>
        </div>
      </div>
    </>
  );
}

export function DesignTokensSection() {
  return (
    <>
      <SectionHeader title="Shadows" id="shadows" />
      <p className="mb-5 text-sm text-muted-foreground">
        Three semantic elevation levels. Values adapt automatically in dark mode for depth
        perception.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">
          <p className="text-sm font-bold">sm</p>
          <code className="font-mono text-xs text-muted-foreground">shadow-sm</code>
          <p className="mt-1 text-xs text-muted-foreground">Cards, panels</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-md">
          <p className="text-sm font-bold">md</p>
          <code className="font-mono text-xs text-muted-foreground">shadow-md</code>
          <p className="mt-1 text-xs text-muted-foreground">Dropdowns, popovers</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-lg">
          <p className="text-sm font-bold">lg</p>
          <code className="font-mono text-xs text-muted-foreground">shadow-lg</code>
          <p className="mt-1 text-xs text-muted-foreground">Dialogs, toasts</p>
        </div>
      </div>

      <SectionHeader title="Motion" id="motion" />
      <p className="mb-5 text-sm text-muted-foreground">
        Duration and easing tokens for consistent animation across the product.
      </p>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-4">
          <h4 className="mb-3 text-sm font-bold">Durations</h4>
          <div className="grid gap-2">
            {[
              { token: "duration-fast", value: "150ms", class: "duration-150" },
              { token: "duration-normal", value: "250ms", class: "duration-250" },
              { token: "duration-slow", value: "350ms", class: "duration-350" },
            ].map((d) => (
              <div key={d.token} className="flex items-center gap-3 text-xs">
                <code className="w-36 font-mono">{d.token}</code>
                <code className="w-16 text-muted-foreground">{d.value}</code>
                <div className="flex-1">
                  <div
                    className={`h-1 rounded-full bg-accent ${d.class} animate-pulse`}
                    style={{
                      width: `${d.value === "150ms" ? "33" : d.value === "250ms" ? "50" : "75"}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <h4 className="mb-3 text-sm font-bold">Easings</h4>
          <div className="grid gap-2">
            {[
              { token: "ease-default", value: "ease-in-out" },
              { token: "ease-in", value: "ease-in" },
              { token: "ease-out", value: "ease-out" },
            ].map((e) => (
              <div key={e.token} className="flex items-center gap-3 text-xs">
                <code className="w-36 font-mono">{e.token}</code>
                <code className="text-muted-foreground">{e.value}</code>
              </div>
            ))}
          </div>
        </div>
      </div>

      <SectionHeader title="Z-Index" id="z-index" />
      <p className="mb-5 text-sm text-muted-foreground">
        Semantic layer scale. Keeps stacking context predictable.
      </p>
      <div className="grid gap-2">
        {[
          { token: "z-dropdown", value: "100", usage: "Dropdowns, popovers" },
          { token: "z-sticky", value: "200", usage: "Sticky headers, nav" },
          { token: "z-dialog", value: "300", usage: "Dialogs, modals" },
          { token: "z-toast", value: "400", usage: "Toasts, alerts" },
          { token: "z-tooltip", value: "500", usage: "Tooltips" },
        ].map((z) => (
          <div
            key={z.token}
            className="flex items-center gap-4 rounded-md border border-border bg-card px-4 py-3 text-xs"
          >
            <code className="w-32 font-mono font-bold">{z.token}</code>
            <code className="w-16 text-muted-foreground">{z.value}</code>
            <span className="text-muted-foreground">{z.usage}</span>
          </div>
        ))}
      </div>
    </>
  );
}

export function TypographySection() {
  return (
    <>
      <SectionHeader title="Typography" id="typography" />
      <p className="mb-5 text-sm text-muted-foreground">
        Font family: <span className="font-mono">Geist</span> (sans/display),{" "}
        <span className="font-mono">Geist Mono</span> (mono).
      </p>
      <div className="grid gap-3">
        {typography.map((t) => (
          <div key={t.name} className="rounded-md border border-border bg-card p-4">
            <p className={t.className}>{t.name}</p>
          </div>
        ))}
      </div>
    </>
  );
}
