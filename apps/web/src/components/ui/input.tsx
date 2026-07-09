import * as React from "react";
import { cn } from "@/lib/utils";

const inputBase =
  "flex h-11 w-full rounded-md border border-input bg-input px-3 py-2 text-base md:text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return <input ref={ref} type={type} className={cn(inputBase, className)} {...props} />;
  }
);
Input.displayName = "Input";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export function Textarea({ className, ...props }: TextareaProps) {
  return <textarea className={cn(inputBase, "h-auto min-h-[80px] py-2", className)} {...props} />;
}
