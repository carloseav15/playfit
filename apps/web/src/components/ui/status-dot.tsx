import type * as React from "react";
import { cn } from "@/lib/utils";

type StatusTone = "positive" | "warning" | "negative" | "default";

const dotStyles: Record<StatusTone, string> = {
  positive: "bg-positive",
  warning: "bg-warning",
  negative: "bg-negative",
  default: "bg-muted-foreground",
};

interface StatusDotProps extends React.HTMLAttributes<HTMLSpanElement> {
  label: string;
  tone: StatusTone;
  animate?: boolean;
}

export function StatusDot({ className, label, tone, animate = false, ...props }: StatusDotProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        "inline-block size-1.5 rounded-full",
        dotStyles[tone],
        animate && "animate-pulse",
        className,
      )}
      {...props}
    />
  );
}
