"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type * as React from "react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
  /** Overrides Radix's default auto-focus-to-content behavior on open. */
  onOpenAutoFocus?: (event: Event) => void;
}

export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  children,
  className,
  onOpenAutoFocus,
}: DialogProps) {
  const hasHeader = Boolean(title || eyebrow);
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-dialog bg-black/72" />
        <DialogPrimitive.Content
          aria-modal="true"
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            previousFocusRef.current?.focus();
          }}
          className={cn(
            "fixed inset-0 z-dialog m-auto max-h-[92vh] w-[min(640px,calc(100%-2rem))] overflow-auto rounded-lg border border-border bg-background p-0 shadow-2xl outline-none",
            className,
          )}
        >
          {/* Mobile Drag Handle */}
          <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
            <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30" />
          </div>

          {hasHeader ? (
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/94 p-4 md:pt-4 pt-1 backdrop-blur-xl">
              <div>
                {eyebrow && (
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {eyebrow}
                  </p>
                )}
                {title && (
                  <DialogPrimitive.Title className="font-display text-2xl font-bold">
                    {title}
                  </DialogPrimitive.Title>
                )}
              </div>
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" size="icon" aria-label="Close">
                  <X className="size-5" />
                </Button>
              </DialogPrimitive.Close>
            </div>
          ) : (
            <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>
          )}
          <DialogPrimitive.Description className="sr-only">
            {title ?? eyebrow ?? "Dialog"}
          </DialogPrimitive.Description>
          <div className="p-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
