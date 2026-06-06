"use client";

import { X } from "lucide-react";
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

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === dialogRef.current) {
      onCloseRef.current();
    }
  }, []);

  const handleBackdropKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.key === "Enter" || e.key === " ") && e.target === dialogRef.current) {
      onCloseRef.current();
    }
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "max-h-[92vh] w-[min(640px,100%)] overflow-auto rounded-lg border border-border bg-background p-0 shadow-2xl backdrop:bg-black/72",
        className,
      )}
      aria-labelledby={dialogTitleId}
      onClick={handleBackdropClick}
      onKeyDown={handleBackdropKeyDown}
    >
      {(title || eyebrow) && (
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-background/94 p-4 backdrop-blur-xl">
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
        </header>
      )}
      <div className="p-4">{children}</div>
    </dialog>
  );
}
