"use client";

import { X } from "lucide-react";
import type { KeyboardEvent, MouseEvent, SyntheticEvent } from "react";
import { useCallback, useEffect, useId, useRef } from "react";

import { cn } from "@/lib/utils";
import { Button } from "./button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  eyebrow?: string;
  children: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, eyebrow, children, className }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const dialogTitleId = title ? `dialog-title-${titleId}` : undefined;
  const previousFocusRef = useRef<HTMLElement | null>(null);

  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    }
  }, [open]);

  const handleCloseEvent = useCallback(() => {
    onCloseRef.current();
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    dialog.addEventListener("close", handleCloseEvent);
    return () => dialog.removeEventListener("close", handleCloseEvent);
  }, [handleCloseEvent]);

  const handleBackdropClick = useCallback((e: MouseEvent) => {
    if (e.target === dialogRef.current) {
      onCloseRef.current();
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCloseRef.current();
      return;
    }

    if ((e.key === "Enter" || e.key === " ") && e.target === dialogRef.current) {
      onCloseRef.current();
    }
  }, []);

  const handleCancel = useCallback((e: SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    onCloseRef.current();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "m-auto max-h-[92vh] w-[min(640px,calc(100%-2rem))] overflow-auto rounded-lg border border-border bg-background p-0 shadow-2xl backdrop:bg-black/72",
        className,
      )}
      aria-labelledby={dialogTitleId}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      onCancel={handleCancel}
    >
      {/* Mobile Drag Handle */}
      <div className="flex justify-center pt-3 pb-1 md:hidden shrink-0">
        <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30" />
      </div>

      {(title || eyebrow) && (
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/94 p-4 md:pt-4 pt-1 backdrop-blur-xl">
          <div>
            {eyebrow && (
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 id={dialogTitleId} className="font-display text-2xl font-bold">
                {title}
              </h2>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onCloseRef.current()}
            aria-label="Close"
          >
            <X className="size-5" />
          </Button>
        </div>
      )}
      <div className="p-4">{children}</div>
    </dialog>
  );
}
