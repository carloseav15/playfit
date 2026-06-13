import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const alertVariants = cva("rounded-lg px-3 py-2 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-muted text-muted-foreground",
      error: "bg-destructive/10 text-destructive",
      success: "bg-positive/10 text-positive",
      warning: "bg-warning/10 text-warning",
      info: "bg-tone-accent/10 text-tone-accent",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export interface AlertProps
  extends React.HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof alertVariants> {}

export function Alert({ className, variant, ...props }: AlertProps) {
  return <p className={cn(alertVariants({ variant, className }))} {...props} />;
}
