"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import type * as React from "react";
import { cn } from "@/lib/utils";

export function RadioGroup({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof RadioGroupPrimitive.Root>) {
  return <RadioGroupPrimitive.Root className={cn("grid gap-1", className)} {...props} />;
}

export interface RadioItemProps {
  value: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
  id?: string;
}

export function RadioItem({ className, label, description, icon, id, value }: RadioItemProps) {
  return (
    <RadioGroupPrimitive.Item
      value={value}
      id={id}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "cursor-pointer text-muted-foreground hover:bg-accent hover:text-foreground",
        "data-[state=checked]:bg-primary/10 data-[state=checked]:text-foreground",
        className,
      )}
    >
      {icon && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background">
          {icon}
        </span>
      )}
      <span className="flex-1">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
      <RadioGroupPrimitive.Indicator className="flex shrink-0">
        <svg
          className="size-4 text-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </RadioGroupPrimitive.Indicator>
    </RadioGroupPrimitive.Item>
  );
}
