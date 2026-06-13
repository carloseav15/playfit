import type * as React from "react";
import { cn } from "@/lib/utils";

interface TooltipProps {
  children: React.ReactNode;
  content: string;
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
}

const sideStyles: Record<string, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
  left: "right-full top-1/2 -translate-y-1/2 mr-2",
  right: "left-full top-1/2 -translate-y-1/2 ml-2",
};

const arrowStyles: Record<string, string> = {
  top: "top-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-b-transparent border-t-muted",
  bottom:
    "bottom-full left-1/2 -translate-x-1/2 border-l-transparent border-r-transparent border-t-transparent border-b-muted",
  left: "left-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-r-transparent border-l-muted",
  right:
    "right-full top-1/2 -translate-y-1/2 border-t-transparent border-b-transparent border-l-transparent border-r-muted",
};

export function Tooltip({ children, content, side = "top", className }: TooltipProps) {
  return (
    <span className="relative inline-flex group">
      {/* biome-ignore lint/a11y/useSemanticElements: span avoids invalid nested button HTML */}
      <span className="contents" tabIndex={0} role="button" aria-label={content}>
        {children}
      </span>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-tooltip whitespace-nowrap rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground shadow-sm opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100",
          sideStyles[side],
          className,
        )}
      >
        {content}
        <span className={cn("absolute size-0 border-[4px] border-muted", arrowStyles[side])} />
      </span>
    </span>
  );
}
