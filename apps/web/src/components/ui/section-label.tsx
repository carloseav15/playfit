import type * as React from "react";
import { cn } from "@/lib/utils";

interface SectionLabelProps extends React.HTMLAttributes<HTMLParagraphElement> {
  icon?: React.ReactNode;
}

export function SectionLabel({ className, icon, children, ...props }: SectionLabelProps) {
  return (
    <p
      className={cn(
        "flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground",
        className,
      )}
      {...props}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {children}
    </p>
  );
}
