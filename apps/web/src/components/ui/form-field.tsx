"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface FormFieldContextValue {
  descriptionId: string;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);

interface FormFieldProps {
  children: React.ReactNode;
  className?: string;
}

export function FormField({ children, className }: FormFieldProps) {
  const descriptionId = React.useId();

  return (
    <FormFieldContext.Provider value={{ descriptionId }}>
      <div className={cn("grid gap-1", className)}>{children}</div>
    </FormFieldContext.Provider>
  );
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

interface FormControlProps {
  children: React.ReactElement<{ "aria-describedby"?: string }>;
}

export function FormControl({ children }: FormControlProps) {
  const context = React.useContext(FormFieldContext);
  const describedBy = [children.props["aria-describedby"], context?.descriptionId]
    .filter(Boolean)
    .join(" ");

  return React.cloneElement(children, { "aria-describedby": describedBy || undefined });
}

interface FormMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {
  variant?: "error" | "success" | "info";
}

export function FormMessage({ className, id, variant = "error", ...props }: FormMessageProps) {
  const context = React.useContext(FormFieldContext);

  return (
    <p
      id={id ?? context?.descriptionId}
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
