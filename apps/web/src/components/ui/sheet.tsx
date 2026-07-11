"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  side?: "left" | "right";
  title?: string;
  className?: string;
}

export function Sheet({ open, onClose, children, side = "right", title, className }: SheetProps) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) previousFocusRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-dialog bg-black/40" />
        <DialogPrimitive.Content
          aria-modal="true"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            previousFocusRef.current?.focus();
          }}
          className={cn(
            "fixed inset-y-0 z-dialog m-0 h-dvh max-h-dvh w-full max-w-sm border-border bg-background p-0 outline-none",
            side === "left" && "left-0 border-r",
            side === "right" && "right-0 border-l",
            className,
          )}
        >
          <div className="flex h-full flex-col">
            {title ? (
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <DialogPrimitive.Title className="font-display text-lg font-bold">
                  {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
                <DialogPrimitive.Close asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Close">
                    <X className="size-5" />
                  </Button>
                </DialogPrimitive.Close>
              </div>
            ) : (
              <>
                <DialogPrimitive.Title className="sr-only">Panel</DialogPrimitive.Title>
                <DialogPrimitive.Description className="sr-only">Panel</DialogPrimitive.Description>
              </>
            )}
            <div className="flex-1 overflow-y-auto p-4">{children}</div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
