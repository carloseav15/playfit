import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-bold transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      variant: {
        default: "bg-accent text-accent-foreground shadow-sm",
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:bg-secondary/80",
      },
      size: {
        sm: "h-9 px-3",
        default: "h-11 px-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "sm",
    },
  },
);

export interface ToggleButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof toggleVariants> {
  active?: boolean;
}

export function ToggleButton({
  className,
  variant,
  size,
  active = false,
  ...props
}: ToggleButtonProps) {
  return (
    <button
      type="button"
      className={cn(toggleVariants({ variant: active ? "default" : "secondary", size, className }))}
      aria-pressed={active}
      {...props}
    />
  );
}

interface ToggleGroupProps {
  children: React.ReactNode;
  className?: string;
}

export function ToggleGroup({ children, className }: ToggleGroupProps) {
  return <div className={cn("flex flex-wrap gap-2", className)}>{children}</div>;
}
