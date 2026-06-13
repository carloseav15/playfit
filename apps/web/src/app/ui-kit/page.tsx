"use client";

import type { ProductRating } from "@playfit/core/types";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  Brain,
  CalendarDays,
  Check,
  ChevronRight,
  Compass,
  Database,
  Download,
  Gamepad2,
  Heart,
  Library,
  Menu,
  Radar,
  RefreshCcw,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { useState } from "react";
import { CoverArt } from "@/components/playfit/cover-art";
import { Metric } from "@/components/playfit/metric";
import { SectionHead } from "@/components/playfit/section-head";
import { StarRating } from "@/components/playfit/star-rating";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Container } from "@/components/ui/container";
import { Dialog } from "@/components/ui/dialog";
import { DropdownItem, DropdownMenu, DropdownSeparator } from "@/components/ui/dropdown-menu";
import { Eyebrow } from "@/components/ui/eyebrow";
import { FormField, FormLabel, FormMessage } from "@/components/ui/form-field";
import { IconBadge } from "@/components/ui/icon-badge";
import { Input, Textarea } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { SectionLabel } from "@/components/ui/section-label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Stack } from "@/components/ui/stack";
import { StatusDot } from "@/components/ui/status-dot";
import { Tab, TabGroup } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { Toast } from "@/components/ui/toast";
import { ToggleButton, ToggleGroup } from "@/components/ui/toggle-group";
import { Tooltip } from "@/components/ui/tooltip";
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
  { name: "Background", var: "--background", light: "#f7f8f4", dark: "#070a12" },
  { name: "Foreground", var: "--foreground", light: "#17201d", dark: "#f8fafc" },
  { name: "Card", var: "--card", light: "rgba(255,255,255,0.76)", dark: "rgba(15,23,42,0.76)" },
  { name: "Primary", var: "--primary", light: "#17201d", dark: "#f8fafc" },
  {
    name: "Secondary",
    var: "--secondary",
    light: "rgba(23,32,29,0.06)",
    dark: "rgba(255,255,255,0.07)",
  },
  { name: "Accent", var: "--accent", light: "#0f766e", dark: "#ff6a3d" },
  { name: "Muted", var: "--muted", light: "rgba(23,32,29,0.07)", dark: "rgba(255,255,255,0.07)" },
  { name: "Destructive", var: "--destructive", light: "#be123c", dark: "#fb7185" },
  { name: "Border", var: "--border", light: "rgba(23,32,29,0.14)", dark: "rgba(148,163,184,0.18)" },
  { name: "Input", var: "--input", light: "rgba(255,255,255,0.82)", dark: "rgba(7,10,18,0.66)" },
  { name: "Ring", var: "--ring", light: "rgba(15,118,110,0.85)", dark: "rgba(255,106,61,0.85)" },
  { name: "Ink", var: "--ink", light: "#0d9488", dark: "#38bdf8" },
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
  { name: "AlertCircle", icon: AlertCircle },
  { name: "ArrowRight", icon: ArrowRight },
  { name: "Bell", icon: Bell },
  { name: "Brain", icon: Brain },
  { name: "CalendarDays", icon: CalendarDays },
  { name: "Check", icon: Check },
  { name: "ChevronRight", icon: ChevronRight },
  { name: "Compass", icon: Compass },
  { name: "Database", icon: Database },
  { name: "Download", icon: Download },
  { name: "Gamepad2", icon: Gamepad2 },
  { name: "Heart", icon: Heart },
  { name: "Library", icon: Library },
  { name: "Radar", icon: Radar },
  { name: "RefreshCcw", icon: RefreshCcw },
  { name: "RotateCcw", icon: RotateCcw },
  { name: "Search", icon: Search },
  { name: "Settings2", icon: Settings2 },
  { name: "ShieldCheck", icon: ShieldCheck },
  { name: "Sparkles", icon: Sparkles },
  { name: "Star", icon: Star },
  { name: "X", icon: X },
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
  const [btnLoading, setBtnLoading] = useState(false);
  const [badgeVariant, setBadgeVariant] = useState<(typeof badgeVariantsList)[number]>("default");
  const [badgeWithIcon, setBadgeWithIcon] = useState(false);
  const [spinnerSize, setSpinnerSize] = useState<"sm" | "default" | "lg">("default");
  const [inputValue, setInputValue] = useState("");
  const [inputDisabled, setInputDisabled] = useState(false);
  const [selectValue, setSelectValue] = useState("option1");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [starRating, setStarRating] = useState<ProductRating | undefined>(0);
  const [sidebar, setSidebar] = useState(false);
  const [toastOpen, setToastOpen] = useState(false);
  const [toastError, setToastError] = useState(false);
  const [progressValue, setProgressValue] = useState(35);
  const [tags, setTags] = useState(["Action", "RPG", "Strategy"]);
  const [checkedPlatforms, setCheckedPlatforms] = useState<string[]>([]);
  const [radioValue, setRadioValue] = useState("option-a");
  const [activeTab, setActiveTab] = useState("tab1");
  const [activeToggles, setActiveToggles] = useState<string[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetLeft, setSheetLeft] = useState(false);

  const sections = [
    { id: "tokens", label: "Tokens" },
    { id: "color-usage", label: "Color Usage" },
    { id: "container", label: "Container" },
    { id: "stack", label: "Stack" },
    { id: "shadows", label: "Shadows" },
    { id: "motion", label: "Motion" },
    { id: "z-index", label: "Z-Index" },
    { id: "typography", label: "Typography" },
    { id: "buttons", label: "Buttons" },
    { id: "badges", label: "Badges" },
    { id: "badge-usage", label: "Badge Usage" },
    { id: "cards", label: "Cards" },
    { id: "inputs", label: "Inputs" },
    { id: "textarea", label: "Textarea" },
    { id: "selects", label: "Selects" },
    { id: "form-field", label: "FormField" },
    { id: "checkbox", label: "Checkbox" },
    { id: "radio-group", label: "RadioGroup" },
    { id: "tabs", label: "Tabs" },
    { id: "toggle-group", label: "ToggleGroup" },
    { id: "tag", label: "Tag" },
    { id: "dialogs", label: "Dialogs" },
    { id: "alert", label: "Alert" },
    { id: "toast", label: "Toast" },
    { id: "progress-bar", label: "ProgressBar" },
    { id: "spinners", label: "Spinners" },
    { id: "skeletons", label: "Skeletons" },
    { id: "separators", label: "Separators" },
    { id: "star-rating", label: "StarRating" },
    { id: "error-boundary", label: "ErrorBoundary" },
    { id: "eyebrow", label: "Eyebrow" },
    { id: "section-label", label: "SectionLabel" },
    { id: "icon-badge", label: "IconBadge" },
    { id: "status-dot", label: "StatusDot" },
    { id: "avatar", label: "Avatar" },
    { id: "tooltip", label: "Tooltip" },
    { id: "sheet", label: "Sheet" },
    { id: "dropdown-menu", label: "DropdownMenu" },
    { id: "accesibilidad", label: "Accesibilidad" },
    { id: "estados", label: "Estados" },
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
            <p className="mt-1 text-[11px] text-muted-foreground">{sections.length} sections</p>
          </div>
          <nav
            className="mt-6 grid content-start gap-1.5 text-sm overflow-y-auto"
            aria-label="UI Kit sections"
          >
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
                  <strong className="text-sm font-bold">Accent — Action</strong>
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
                  <strong className="text-sm font-bold">Cyan — Data / Confidence</strong>
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
                  Green, amber, red, and blue express state: strong match, risk, caveat, or
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
                  <code className="font-mono">--accent</code> is orange/teal (action). Badge{" "}
                  <code className="font-mono">info</code> uses{" "}
                  <code className="font-mono">--tone-accent</code> (blue). They are different — do
                  not assume accent maps orange everywhere.
                </p>
              </div>
            </div>

            {/* Container */}
            <SectionHeader title="Container" id="container" />
            <p className="mb-5 text-sm text-muted-foreground">
              Centered max-width wrapper for page-level layout. Sizes control the content width
              boundary.
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

            {/* Stack */}
            <SectionHeader title="Stack" id="stack" />
            <p className="mb-5 text-sm text-muted-foreground">
              Flex layout component with unified gap and alignment props. Replaces manual flex
              classes.
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
                  {[
                    "Action",
                    "RPG",
                    "Strategy",
                    "Simulation",
                    "FPS",
                    "Puzzle",
                    "Racing",
                    "Sports",
                  ].map((name) => (
                    <span key={name} className="rounded bg-accent/20 px-3 py-1.5 text-xs">
                      {name}
                    </span>
                  ))}
                </Stack>
              </div>
            </div>

            {/* Shadows */}
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

            {/* Motion */}
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

            {/* Z-Index */}
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
                    <Chip
                      label="loading"
                      active={btnLoading}
                      onClick={() => setBtnLoading(!btnLoading)}
                    />
                  </ControlGroup>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant={btnVariant}
                    size={btnSize}
                    disabled={btnDisabled}
                    loading={btnLoading}
                  >
                    {btnSize === "icon" ? <Check className="size-4" /> : "Button"}
                  </Button>
                  {btnSize !== "icon" && (
                    <Button
                      variant={btnVariant}
                      size={btnSize}
                      disabled={btnDisabled}
                      loading={btnLoading}
                    >
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
              Badge variants use theme tokens that adapt to light/dark mode. Badges now support an
              optional <code className="font-mono text-xs">icon</code> prop.
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
                <Chip
                  label="with icon"
                  active={badgeWithIcon}
                  onClick={() => setBadgeWithIcon(!badgeWithIcon)}
                />
                <Badge
                  variant={badgeVariant}
                  icon={badgeWithIcon ? <Star className="size-3" /> : undefined}
                >
                  Sample badge
                </Badge>
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
                  <Badge variant="positive">Strong match</Badge>
                  <Badge variant="info">Worth a look</Badge>
                  <Badge variant="negative">Watch out</Badge>
                  <Badge variant="warning">Too early to tell</Badge>
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
                  Match / Confidence
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="positive">Match 85+</Badge>
                  <Badge variant="negative">Watch-outs 70+</Badge>
                  <Badge variant="info">Emerging pattern</Badge>
                  <Badge variant="warning">Early signal</Badge>
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

            {/* Textarea */}
            <SectionHeader title="Textarea" id="textarea" />
            <p className="mb-5 text-sm text-muted-foreground">
              Multi-line text input with the same styling as Input.
            </p>
            <div className="grid gap-3 max-w-sm">
              <Textarea placeholder="Write something..." />
              <Textarea placeholder="Disabled textarea" disabled />
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

            {/* FormField */}
            <SectionHeader title="FormField" id="form-field" />
            <p className="mb-5 text-sm text-muted-foreground">
              Label + Input wrapper with consistent gap and uppercase label. Includes FormMessage
              for errors/success.
            </p>
            <div className="grid gap-4 max-w-sm">
              <FormField>
                <FormLabel htmlFor="demo-email">Email</FormLabel>
                <Input id="demo-email" type="email" placeholder="you@example.com" />
              </FormField>
              <FormField>
                <FormLabel htmlFor="demo-password">Password</FormLabel>
                <Input id="demo-password" type="password" placeholder="••••••••" />
                <FormMessage variant="error">Password must be at least 6 characters.</FormMessage>
              </FormField>
              <FormField>
                <FormLabel htmlFor="demo-success">Success field</FormLabel>
                <Input id="demo-success" placeholder="Saved!" />
                <FormMessage variant="success">Changes saved successfully.</FormMessage>
              </FormField>
            </div>

            {/* Checkbox */}
            <SectionHeader title="Checkbox" id="checkbox" />
            <p className="mb-5 text-sm text-muted-foreground">
              Styled checkbox with label, using <code className="font-mono text-xs">sr-only</code>{" "}
              native input for accessibility.
            </p>
            <div className="grid gap-2 max-w-sm">
              {["Nintendo Switch", "PlayStation 5", "Xbox Series X", "PC"].map((platform) => {
                const checked = checkedPlatforms.includes(platform);
                return (
                  <Checkbox
                    key={platform}
                    id={`demo-${platform}`}
                    checked={checked}
                    onChange={() =>
                      setCheckedPlatforms((prev) =>
                        prev.includes(platform)
                          ? prev.filter((p) => p !== platform)
                          : [...prev, platform],
                      )
                    }
                    label={platform}
                  />
                );
              })}
            </div>

            {/* RadioGroup */}
            <SectionHeader title="RadioGroup" id="radio-group" />
            <p className="mb-5 text-sm text-muted-foreground">
              Accessible radio group with icon, label, description, and checkmark indicator.
            </p>
            <div className="max-w-sm">
              <RadioGroup name="demo-status">
                {[
                  {
                    value: "option-a",
                    label: "Playing",
                    description: "Actively playing right now",
                    icon: <Gamepad2 className="size-4" />,
                  },
                  {
                    value: "option-b",
                    label: "On hold",
                    description: "Taking a break from this title",
                    icon: <CalendarDays className="size-4" />,
                  },
                  {
                    value: "option-c",
                    label: "Completed",
                    description: "Finished the game",
                    icon: <Check className="size-4" />,
                  },
                ].map((opt) => (
                  <RadioItem
                    key={opt.value}
                    id={`demo-radio-${opt.value}`}
                    name="demo-status"
                    value={opt.value}
                    checked={radioValue === opt.value}
                    onChange={() => setRadioValue(opt.value)}
                    label={opt.label}
                    description={opt.description}
                    icon={opt.icon}
                  />
                ))}
              </RadioGroup>
            </div>

            {/* Tabs */}
            <SectionHeader title="Tabs" id="tabs" />
            <p className="mb-5 text-sm text-muted-foreground">
              Segmented tab control with optional count badges.
            </p>
            <TabGroup>
              {["All", "Backlog", "Wishlist"].map((tab) => (
                <Tab
                  key={tab}
                  variant={activeTab === tab ? "default" : "secondary"}
                  aria-pressed={activeTab === tab}
                  onClick={() => setActiveTab(tab)}
                  count={tab === "All" ? 42 : tab === "Backlog" ? 12 : 8}
                >
                  {tab}
                </Tab>
              ))}
            </TabGroup>

            {/* ToggleGroup */}
            <SectionHeader title="ToggleGroup" id="toggle-group" />
            <p className="mb-5 text-sm text-muted-foreground">
              Multi-select toggle button group for platform filters and similar use cases.
            </p>
            <ToggleGroup>
              {["Switch", "PS5", "Xbox", "PC", "iOS"].map((platform) => {
                const active = activeToggles.includes(platform);
                return (
                  <ToggleButton
                    key={platform}
                    active={active}
                    onClick={() =>
                      setActiveToggles((prev) =>
                        prev.includes(platform)
                          ? prev.filter((p) => p !== platform)
                          : [...prev, platform],
                      )
                    }
                  >
                    {platform}
                  </ToggleButton>
                );
              })}
            </ToggleGroup>

            {/* Tag */}
            <SectionHeader title="Tag" id="tag" />
            <p className="mb-5 text-sm text-muted-foreground">
              Chips/tags with optional dismiss button. Supports{" "}
              <code className="font-mono text-xs">accent</code> and{" "}
              <code className="font-mono text-xs">default</code> variants.
            </p>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Tag key={tag} onRemove={() => setTags((prev) => prev.filter((t) => t !== tag))}>
                  {tag}
                </Tag>
              ))}
              {tags.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  All tags removed. Click reset below.
                </p>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <Tag variant="default">Default tag</Tag>
              <Tag variant="accent">Accent tag</Tag>
              <Tag variant="accent" onRemove={() => {}}>
                Removable tag
              </Tag>
            </div>
            <div className="mt-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setTags(["Action", "RPG", "Strategy"])}
              >
                Reset tags
              </Button>
            </div>

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

            {/* Alert */}
            <SectionHeader title="Alert" id="alert" />
            <p className="mb-5 text-sm text-muted-foreground">
              Inline alert banners for feedback messages. Five variants matching the semantic token
              family.
            </p>
            <div className="grid gap-2 max-w-md">
              <Alert variant="default">This is a default info message.</Alert>
              <Alert variant="success">Changes saved successfully.</Alert>
              <Alert variant="error">Something went wrong. Please try again.</Alert>
              <Alert variant="warning">Your session is about to expire.</Alert>
              <Alert variant="info">A new update is available.</Alert>
            </div>

            {/* Toast */}
            <SectionHeader title="Toast" id="toast" />
            <p className="mb-5 text-sm text-muted-foreground">
              Animated toast notifications with auto-dismiss and retry support.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setToastOpen(true);
                  setToastError(false);
                }}
              >
                Show toast
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  setToastOpen(true);
                  setToastError(true);
                }}
              >
                Show error toast
              </Button>
            </div>
            <Toast
              open={toastOpen}
              message={toastError ? "Failed to save changes." : "Profile saved successfully."}
              variant={toastError ? "error" : "default"}
              onRetry={toastError ? () => alert("Retrying…") : undefined}
              onDismiss={() => setToastOpen(false)}
              duration={3000}
            />

            {/* ProgressBar */}
            <SectionHeader title="ProgressBar" id="progress-bar" />
            <p className="mb-5 text-sm text-muted-foreground">
              Animated progress bar with{" "}
              <code className="font-mono text-xs">role="progressbar"</code> ARIA attributes.
            </p>
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle>Progress playground</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={progressValue}
                    onChange={(e) => setProgressValue(Number(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-xs font-mono">{progressValue}%</span>
                </div>
                <ProgressBar value={progressValue} label="Demo progress" />
              </CardContent>
            </Card>
            <div className="mt-4 grid gap-2 max-w-md">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Step 1 of 2 (50%)</p>
                <ProgressBar value={50} label="Step 1 of 2" />
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Complete (100%)</p>
                <ProgressBar value={100} label="Complete" />
              </div>
            </div>

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
              Interactive half-star rating with preview. Uses{" "}
              <code className="font-mono text-xs">--accent</code> color.
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

            {/* ErrorBoundary */}
            <SectionHeader title="ErrorBoundary" id="error-boundary" />
            <p className="mb-5 text-sm text-muted-foreground">
              React class-based error boundary. Wraps children and catches rendering errors with a
              default or custom fallback.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Default fallback</CardTitle>
                  <CardDescription>
                    Shows "Something went wrong" with error message, Try Again, and Reload buttons.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Usage:{" "}
                    <code className="font-mono">{`<ErrorBoundary><YourComponent /></ErrorBoundary>`}</code>
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Custom fallback</CardTitle>
                  <CardDescription>
                    Pass a <code className="font-mono text-xs">fallback</code> prop for a custom
                    error UI.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Usage:{" "}
                    <code className="font-mono">{`<ErrorBoundary fallback={<CustomError />}><YourComponent /></ErrorBoundary>`}</code>
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Eyebrow */}
            <SectionHeader title="Eyebrow" id="eyebrow" />
            <p className="mb-5 text-sm text-muted-foreground">
              Tiny uppercase label used above section titles as a secondary signal. Can render as{" "}
              <code className="font-mono text-xs">{"<p>"}</code> or{" "}
              <code className="font-mono text-xs">{"<span>"}</code>.
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <div>
                <Eyebrow>Eyebrow as p</Eyebrow>
              </div>
              <div>
                <Eyebrow as="span">Eyebrow as span</Eyebrow>
              </div>
            </div>

            {/* SectionLabel */}
            <SectionHeader title="SectionLabel" id="section-label" />
            <p className="mb-5 text-sm text-muted-foreground">
              Section heading label with optional leading icon. Used inside carousels and content
              blocks.
            </p>
            <div className="flex flex-wrap items-center gap-8">
              <SectionLabel>Plain label</SectionLabel>
              <SectionLabel icon={<Compass className="size-3.5" />}>With icon</SectionLabel>
            </div>

            {/* IconBadge */}
            <SectionHeader title="IconBadge" id="icon-badge" />
            <p className="mb-5 text-sm text-muted-foreground">
              Small overlay badge with backdrop blur. Commonly used over cover art for status
              signals.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <IconBadge tone="default">Default</IconBadge>
              <IconBadge tone="positive">Positive</IconBadge>
              <IconBadge tone="info">Info</IconBadge>
              <IconBadge tone="warning">Warning</IconBadge>
              <IconBadge tone="negative">Negative</IconBadge>
            </div>

            {/* StatusDot */}
            <SectionHeader title="StatusDot" id="status-dot" />
            <p className="mb-5 text-sm text-muted-foreground">
              Small colored dot for live status indicators. Supports optional pulse animation.
            </p>
            <div className="flex flex-wrap items-center gap-6">
              <span className="flex items-center gap-2 text-xs">
                <StatusDot tone="positive" /> Positive
              </span>
              <span className="flex items-center gap-2 text-xs">
                <StatusDot tone="warning" /> Warning
              </span>
              <span className="flex items-center gap-2 text-xs">
                <StatusDot tone="negative" /> Negative
              </span>
              <span className="flex items-center gap-2 text-xs">
                <StatusDot tone="default" /> Default
              </span>
              <span className="flex items-center gap-2 text-xs">
                <StatusDot tone="positive" animate /> Animated
              </span>
            </div>

            {/* Avatar */}
            <SectionHeader title="Avatar" id="avatar" />
            <p className="mb-5 text-sm text-muted-foreground">
              Image with automatic initials or icon fallback on error or while loading.
            </p>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-md border border-border bg-card p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Sizes
                </p>
                <div className="flex items-center gap-4">
                  <Avatar size="sm" alt="User" fallback="A" />
                  <Avatar size="md" alt="User" fallback="A" />
                  <Avatar size="lg" alt="User" fallback="A" />
                  <Avatar size="xl" alt="User" fallback="A" />
                </div>
              </div>
              <div className="rounded-md border border-border bg-card p-4">
                <p className="mb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Fallbacks
                </p>
                <div className="flex items-center gap-4">
                  <Avatar alt="User" fallback="JD" />
                  <Avatar alt="User" />
                  <Avatar alt="Error demo" src="/broken.jpg" fallback="?" />
                </div>
              </div>
            </div>

            {/* Tooltip */}
            <SectionHeader title="Tooltip" id="tooltip" />
            <p className="mb-5 text-sm text-muted-foreground">
              CSS-only hover tooltip with arrow. No JavaScript required. Accessible via
              focus-visible for keyboard users.
            </p>
            <div className="flex flex-wrap items-center gap-8">
              <Tooltip content="Top tooltip" side="top">
                <Button variant="secondary" size="sm">
                  Top
                </Button>
              </Tooltip>
              <Tooltip content="Bottom tooltip" side="bottom">
                <Button variant="secondary" size="sm">
                  Bottom
                </Button>
              </Tooltip>
              <Tooltip content="Left tooltip" side="left">
                <Button variant="secondary" size="sm">
                  Left
                </Button>
              </Tooltip>
              <Tooltip content="Right tooltip" side="right">
                <Button variant="secondary" size="sm">
                  Right
                </Button>
              </Tooltip>
            </div>

            {/* Sheet */}
            <SectionHeader title="Sheet" id="sheet" />
            <p className="mb-5 text-sm text-muted-foreground">
              Slide-in panel powered by the native{" "}
              <code className="font-mono text-xs">{"<dialog>"}</code> element. Use for filters,
              mobile nav, or side content.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSheetOpen(true);
                }}
              >
                Open right sheet
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSheetLeft(true);
                }}
              >
                Open left sheet
              </Button>
            </div>
            <Sheet
              open={sheetOpen}
              onClose={() => setSheetOpen(false)}
              side="right"
              title="Sheet Right"
            >
              <p className="text-sm text-muted-foreground">
                Content slides in from the right side. Escape or backdrop click closes.
              </p>
            </Sheet>
            <Sheet
              open={sheetLeft}
              onClose={() => setSheetLeft(false)}
              side="left"
              title="Sheet Left"
            >
              <p className="text-sm text-muted-foreground">Content slides in from the left side.</p>
            </Sheet>

            {/* Dropdown Menu */}
            <SectionHeader title="DropdownMenu" id="dropdown-menu" />
            <p className="mb-5 text-sm text-muted-foreground">
              Simple popover menu with items, icons, separators, and destructive variant. Click
              outside or press Escape to close.
            </p>
            <DropdownMenu
              align="start"
              trigger={
                <Button variant="secondary" size="sm">
                  Options <ChevronRight className="size-3.5" />
                </Button>
              }
            >
              <DropdownItem icon={<Settings2 className="size-4" />}>Settings</DropdownItem>
              <DropdownItem icon={<Download className="size-4" />}>Download</DropdownItem>
              <DropdownSeparator />
              <DropdownItem icon={<ShieldCheck className="size-4" />}>Share</DropdownItem>
              <DropdownItem variant="destructive" icon={<X className="size-4" />}>
                Delete
              </DropdownItem>
            </DropdownMenu>

            {/* Accesibilidad */}
            <SectionHeader title="Accesibilidad" id="accesibilidad" />
            <p className="mb-5 text-sm text-muted-foreground">
              Patrones de accesibilidad aplicados en todos los componentes del sistema de diseño.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-border bg-card p-4">
                <h4 className="mb-2 text-sm font-bold">Focus Rings</h4>
                <code className="font-mono text-xs text-muted-foreground">
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
                </code>
                <p className="mt-2 text-xs text-muted-foreground">
                  Todos los componentes interactivos usan{" "}
                  <code className="font-mono">focus-visible</code> para mostrar el anillo de foco
                  solo cuando se navega por teclado, no al hacer clic.
                </p>
              </div>
              <div className="rounded-md border border-border bg-card p-4">
                <h4 className="mb-2 text-sm font-bold">Screen Reader Utilities</h4>
                <code className="font-mono text-xs text-muted-foreground">sr-only</code>
                <p className="mt-2 text-xs text-muted-foreground">
                  La clase <code className="font-mono">sr-only</code> oculta visualmente contenido
                  manteniéndolo accesible para lectores de pantalla. Usado en labels de iconos,
                  legend de fieldset, y descripciones adicionales.
                </p>
              </div>
              <div className="rounded-md border border-border bg-card p-4">
                <h4 className="mb-2 text-sm font-bold">Roles y ARIA</h4>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="pr-4 text-left font-mono font-bold">Componente</th>
                      <th className="text-left font-mono font-bold">Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ["Button", "button (nativo)"],
                      ["Dialog", "dialog (nativo)"],
                      ["Sheet", "dialog (nativo)"],
                      ["DropdownMenu", "menu / menuitem"],
                      ["Tooltip", "tooltip"],
                      ["Avatar", "img + aria-label"],
                      ["Checkbox", "checkbox (nativo)"],
                      ["RadioGroup", "radiogroup (fieldset)"],
                      ["Tabs/Tab", "tablist / tab"],
                      ["ToggleGroup", "group + aria-pressed"],
                    ].map(([comp, role]) => (
                      <tr key={comp}>
                        <td className="pr-4 font-mono text-foreground">{comp}</td>
                        <td className="text-muted-foreground">{role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-md border border-border bg-card p-4">
                <h4 className="mb-2 text-sm font-bold">Reduced Motion</h4>
                <code className="font-mono text-xs text-muted-foreground">
                  @media (prefers-reduced-motion)
                </code>
                <p className="mt-2 text-xs text-muted-foreground">
                  Las animaciones de <code className="font-mono">{"<dialog>"}</code> y transiciones
                  se desactivan cuando el usuario prefiere movimiento reducido. También se usa en
                  carruseles y StatusDot animado.
                </p>
              </div>
            </div>

            {/* Estados de Componentes */}
            <SectionHeader title="Estados de Componentes" id="estados" />
            <p className="mb-5 text-sm text-muted-foreground">
              Matriz de estados implementados por cada componente del sistema.
            </p>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-bold">Componente</th>
                    <th className="px-3 py-2 font-bold">Default</th>
                    <th className="px-3 py-2 font-bold">Hover</th>
                    <th className="px-3 py-2 font-bold">Focus</th>
                    <th className="px-3 py-2 font-bold">Disabled</th>
                    <th className="px-3 py-2 font-bold">Loading</th>
                    <th className="px-3 py-2 font-bold">Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    { comp: "Button", cols: ["✓", "✓", "✓", "✓", "✓", "—"] },
                    { comp: "Input", cols: ["✓", "✓", "✓", "✓", "—", "✓ (form)"] },
                    { comp: "Select", cols: ["✓", "✓", "✓", "✓", "—", "✓ (form)"] },
                    { comp: "Checkbox", cols: ["✓", "✓", "✓", "✓", "—", "—"] },
                    { comp: "Radio", cols: ["✓", "✓", "✓", "✓", "—", "—"] },
                    { comp: "Toggle", cols: ["✓", "✓", "✓", "✓", "—", "—"] },
                    { comp: "Badge", cols: ["✓", "—", "—", "—", "—", "—"] },
                    { comp: "Tag", cols: ["✓", "—", "—", "—", "—", "—"] },
                    { comp: "Dialog", cols: ["✓", "—", "✓ (trap)", "—", "—", "—"] },
                    { comp: "Sheet", cols: ["✓", "—", "✓ (trap)", "—", "—", "—"] },
                    { comp: "DropdownItem", cols: ["✓", "✓", "✓", "✓", "—", "—"] },
                    { comp: "Avatar", cols: ["✓", "—", "—", "—", "✓ (img)", "✓ (fallback)"] },
                    { comp: "ProgressBar", cols: ["✓", "—", "—", "—", "—", "—"] },
                    { comp: "Toast", cols: ["✓", "—", "—", "—", "—", "—"] },
                  ].map((row) => (
                    <tr key={row.comp} className="hover:bg-muted/30">
                      <td className="px-3 py-2 font-mono font-bold text-foreground">{row.comp}</td>
                      {row.cols.map((s, i) => (
                        /* biome-ignore lint/suspicious/noArrayIndexKey: static demo table cells */
                        <td key={i} className="px-3 py-2 text-muted-foreground">
                          {s}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
                      <Metric label="Match" value={85} />
                      <Metric label="Watch-outs" value={22} />
                      <Metric label="Confidence" value="High" />
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
                      <Badge variant="positive">Strong match</Badge>
                    </div>
                    <CardDescription>
                      Strong match signal with moderate genre overlap.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <Metric label="Match" value={85} />
                      <Metric label="Watch-outs" value={22} />
                      <Metric label="Confidence" value="High" />
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
                    <FormField>
                      <FormLabel htmlFor="ui-kit-context-email">Email</FormLabel>
                      <Input id="ui-kit-context-email" placeholder="your@email.com" />
                    </FormField>
                    <FormField>
                      <FormLabel htmlFor="ui-kit-context-password">Password</FormLabel>
                      <Input id="ui-kit-context-password" type="password" placeholder="••••••••" />
                    </FormField>
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
