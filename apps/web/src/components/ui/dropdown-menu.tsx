"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type * as React from "react";
import { cn } from "@/lib/utils";

interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}

export function DropdownMenu({ trigger, children, align = "start", className }: DropdownMenuProps) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          sideOffset={4}
          className={cn(
            "z-dropdown min-w-44 rounded-lg border border-border bg-card p-1 shadow-md outline-none",
            className,
          )}
        >
          {children}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

interface DropdownItemProps
  extends React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> {
  icon?: React.ReactNode;
  variant?: "default" | "destructive";
}

export function DropdownItem({
  className,
  icon,
  variant = "default",
  children,
  ...props
}: DropdownItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors outline-none",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        variant === "default" &&
          "text-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        variant === "destructive" && "text-destructive data-[highlighted]:bg-destructive/10",
        className,
      )}
      {...props}
    >
      {icon && <span className="size-4 shrink-0">{icon}</span>}
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownSeparator({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      className={cn("my-1 border-t border-border", className)}
      {...props}
    />
  );
}
