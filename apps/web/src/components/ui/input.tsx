import type * as React from "react";
import { cn } from "@/lib/utils";

const inputBase =
  "flex h-11 w-full rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export function Input({ className, type, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input type={type} className={cn(inputBase, className)} {...props} />;
}

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cn(inputBase, "h-auto min-h-[80px] py-2", className)} {...props} />;
}
