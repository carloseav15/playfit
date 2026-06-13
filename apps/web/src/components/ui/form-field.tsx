import type * as React from "react";
import { cn } from "@/lib/utils";

interface FormFieldProps {
  children: React.ReactNode;
  className?: string;
}

export function FormField({ children, className }: FormFieldProps) {
  return <div className={cn("grid gap-1", className)}>{children}</div>;
}

interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
}

export function FormLabel({ className, children, ...props }: FormLabelProps) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: used with htmlFor pointing to an input
    <label
      className={cn("text-xs font-bold uppercase tracking-wide text-muted-foreground", className)}
      {...props}
    >
      {children}
    </label>
  );
}

interface FormMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {
  variant?: "error" | "success" | "info";
}

export function FormMessage({ className, variant = "error", ...props }: FormMessageProps) {
  return (
    <p
      className={cn(
        "text-xs",
        variant === "error" && "text-destructive",
        variant === "success" && "text-positive",
        variant === "info" && "text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
