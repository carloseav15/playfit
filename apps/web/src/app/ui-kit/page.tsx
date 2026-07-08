"use client";

import { Menu, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ColorUsageSection,
  DesignTokensSection,
  LayoutSection,
  TokensSection,
  TypographySection,
} from "./sections/design-sections";
import {
  ErrorBoundarySection,
  FeedbackSection,
  IndicatorsSection,
} from "./sections/feedback-sections";
import { Chip } from "./sections/helpers";
import {
  BadgesSection,
  ButtonsSection,
  CardsSection,
  FormFieldsSection,
  InputsSection,
  SelectionControlsSection,
} from "./sections/input-sections";
import { OverlaySections } from "./sections/overlay-sections";
import {
  AccessibilitySection,
  ComponentStatesSection,
  ContextExamplesSection,
  IconsSection,
} from "./sections/spec-sections";

export default function UiKitPage() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [sidebar, setSidebar] = useState(false);

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
            <TokensSection />
            <ColorUsageSection />
            <LayoutSection />
            <DesignTokensSection />
            <TypographySection />
            <ButtonsSection />
            <BadgesSection />
            <CardsSection />
            <InputsSection />
            <FormFieldsSection />
            <SelectionControlsSection />
            <FeedbackSection />
            <IndicatorsSection />
            <ErrorBoundarySection />
            <OverlaySections />
            <AccessibilitySection />
            <ComponentStatesSection />
            <ContextExamplesSection />
            <IconsSection />
          </main>
        </div>
      </div>
    </div>
  );
}
