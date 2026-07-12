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
  /** Uses a bottom sheet on small screens and a centered dialog from `md` upward. */
  mobileSheet?: boolean;
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
  mobileSheet = false,
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
        <DialogPrimitive.Overlay className="fixed inset-0 z-dialog bg-black/80 backdrop-blur-[2px]" />
        <DialogPrimitive.Content
          aria-modal="true"
          onOpenAutoFocus={onOpenAutoFocus}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            previousFocusRef.current?.focus();
          }}
          className={cn(
            mobileSheet
              ? "fixed inset-x-0 bottom-0 z-[301] max-h-[85dvh] w-full overflow-auto rounded-t-3xl border-x-0 border-b-0 border-border bg-background p-0 shadow-2xl outline-none md:left-1/2 md:top-1/2 md:max-h-[calc(100dvh-4rem)] md:w-[440px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:border"
              : "fixed inset-0 z-dialog m-auto max-h-[92vh] w-[min(640px,calc(100%-2rem))] overflow-auto rounded-lg border border-border bg-background p-0 shadow-2xl outline-none",
            className,
          )}
        >
          {mobileSheet ? (
            <div className="flex justify-center pb-1 pt-3 md:hidden">
              <div className="h-1.5 w-12 rounded-full bg-muted-foreground/30" />
            </div>
          ) : null}

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
