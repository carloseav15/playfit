import type * as React from "react";
import { cn } from "@/lib/utils";

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: "div" | "section" | "article" | "main";
  size?: "sm" | "md" | "lg" | "full";
}

const sizeStyles: Record<string, string> = {
  sm: "max-w-3xl",
  md: "max-w-5xl",
  lg: "max-w-[80rem]",
  full: "max-w-none",
};

export function Container({ className, as: Comp = "div", size = "lg", ...props }: ContainerProps) {
  return <Comp className={cn("mx-auto w-full px-4", sizeStyles[size], className)} {...props} />;
}
