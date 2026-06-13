import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const tabVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-bold transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground shadow-sm",
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
      },
      size: {
        sm: "h-9 px-3 text-xs",
        default: "h-11 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  },
);

export interface TabProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof tabVariants> {
  count?: number;
}

export function Tab({ className, variant, size, count, children, ...props }: TabProps) {
  return (
    <button type="button" className={cn(tabVariants({ variant, size, className }))} {...props}>
      {children}
      {count != null && <span className="text-xs opacity-70">({count})</span>}
    </button>
  );
}

interface TabGroupProps {
  children: React.ReactNode;
  className?: string;
}

export function TabGroup({ children, className }: TabGroupProps) {
  return <div className={cn("flex items-center gap-2", className)}>{children}</div>;
}
