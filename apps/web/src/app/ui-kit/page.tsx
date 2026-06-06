"use client";

import type { ProductRating } from "@playfit/core";
import {
  ArrowRight,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  Compass,
  Database,
  Download,
  Gamepad2,
  Library,
  Menu,
  Radar,
  RefreshCcw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { CoverArt } from "@/components/playfit/cover-art";
import { Metric } from "@/components/playfit/metric";
import { SectionHead } from "@/components/playfit/section-head";
import { StarRating } from "@/components/playfit/star-rating";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const buttonVariantsList = ["default", "secondary", "ghost", "destructive", "outline"] as const;
const buttonSizes = ["default", "sm", "lg", "icon"] as const;
const badgeVariantsList = [
  "default",
  "secondary",
  "outline",
  "positive",
  "warning",
  "negative",
  "info",
] as const;
const spinnerSizes = ["sm", "default", "lg"] as const;

const tokens: Array<{ name: string; var: string; light: string; dark: string }> = [
  { name: "Background", var: "--background", light: "#faf7f2", dark: "#070a12" },
  { name: "Foreground", var: "--foreground", light: "#1f1b17", dark: "#f8fafc" },
  { name: "Card", var: "--card", light: "rgba(255,255,255,0.76)", dark: "rgba(15,23,42,0.76)" },
  { name: "Primary", var: "--primary", light: "#1f1b17", dark: "#f8fafc" },
  {
    name: "Secondary",
    var: "--secondary",
    light: "rgba(31,27,23,0.06)",
    dark: "rgba(255,255,255,0.07)",
  },
  { name: "Accent", var: "--accent", light: "#a64222", dark: "#ff6a3d" },
  { name: "Muted", var: "--muted", light: "rgba(31,27,23,0.07)", dark: "rgba(255,255,255,0.07)" },
  { name: "Destructive", var: "--destructive", light: "#be123c", dark: "#fb7185" },
  { name: "Border", var: "--border", light: "rgba(31,27,23,0.14)", dark: "rgba(148,163,184,0.18)" },
  { name: "Input", var: "--input", light: "rgba(255,255,255,0.82)", dark: "rgba(7,10,18,0.66)" },
  { name: "Ring", var: "--ring", light: "rgba(166,66,34,0.42)", dark: "rgba(255,106,61,0.45)" },
  { name: "Ink", var: "--ink", light: "#236c73", dark: "#38bdf8" },
  { name: "Positive", var: "--positive", light: "#047857", dark: "#34d399" },
  { name: "Warning", var: "--warning", light: "#b45309", dark: "#fbbf24" },
  { name: "Negative", var: "--negative", light: "#be123c", dark: "#fb7185" },
  { name: "Tone Accent", var: "--tone-accent", light: "#0369a1", dark: "#7dd3fc" },
];

const typography = [
  {
    name: "Eyebrow / Label",
    className: "text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground",
  },
  {
    name: "H1 / Display",
    className: "font-display text-4xl font-black tracking-tight md:text-6xl",
  },
  { name: "H2 / Section", className: "font-display text-3xl font-extrabold tracking-tight" },
  {
    name: "Section Head Title",
    className: "font-display text-4xl font-extrabold tracking-tight md:text-5xl",
  },
  { name: "Card Title", className: "font-display text-xl font-semibold leading-tight" },
  { name: "Body", className: "text-base leading-7" },
  { name: "Body Small", className: "text-sm leading-6 text-muted-foreground" },
  { name: "Mono / Metric", className: "font-mono text-sm" },
];

const usedIcons: Array<{ name: string; icon: typeof Gamepad2 }> = [
  { name: "CalendarDays", icon: CalendarDays },
  { name: "ChevronRight", icon: ChevronRight },
  { name: "Download", icon: Download },
  { name: "Library", icon: Library },
  { name: "Radar", icon: Radar },
  { name: "RefreshCcw", icon: RefreshCcw },
  { name: "RotateCcw", icon: RotateCcw },
  { name: "Search", icon: Search },
  { name: "Settings2", icon: Settings2 },
  { name: "Sparkles", icon: Sparkles },
  { name: "X", icon: X },
  { name: "Check", icon: Check },
  { name: "ArrowRight", icon: ArrowRight },
  { name: "Brain", icon: Brain },
  { name: "Compass", icon: Compass },
  { name: "Database", icon: Database },
  { name: "ShieldCheck", icon: ShieldCheck },
  { name: "Gamepad2", icon: Gamepad2 },
];

function TokenSwatch({ token }: { token: (typeof tokens)[number] }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div
        className="mb-2 h-10 rounded-md border border-border"
        style={{ background: `var(${token.var})` }}
      />
      <p className="text-xs font-bold">{token.name}</p>
      <p className="font-mono text-[11px] text-muted-foreground">{token.var}</p>
      <div className="mt-1 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground break-all">
        <span>L: {token.light}</span>
        <span>D: {token.dark}</span>
      </div>
    </div>
  );
}

function SectionHeader({ title, id }: { title: string; id: string }) {
  return (
    <h2
      id={id}
      className="mb-6 mt-10 scroll-mt-20 font-display text-3xl font-extrabold tracking-tight first:mt-0"
    >
      {title}
      <Separator className="mt-2" />
    </h2>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-secondary p-3">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function Chip<_T extends string>({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-bold transition-colors cursor-pointer",
        active
          ? "bg-accent text-accent-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/60",
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export default function UiKitPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [btnVariant, setBtnVariant] = useState<
    "default" | "secondary" | "ghost" | "destructive" | "outline"
  >("default");
  const [btnSize, setBtnSize] = useState<"default" | "sm" | "lg" | "icon">("default");
  const [btnDisabled, setBtnDisabled] = useState(false);
  const [badgeVariant, setBadgeVariant] = useState<(typeof badgeVariantsList)[number]>("default");
  const [spinnerSize, setSpinnerSize] = useState<"sm" | "default" | "lg">("default");
  const [inputValue, setInputValue] = useState("");
  const [inputDisabled, setInputDisabled] = useState(false);
  const [selectValue, setSelectValue] = useState("option1");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [starRating, setStarRating] = useState<ProductRating | undefined>(0);
  const [sidebar, setSidebar] = useState(false);

  const sections = [
    { id: "tokens", label: "Tokens" },
    { id: "color-usage", label: "Color Usage" },
    { id: "typography", label: "Typography" },
    { id: "buttons", label: "Buttons" },
    { id: "badges", label: "Badges" },
    { id: "badge-usage", label: "Badge Usage" },
    { id: "cards", label: "Cards" },
    { id: "inputs", label: "Inputs" },
    { id: "selects", label: "Selects" },
    { id: "dialogs", label: "Dialogs" },
    { id: "spinners", label: "Spinners" },
    { id: "skeletons", label: "Skeletons" },
    { id: "separators", label: "Separators" },
    { id: "star-rating", label: "StarRating" },
    { id: "context", label: "Context Examples" },
    { id: "icons", label: "Icons" },
  ];

  return (
    <div className={cn(theme === "dark" && "dark", "min-h-screen bg-background text-foreground")}>
      <div className="grid md:grid-cols-[240px_1fr]">
        <aside className="sticky top-0 hidden h-screen border-r border-border bg-card/72 p-5 backdrop-blur-xl md:grid md:grid-rows-[auto_1fr_auto]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Playfit
            </p>
            <strong className="font-display text-xl">UI Kit</strong>
          </div>
          <nav className="mt-6 grid content-start gap-1.5 text-sm" aria-label="UI Kit sections">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-md px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                {s.label}
              </a>
            ))}
          </nav>
          <div className="grid gap-2">
            <Chip
              label={theme === "light" ? "☀ Light" : "🌙 Dark"}
              active
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            />
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-40 border-b border-border bg-background/90 p-4 backdrop-blur-xl md:hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Playfit
                </p>
                <strong className="font-display text-xl">UI Kit</strong>
              </div>
              <div className="flex items-center gap-2">
                <Chip
                  label={theme === "light" ? "☀ Light" : "🌙 Dark"}
                  active
                  onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                />
                <button
                  type="button"
                  aria-label={sidebar ? "Close UI Kit sections" : "Open UI Kit sections"}
                  aria-expanded={sidebar}
                  aria-controls="ui-kit-mobile-nav"
                  onClick={() => setSidebar((open) => !open)}
                  className="grid size-9 place-items-center rounded-md border border-border bg-secondary text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {sidebar ? <X className="size-4" /> : <Menu className="size-4" />}
                </button>
              </div>
            </div>
            {sidebar && (
              <nav
                id="ui-kit-mobile-nav"
                className="mt-4 grid grid-cols-2 gap-1.5 text-sm"
                aria-label="UI Kit sections"
              >
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="rounded-md bg-secondary px-2.5 py-2 text-muted-foreground transition-colors hover:text-foreground"
                    onClick={() => setSidebar(false)}
                  >
                    {s.label}
                  </a>
                ))}
              </nav>
            )}
          </header>

          <main className="mx-auto w-[min(1080px,calc(100%-2rem))] py-8">
            {/* Design Tokens */}
            <SectionHeader title="Design Tokens" id="tokens" />
            <p className="mb-5 text-sm text-muted-foreground">
              All CSS custom properties that drive theming. Toggle light/dark to see both sides.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {tokens.map((t) => (
                <TokenSwatch key={t.var} token={t} />
              ))}
            </div>

            {/* Color Usage */}
            <SectionHeader title="Color Usage" id="color-usage" />
            <p className="mb-5 text-sm text-muted-foreground">
              Rules for applying the palette consistently across the product.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="size-4 rounded bg-accent" />
                  <strong className="text-sm font-bold">Orange — Action</strong>
                </div>
                <code className="font-mono text-xs text-muted-foreground">--accent</code>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Reserved for interactive elements: buttons, CTAs, active nav, toggle chips. Never
                  for data display or metrics.
                </p>
              </div>
              <div className="rounded-md border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="size-4 rounded bg-ink" />
                  <strong className="text-sm font-bold">Cyan — Data / Signal</strong>
                </div>
                <code className="font-mono text-xs text-muted-foreground">--ink</code>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Reserved for metrics, scores, affinity signals, and data highlights. Never for
                  buttons, labels, or interactive states.
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
                  Green, amber, red, and blue express state: good fit, risk, friction, or
                  information. Never used for chrome or navigation.
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
                <code className="font-mono text-xs text-muted-foreground">
                  --accent ≠ badge:info
                </code>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  <code className="font-mono">--accent</code> is orange (action). Badge{" "}
                  <code className="font-mono">info</code> uses{" "}
                  <code className="font-mono">--tone-accent</code> (blue). They are different — do
                  not assume accent maps orange everywhere.
                </p>
              </div>
            </div>

            {/* Typography */}
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

            {/* Buttons */}
            <SectionHeader title="Buttons" id="buttons" />
            <p className="mb-5 text-sm text-muted-foreground">
              Click the playground to customize, or view the grid of all combinations below.
            </p>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Playground</CardTitle>
                <CardDescription>
                  Toggle props to see the button change in real time.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex flex-wrap gap-4">
                  <ControlGroup label="Variant">
                    {buttonVariantsList.map((v) => (
                      <Chip
                        key={v}
                        label={v}
                        active={btnVariant === v}
                        onClick={() => setBtnVariant(v)}
                      />
                    ))}
                  </ControlGroup>
                  <ControlGroup label="Size">
                    {buttonSizes.map((s) => (
                      <Chip
                        key={s}
                        label={s}
                        active={btnSize === s}
                        onClick={() => setBtnSize(s)}
                      />
                    ))}
                  </ControlGroup>
                  <ControlGroup label="State">
                    <Chip
                      label="disabled"
                      active={btnDisabled}
                      onClick={() => setBtnDisabled(!btnDisabled)}
                    />
                  </ControlGroup>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant={btnVariant} size={btnSize} disabled={btnDisabled}>
                    {btnSize === "icon" ? <Check className="size-4" /> : "Button"}
                  </Button>
                  {btnSize !== "icon" && (
                    <Button variant={btnVariant} size={btnSize} disabled={btnDisabled}>
                      With icon <ChevronRight className="size-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
            <div className="grid gap-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                All variants × sizes
              </p>
              {buttonSizes.map((size) => (
                <div key={size} className="flex flex-wrap items-center gap-3">
                  {buttonVariantsList.map((variant) => (
                    <Button key={`${variant}-${size}`} variant={variant} size={size}>
                      {size === "icon" ? (
                        <Search className="size-4" />
                      ) : (
                        `${variant}${size !== "default" ? ` ${size}` : ""}`
                      )}
                    </Button>
                  ))}
                </div>
              ))}
            </div>

            {/* Badges */}
            <SectionHeader title="Badges" id="badges" />
            <p className="mb-5 text-sm text-muted-foreground">
              Badge variants use theme tokens that adapt to light/dark mode.
            </p>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Playground</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <ControlGroup label="Variant">
                  {badgeVariantsList.map((v) => (
                    <Chip
                      key={v}
                      label={v}
                      active={badgeVariant === v}
                      onClick={() => setBadgeVariant(v)}
                    />
                  ))}
                </ControlGroup>
                <Badge variant={badgeVariant}>Sample badge</Badge>
              </CardContent>
            </Card>
            <div className="flex flex-wrap gap-2">
              {badgeVariantsList.map((v) => (
                <Badge key={v} variant={v}>
                  {v}
                </Badge>
              ))}
            </div>

            {/* Badge Usage */}
            <SectionHeader title="Badge Usage" id="badge-usage" />
            <p className="mb-5 text-sm text-muted-foreground">
              Real badge labels used throughout the product, grouped by purpose.
            </p>
            <div className="grid gap-6">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Decision
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="positive">Strong fit</Badge>
                  <Badge variant="info">Promising fit</Badge>
                  <Badge variant="negative">Watch out</Badge>
                  <Badge variant="warning">Inconclusive</Badge>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Status
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="info">Backlog</Badge>
                  <Badge variant="warning">Wishlist</Badge>
                  <Badge variant="secondary">Setup needed</Badge>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Risk / Signal
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="positive">Affinity 85+</Badge>
                  <Badge variant="negative">Friction 70+</Badge>
                  <Badge variant="info">Good match</Badge>
                  <Badge variant="warning">Needs more data</Badge>
                </div>
              </div>
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Onboarding steps
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="info">1 Platforms</Badge>
                  <Badge variant="secondary">1 Platforms</Badge>
                  <Badge variant="info">2 / 3 Anchors</Badge>
                </div>
              </div>
            </div>

            {/* Cards */}
            <SectionHeader title="Cards" id="cards" />
            <p className="mb-5 text-sm text-muted-foreground">
              Card with all subcomponents assembled, plus individual pieces.
            </p>
            <div className="grid gap-5 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Full card example</CardTitle>
                  <CardDescription>Description provides supporting context.</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Content area with body text. Cards use <code>--card</code> and{" "}
                    <code>--card-foreground</code> tokens.
                  </p>
                </CardContent>
              </Card>
              <div className="grid gap-3">
                <Card>
                  <CardHeader>
                    <CardTitle>Just header</CardTitle>
                    <CardDescription>No content block.</CardDescription>
                  </CardHeader>
                </Card>
                <Card>
                  <CardContent className="pt-5">
                    <p className="text-sm">Content only variant.</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Inputs */}
            <SectionHeader title="Inputs" id="inputs" />
            <p className="mb-5 text-sm text-muted-foreground">
              Text input with theme-aware border and focus ring.
            </p>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Playground</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <ControlGroup label="State">
                  <Chip
                    label="disabled"
                    active={inputDisabled}
                    onClick={() => setInputDisabled(!inputDisabled)}
                  />
                </ControlGroup>
                <Input
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Type something..."
                  disabled={inputDisabled}
                />
              </CardContent>
            </Card>
            <div className="grid gap-3 max-w-sm">
              <Input placeholder="Default input" />
              <Input placeholder="Disabled input" disabled />
              <Input type="search" placeholder="Search input" />
            </div>

            {/* Selects */}
            <SectionHeader title="Selects" id="selects" />
            <p className="mb-5 text-sm text-muted-foreground">
              Native select styled to match the Input component.
            </p>
            <Card className="mb-6 max-w-sm">
              <CardHeader>
                <CardTitle>Playground</CardTitle>
              </CardHeader>
              <CardContent>
                <Select value={selectValue} onChange={(e) => setSelectValue(e.target.value)}>
                  <option value="option1">Option 1</option>
                  <option value="option2">Option 2</option>
                  <option value="option3">Option 3</option>
                </Select>
              </CardContent>
            </Card>

            {/* Dialogs */}
            <SectionHeader title="Dialogs" id="dialogs" />
            <p className="mb-5 text-sm text-muted-foreground">
              Modal overlay with motion animation, backdrop blur, and close button.
            </p>
            <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
            <Dialog
              open={dialogOpen}
              onClose={() => setDialogOpen(false)}
              title="Dialog title"
              eyebrow="Modal"
            >
              <p className="text-sm text-muted-foreground">
                Dialog content area. Uses <code>AnimatePresence</code> and <code>motion</code> for
                smooth open/close transitions.
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => setDialogOpen(false)}>Confirm</Button>
              </div>
            </Dialog>

            {/* Spinners */}
            <SectionHeader title="Spinners" id="spinners" />
            <p className="mb-5 text-sm text-muted-foreground">
              SVG-based loading indicator with three sizes.
            </p>
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>Playground</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <ControlGroup label="Size">
                  {spinnerSizes.map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      active={spinnerSize === s}
                      onClick={() => setSpinnerSize(s)}
                    />
                  ))}
                </ControlGroup>
                <Spinner size={spinnerSize} />
              </CardContent>
            </Card>
            <div className="flex items-center gap-4">
              {spinnerSizes.map((s) => (
                <div key={s} className="flex items-center gap-2">
                  <Spinner size={s} />
                  <span className="text-xs text-muted-foreground">{s}</span>
                </div>
              ))}
            </div>

            {/* Skeletons */}
            <SectionHeader title="Skeletons" id="skeletons" />
            <p className="mb-5 text-sm text-muted-foreground">
              Animated pulse placeholders for loading states.
            </p>
            <div className="grid gap-4 max-w-md">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="grid gap-2 flex-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>

            {/* Separators */}
            <SectionHeader title="Separators" id="separators" />
            <p className="mb-5 text-sm text-muted-foreground">
              Horizontal and vertical line separators.
            </p>
            <div className="grid gap-5 max-w-md">
              <div>
                <p className="text-sm">Above separator</p>
                <Separator className="my-3" />
                <p className="text-sm">Below separator</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm">Left</span>
                <Separator className="h-6 w-px" />
                <span className="text-sm">Right</span>
              </div>
            </div>

            {/* StarRating */}
            <SectionHeader title="StarRating" id="star-rating" />
            <p className="mb-5 text-sm text-muted-foreground">
              Interactive half-star rating with preview. Uses <code>--accent</code> color.
            </p>
            <Card className="max-w-sm">
              <CardHeader>
                <CardTitle>Rating: {starRating ?? 0} / 5</CardTitle>
                <CardDescription>Click or hover to preview, click to set.</CardDescription>
              </CardHeader>
              <CardContent>
                <StarRating value={starRating} onChange={setStarRating} />
              </CardContent>
            </Card>

            {/* Context Examples */}
            <SectionHeader title="Context Examples" id="context" />
            <p className="mb-5 text-sm text-muted-foreground">
              Real compositions of the components used together inside the product.
            </p>
            <div className="grid gap-8">
              <div>
                <SectionHead
                  eyebrow="Context"
                  title="Product Section Demo"
                  copy="This is how section heads appear inside the app shell — with eyebrow, title, and supporting copy."
                />
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Card>
                  <CardHeader>
                    <CardTitle>Metric Group</CardTitle>
                    <CardDescription>
                      Three metric cards side by side as seen on recommendation cards.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <Metric label="Fit" value={85} />
                      <Metric label="Friction" value={22} />
                      <Metric label="Signal" value="Strong match" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Cover Art Placeholder</CardTitle>
                    <CardDescription>
                      Shows game initials when no cover image is available.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CoverArt game={{ title: "Demo Game" } as never} className="aspect-[2/3]" />
                  </CardContent>
                </Card>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <Card className="h-fit">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          Demo
                        </p>
                        <CardTitle>Sample Game</CardTitle>
                      </div>
                      <Badge variant="positive">Strong fit</Badge>
                    </div>
                    <CardDescription>
                      Good match for your taste profile with moderate genre overlap.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <Metric label="Fit" value={85} />
                      <Metric label="Friction" value={22} />
                      <Metric label="Signal" value="Strong match" />
                    </div>
                    <Button variant="secondary">
                      View details <ChevronRight className="size-4" />
                    </Button>
                  </CardContent>
                </Card>

                <Card className="h-fit">
                  <CardHeader>
                    <div className="grid gap-1">
                      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Playfit
                      </p>
                      <CardTitle>Sign In</CardTitle>
                      <CardDescription>Sign in to access your saved profile.</CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className="grid gap-3">
                    <label className="grid gap-1" htmlFor="ui-kit-context-email">
                      <span className="text-xs font-bold text-muted-foreground">Email</span>
                      <Input id="ui-kit-context-email" placeholder="your@email.com" />
                    </label>
                    <label className="grid gap-1" htmlFor="ui-kit-context-password">
                      <span className="text-xs font-bold text-muted-foreground">Password</span>
                      <Input id="ui-kit-context-password" type="password" placeholder="••••••••" />
                    </label>
                    <Button>Sign In</Button>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Sidebar Navigation</CardTitle>
                  <CardDescription>
                    Nav buttons with inactive and active (Finder) states as seen in the app shell.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid w-56 gap-1 rounded-md border border-border bg-card p-3">
                    <button
                      type="button"
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-left text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <CalendarDays className="size-4" /> Today
                    </button>
                    <button
                      type="button"
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-[color-mix(in_srgb,var(--accent),transparent_62%)] bg-[color-mix(in_srgb,var(--accent),transparent_88%)] px-3 text-left text-sm font-bold text-foreground"
                    >
                      <Search className="size-4" /> Finder
                    </button>
                    <button
                      type="button"
                      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-left text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                    >
                      <Library className="size-4" /> Library
                    </button>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Icons */}
            <SectionHeader title="Icons" id="icons" />
            <p className="mb-5 text-sm text-muted-foreground">
              Lucide icons used across the project.
            </p>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {usedIcons.map(({ name, icon: Icon }) => (
                <div
                  key={name}
                  className="flex flex-col items-center gap-2 rounded-md border border-border bg-card p-4"
                >
                  <Icon className="size-6" />
                  <span className="text-[11px] text-muted-foreground">{name}</span>
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
