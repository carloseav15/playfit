import type * as React from "react";
import { cn } from "@/lib/utils";

interface EyebrowProps extends React.HTMLAttributes<HTMLParagraphElement> {
  as?: "p" | "span";
}

export function Eyebrow({ className, as: Comp = "p", ...props }: EyebrowProps) {
  return (
    <Comp
      className={cn(
        "text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
