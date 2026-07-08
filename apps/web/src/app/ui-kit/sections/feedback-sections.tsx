"use client";

import type { ProductRating } from "@playfit/core/types";
import { Compass } from "lucide-react";
import { useState } from "react";
import { StarRating } from "@/components/playfit/star-rating";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconBadge } from "@/components/ui/icon-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SectionLabel } from "@/components/ui/section-label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { StatusDot } from "@/components/ui/status-dot";
import { Toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Chip, ControlGroup, SectionHeader } from "./helpers";

const spinnerSizes = ["sm", "default", "lg"] as const;

export function FeedbackSection() {
  const [toastOpen, setToastOpen] = useState(false);
  const [toastError, setToastError] = useState(false);
  const [progressValue, setProgressValue] = useState(35);
  const [spinnerSize, setSpinnerSize] = useState<"sm" | "default" | "lg">("default");

  return (
    <>
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

      <SectionHeader title="ProgressBar" id="progress-bar" />
      <p className="mb-5 text-sm text-muted-foreground">
        Animated progress bar with <code className="font-mono text-xs">role="progressbar"</code>{" "}
        ARIA attributes.
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
    </>
  );
}

export function IndicatorsSection() {
  const [starRating, setStarRating] = useState<ProductRating | undefined>(0);

  return (
    <>
      <SectionHeader title="Separators" id="separators" />
      <p className="mb-5 text-sm text-muted-foreground">Horizontal and vertical line separators.</p>
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

      <SectionHeader title="SectionLabel" id="section-label" />
      <p className="mb-5 text-sm text-muted-foreground">
        Section heading label with optional leading icon. Used inside carousels and content blocks.
      </p>
      <div className="flex flex-wrap items-center gap-8">
        <SectionLabel>Plain label</SectionLabel>
        <SectionLabel icon={<Compass className="size-3.5" />}>With icon</SectionLabel>
      </div>

      <SectionHeader title="IconBadge" id="icon-badge" />
      <p className="mb-5 text-sm text-muted-foreground">
        Small overlay badge with backdrop blur. Commonly used over cover art for status signals.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <IconBadge tone="default">Default</IconBadge>
        <IconBadge tone="positive">Positive</IconBadge>
        <IconBadge tone="info">Info</IconBadge>
        <IconBadge tone="warning">Warning</IconBadge>
        <IconBadge tone="negative">Negative</IconBadge>
      </div>

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

      <SectionHeader title="Tooltip" id="tooltip" />
      <p className="mb-5 text-sm text-muted-foreground">
        CSS-only hover tooltip with arrow. No JavaScript required. Accessible via focus-visible for
        keyboard users.
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
    </>
  );
}

export function ErrorBoundarySection() {
  return (
    <>
      <SectionHeader title="ErrorBoundary" id="error-boundary" />
      <p className="mb-5 text-sm text-muted-foreground">
        React class-based error boundary. Wraps children and catches rendering errors with a default
        or custom fallback.
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
              Pass a <code className="font-mono text-xs">fallback</code> prop for a custom error UI.
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
    </>
  );
}
