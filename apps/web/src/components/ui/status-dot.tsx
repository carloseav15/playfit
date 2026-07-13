import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const statusDotVariants = cva("inline-block size-1.5 rounded-full", {
  variants: {
    tone: {
      positive: "bg-positive",
      warning: "bg-warning",
      negative: "bg-negative",
      default: "bg-muted-foreground",
    },
  },
  defaultVariants: {
    tone: "default",
  },
});

interface StatusDotProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusDotVariants> {
  label: string;
  animate?: boolean;
}

export function StatusDot({ className, label, tone, animate = false, ...props }: StatusDotProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(statusDotVariants({ tone, className }), animate && "animate-pulse")}
      {...props}
    />
  );
}

export { statusDotVariants };
