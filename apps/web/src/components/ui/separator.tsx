import type * as React from "react";

import { cn } from "@/lib/utils";

export function Separator({ className, ...props }: React.HTMLAttributes<HTMLHRElement>) {
  return <hr role="none" className={cn("h-px w-full bg-border border-none", className)} {...props} />;
}
