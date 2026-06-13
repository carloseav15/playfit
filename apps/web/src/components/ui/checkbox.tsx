import { Check } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  label?: string;
}

export function Checkbox({ className, label, id, ...props }: CheckboxProps) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border bg-secondary px-4 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:outline-none hover:bg-secondary/60",
        className,
      )}
    >
      <input id={id} type="checkbox" className="sr-only peer" {...props} />
      <span className="grid size-4 shrink-0 place-items-center rounded-[3px] border border-border bg-transparent peer-checked:border-accent peer-checked:bg-accent">
        <Check className="size-3 text-accent-foreground opacity-0 peer-checked:opacity-100 transition-opacity" />
      </span>
      {label && <span className="flex-1 text-sm font-medium">{label}</span>}
    </label>
  );
}
