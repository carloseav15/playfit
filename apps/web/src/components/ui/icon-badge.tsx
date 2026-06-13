import type * as React from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "positive" | "info" | "warning" | "negative" | "default";

const toneStyles: Record<BadgeTone, string> = {
  positive: "bg-positive/80",
  info: "bg-tone-accent/80",
  warning: "bg-warning/80",
  negative: "bg-negative/80",
  default: "bg-muted/80",
};

interface IconBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export function IconBadge({ className, tone = "default", children, ...props }: IconBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 backdrop-blur-sm",
        toneStyles[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
