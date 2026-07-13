"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef } from "react";
import { Button } from "./button";

const toastVariants = cva(
  "flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold shadow-xl",
  {
    variants: {
      variant: {
        default: "border-border bg-card text-foreground",
        error: "border-negative/20 bg-negative-bg text-negative",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface ToastProps extends VariantProps<typeof toastVariants> {
  open: boolean;
  message: string;
  onDismiss: () => void;
  onRetry?: () => void;
  onAction?: () => void;
  actionLabel?: string;
  duration?: number;
}

export function Toast({
  open,
  message,
  onDismiss,
  onRetry,
  onAction,
  actionLabel = "Undo",
  variant = "default",
  duration = 3000,
}: ToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pausedRef = useRef(false);

  const startTimer = useCallback(() => {
    clearTimeout(timerRef.current);
    if (!pausedRef.current) {
      timerRef.current = setTimeout(onDismiss, duration);
    }
  }, [onDismiss, duration]);

  useEffect(() => {
    if (!open) return;
    pausedRef.current = false;
    startTimer();
    return () => clearTimeout(timerRef.current);
  }, [open, startTimer]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="toast"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16, transition: { duration: 0.2 } }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 md:bottom-6"
          onMouseEnter={() => {
            pausedRef.current = true;
            clearTimeout(timerRef.current);
          }}
          onMouseLeave={() => {
            pausedRef.current = false;
            startTimer();
          }}
        >
          <div className={toastVariants({ variant })}>
            <span>{message}</span>
            {onRetry && variant === "error" && (
              <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
                Retry
              </Button>
            )}
            {onAction && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  onAction();
                  onDismiss();
                }}
              >
                {actionLabel}
              </Button>
            )}
            <button
              type="button"
              className="rounded-full px-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onDismiss}
              aria-label="Dismiss message"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export { toastVariants };
