import type * as React from "react";
import { cn } from "@/lib/utils";

interface RadioGroupProps {
  children: React.ReactNode;
  className?: string;
  name?: string;
}

export function RadioGroup({ children, className, name }: RadioGroupProps) {
  return (
    <fieldset className={cn("grid gap-1", className)}>
      <legend className="sr-only">{name ?? "Options"}</legend>
      {children}
    </fieldset>
  );
}

export interface RadioItemProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  description?: string;
  icon?: React.ReactNode;
}

export function RadioItem({ className, label, description, icon, id, ...props }: RadioItemProps) {
  const isActive = props.checked;
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-within:ring-2 focus-within:ring-ring",
        isActive
          ? "bg-primary/10 text-foreground"
          : "cursor-pointer text-muted-foreground hover:bg-accent hover:text-foreground",
        className,
      )}
    >
      <input id={id} type="radio" className="sr-only" {...props} />
      {icon && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background">
          {icon}
        </span>
      )}
      <span className="flex-1">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        {description && <span className="block text-xs text-muted-foreground">{description}</span>}
      </span>
      {isActive && (
        <svg
          className="size-4 shrink-0 text-primary"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
    </label>
  );
}
