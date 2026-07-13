import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

const tagVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold",
  {
    variants: {
      variant: {
        accent: "bg-accent text-accent-foreground",
        default: "bg-secondary text-secondary-foreground",
      },
    },
    defaultVariants: {
      variant: "accent",
    },
  },
);

export interface TagProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tagVariants> {
  onRemove?: () => void;
}

export function Tag({ className, onRemove, variant, children, ...props }: TagProps) {
  return (
    <span className={cn(tagVariants({ variant, className }))} {...props}>
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-full p-1 -m-1 min-w-6 min-h-6 inline-flex items-center justify-center opacity-60 transition-all hover:bg-muted/20 hover:opacity-100 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Remove"
        >
          <X className="size-3.5" />
        </button>
      )}
    </span>
  );
}

export { tagVariants };
