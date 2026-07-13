import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const iconBadgeVariants = cva(
  "inline-flex items-center rounded-md px-1.5 py-0.5 backdrop-blur-sm",
  {
    variants: {
      tone: {
        positive: "bg-positive/80",
        info: "bg-tone-accent/80",
        warning: "bg-warning/80",
        negative: "bg-negative/80",
        default: "bg-muted/80",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  },
);

interface IconBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof iconBadgeVariants> {}

export function IconBadge({ className, tone, children, ...props }: IconBadgeProps) {
  return (
    <span className={cn(iconBadgeVariants({ tone, className }))} {...props}>
      {children}
    </span>
  );
}

export { iconBadgeVariants };
