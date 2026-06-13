import { X } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  onRemove?: () => void;
  variant?: "default" | "accent";
}

export function Tag({ className, onRemove, variant = "accent", children, ...props }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold",
        variant === "accent" && "bg-accent text-accent-foreground",
        variant === "default" && "bg-secondary text-secondary-foreground",
        className,
      )}
      {...props}
    >
      {children}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-sm opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Remove"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}
