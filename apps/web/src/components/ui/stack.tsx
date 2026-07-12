import type * as React from "react";
import { cn } from "@/lib/utils";

interface StackProps {
  as?: "div" | "span";
  children?: React.ReactNode;
  className?: string;
  direction?: "row" | "column" | "row-reverse" | "column-reverse";
  gap?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "between" | "around" | "evenly";
  wrap?: boolean;
}

const gapStyles: Record<number, string> = {
  0: "gap-0",
  1: "gap-1",
  2: "gap-2",
  3: "gap-3",
  4: "gap-4",
  5: "gap-5",
  6: "gap-6",
  8: "gap-8",
  10: "gap-10",
  12: "gap-12",
};

const alignStyles: Record<NonNullable<StackProps["align"]>, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

const justifyStyles: Record<NonNullable<StackProps["justify"]>, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
};

export function Stack({
  className,
  as: Comp = "div",
  direction = "column",
  gap = 4,
  align,
  justify,
  wrap,
  children,
}: StackProps) {
  return (
    <Comp
      className={cn(
        "flex",
        direction === "row" && "flex-row",
        direction === "column" && "flex-col",
        direction === "row-reverse" && "flex-row-reverse",
        direction === "column-reverse" && "flex-col-reverse",
        gapStyles[gap] ?? "gap-4",
        align && alignStyles[align],
        justify && justifyStyles[justify],
        wrap && "flex-wrap",
        className,
      )}
    >
      {children}
    </Comp>
  );
}
