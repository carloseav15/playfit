"use client";

import { CalendarDays, ChevronRight, Library, Search } from "lucide-react";
import { CoverArt } from "@/components/playfit/cover-art";
import { Metric } from "@/components/playfit/metric";
import { SectionHead } from "@/components/playfit/section-head";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField, FormLabel } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { usedIcons } from "../data";
import { SectionHeader } from "./helpers";

export function AccessibilitySection() {
  return (
    <>
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
            Todos los componentes interactivos usan <code className="font-mono">focus-visible</code>{" "}
            para mostrar el anillo de foco solo cuando se navega por teclado, no al hacer clic.
          </p>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <h4 className="mb-2 text-sm font-bold">Screen Reader Utilities</h4>
          <code className="font-mono text-xs text-muted-foreground">sr-only</code>
          <p className="mt-2 text-xs text-muted-foreground">
            La clase <code className="font-mono">sr-only</code> oculta visualmente contenido
            manteniéndolo accesible para lectores de pantalla. Usado en labels de iconos, legend de
            fieldset, y descripciones adicionales.
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
            Las animaciones de <code className="font-mono">{"<dialog>"}</code> y transiciones se
            desactivan cuando el usuario prefiere movimiento reducido. También se usa en carruseles
            y StatusDot animado.
          </p>
        </div>
      </div>
    </>
  );
}

export function ComponentStatesSection() {
  return (
    <>
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
    </>
  );
}

export function ContextExamplesSection() {
  return (
    <>
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
              <CardDescription>Strong match signal with moderate genre overlap.</CardDescription>
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
    </>
  );
}

export function IconsSection() {
  return (
    <>
      <SectionHeader title="Icons" id="icons" />
      <p className="mb-5 text-sm text-muted-foreground">Lucide icons used across the project.</p>
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
    </>
  );
}
