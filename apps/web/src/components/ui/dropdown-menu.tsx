"use client";

import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface DropdownMenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}

export function DropdownMenu({ trigger, children, align = "start", className }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        close();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, close]);

  const alignStyles: Record<string, string> = {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
  };

  return (
    <span className="relative inline-flex">
      {/* biome-ignore lint/a11y/useSemanticElements: span avoids invalid nested button HTML */}
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
        className="cursor-pointer"
      >
        {trigger}
      </span>
      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          className={cn(
            "absolute top-full z-dropdown mt-1 min-w-44 rounded-lg border border-border bg-card p-1 shadow-md outline-none",
            alignStyles[align],
            className,
          )}
        >
          {children}
        </div>
      )}
    </span>
  );
}

interface DropdownItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ReactNode;
  variant?: "default" | "destructive";
}

export function DropdownItem({
  className,
  icon,
  variant = "default",
  children,
  onClick,
  ...props
}: DropdownItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        variant === "default" && "text-foreground hover:bg-accent hover:text-accent-foreground",
        variant === "destructive" && "text-destructive hover:bg-destructive/10",
        className,
      )}
      {...props}
    >
      {icon && <span className="size-4 shrink-0">{icon}</span>}
      {children}
    </button>
  );
}

interface DropdownSeparatorProps extends React.HTMLAttributes<HTMLHRElement> {}

export function DropdownSeparator({ className, ...props }: DropdownSeparatorProps) {
  return <hr className={cn("my-1 border-t border-border", className)} {...props} />;
}
