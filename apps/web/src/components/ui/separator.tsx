import type * as React from "react";

import { cn } from "@/lib/utils";

interface SeparatorProps extends React.HTMLAttributes<HTMLHRElement> {
  /** Set when the separator conveys real document structure (e.g. between form sections) rather than being purely decorative. */
  semantic?: boolean;
}

export function Separator({ className, semantic = false, ...props }: SeparatorProps) {
  return (
    <hr
      role={semantic ? "separator" : "none"}
      className={cn("h-px w-full bg-border border-none", className)}
      {...props}
    />
  );
}
