"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex items-center gap-2", className)} {...props} />;
}

const tabVariants = cva(
  cn(
    "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-bold transition-all duration-150 cursor-pointer",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-sm",
    "data-[state=inactive]:border data-[state=inactive]:border-border data-[state=inactive]:bg-secondary data-[state=inactive]:text-secondary-foreground data-[state=inactive]:hover:bg-secondary/80",
  ),
  {
    variants: {
      size: {
        sm: "h-9 px-3 text-xs",
        default: "h-11 px-4",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  },
);

export interface TabProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabVariants> {
  count?: number;
}

export function Tab({ className, size, count, children, ...props }: TabProps) {
  return (
    <TabsPrimitive.Trigger className={cn(tabVariants({ size, className }))} {...props}>
      {children}
      {count != null && <span className="text-xs opacity-70">({count})</span>}
    </TabsPrimitive.Trigger>
  );
}

export function TabsContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-3 focus-visible:outline-none", className)}
      {...props}
    />
  );
}
