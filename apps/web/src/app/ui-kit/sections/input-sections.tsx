"use client";

import { CalendarDays, Check, ChevronRight, Gamepad2, Search, Star } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField, FormLabel, FormMessage } from "@/components/ui/form-field";
import { Input, Textarea } from "@/components/ui/input";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { Tab, Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { ToggleButton, ToggleGroup } from "@/components/ui/toggle-group";
import { Chip, ControlGroup, SectionHeader } from "./helpers";

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

export function ButtonsSection() {
  const [btnVariant, setBtnVariant] = useState<
    "default" | "secondary" | "ghost" | "destructive" | "outline"
  >("default");
  const [btnSize, setBtnSize] = useState<"default" | "sm" | "lg" | "icon">("default");
  const [btnDisabled, setBtnDisabled] = useState(false);
  const [btnLoading, setBtnLoading] = useState(false);

  return (
    <>
      <SectionHeader title="Buttons" id="buttons" />
      <p className="mb-5 text-sm text-muted-foreground">
        Click the playground to customize, or view the grid of all combinations below.
      </p>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Playground</CardTitle>
          <CardDescription>Toggle props to see the button change in real time.</CardDescription>
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
                <Chip key={s} label={s} active={btnSize === s} onClick={() => setBtnSize(s)} />
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
            <Button variant={btnVariant} size={btnSize} disabled={btnDisabled} loading={btnLoading}>
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
    </>
  );
}

export function BadgesSection() {
  const [badgeVariant, setBadgeVariant] = useState<(typeof badgeVariantsList)[number]>("default");
  const [badgeWithIcon, setBadgeWithIcon] = useState(false);

  return (
    <>
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
    </>
  );
}

export function CardsSection() {
  return (
    <>
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
    </>
  );
}

export function InputsSection() {
  const [inputValue, setInputValue] = useState("");
  const [inputDisabled, setInputDisabled] = useState(false);
  const [selectValue, setSelectValue] = useState("option1");

  return (
    <>
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

      <SectionHeader title="Textarea" id="textarea" />
      <p className="mb-5 text-sm text-muted-foreground">
        Multi-line text input with the same styling as Input.
      </p>
      <div className="grid gap-3 max-w-sm">
        <Textarea placeholder="Write something..." />
        <Textarea placeholder="Disabled textarea" disabled />
      </div>

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
    </>
  );
}

export function FormFieldsSection() {
  const [checkedPlatforms, setCheckedPlatforms] = useState<string[]>([]);
  const [radioValue, setRadioValue] = useState("option-a");

  return (
    <>
      <SectionHeader title="FormField" id="form-field" />
      <p className="mb-5 text-sm text-muted-foreground">
        Label + Input wrapper with consistent gap and uppercase label. Includes FormMessage for
        errors/success.
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

      <SectionHeader title="Checkbox" id="checkbox" />
      <p className="mb-5 text-sm text-muted-foreground">
        Styled checkbox with label, using <code className="font-mono text-xs">sr-only</code> native
        input for accessibility.
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

      <SectionHeader title="RadioGroup" id="radio-group" />
      <p className="mb-5 text-sm text-muted-foreground">
        Accessible radio group with icon, label, description, and checkmark indicator.
      </p>
      <div className="max-w-sm">
        <RadioGroup
          name="demo-status"
          aria-label="Status"
          value={radioValue}
          onValueChange={setRadioValue}
        >
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
              value={opt.value}
              label={opt.label}
              description={opt.description}
              icon={opt.icon}
            />
          ))}
        </RadioGroup>
      </div>
    </>
  );
}

export function SelectionControlsSection() {
  const [activeTab, setActiveTab] = useState("All");
  const [activeToggles, setActiveToggles] = useState<string[]>([]);
  const [tags, setTags] = useState(["Action", "RPG", "Strategy"]);

  return (
    <>
      <SectionHeader title="Tabs" id="tabs" />
      <p className="mb-5 text-sm text-muted-foreground">
        Segmented tab control with optional count badges.
      </p>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {["All", "Backlog", "Wishlist"].map((tab) => (
            <Tab key={tab} value={tab} count={tab === "All" ? 42 : tab === "Backlog" ? 12 : 8}>
              {tab}
            </Tab>
          ))}
        </TabsList>
        {["All", "Backlog", "Wishlist"].map((tab) => (
          <TabsContent key={tab} value={tab} className="text-sm text-muted-foreground">
            Showing the "{tab}" list.
          </TabsContent>
        ))}
      </Tabs>

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
          <p className="text-xs text-muted-foreground">All tags removed. Click reset below.</p>
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
    </>
  );
}
