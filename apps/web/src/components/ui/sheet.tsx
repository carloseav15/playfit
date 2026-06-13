"use client";

import { X } from "lucide-react";
import type { MouseEvent, SyntheticEvent } from "react";
import { useCallback, useEffect, useRef } from "react";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
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

  const handleCloseEvent = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.addEventListener("close", handleCloseEvent);
    return () => dialog.removeEventListener("close", handleCloseEvent);
  }, [handleCloseEvent]);

  const handleBackdropClick = useCallback((e: MouseEvent) => {
    if (e.target === dialogRef.current) onCloseRef.current();
  }, []);

  const handleCancel = useCallback((e: SyntheticEvent<HTMLDialogElement>) => {
    e.preventDefault();
    onCloseRef.current();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        "m-0 h-dvh max-h-dvh w-full max-w-sm border-l border-border bg-background p-0 backdrop:bg-black/40",
        side === "left" && "ml-0 mr-auto border-l-0 border-r",
        side === "right" && "ml-auto mr-0",
        className,
      )}
      onClick={handleBackdropClick}
      onKeyDown={(e) => {
        if (e.key === "Escape") onCloseRef.current();
      }}
      onCancel={handleCancel}
    >
      <div className="flex h-full flex-col">
        {title && (
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-display text-lg font-bold">{title}</h2>
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
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </dialog>
  );
}
