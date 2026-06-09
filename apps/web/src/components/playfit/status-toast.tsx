"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { usePlayfit } from "./playfit-context";

export function StatusToast() {
  const { ui, setUi, retrySave } = usePlayfit();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pausedRef = useRef(false);
  const isSaveError = ui.saveStatus === "error";

  const startTimer = useCallback(() => {
    clearTimeout(timerRef.current);
    if (!pausedRef.current) {
      timerRef.current = setTimeout(() => {
        setUi((current) => ({ ...current, statusMessage: null }));
      }, 5000);
    }
  }, [setUi]);

  useEffect(() => {
    if (!ui.statusMessage) return;
    if (isSaveError) return;
    pausedRef.current = false;
    startTimer();
    return () => clearTimeout(timerRef.current);
  }, [ui.statusMessage, isSaveError, startTimer]);

  return (
    <AnimatePresence>
      {ui.statusMessage && (
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
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold shadow-xl">
            <span>{ui.statusMessage}</span>
            {isSaveError && (
              <Button type="button" size="sm" variant="secondary" onClick={retrySave}>
                Retry
              </Button>
            )}
            <button
              type="button"
              className="rounded-full px-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                clearTimeout(timerRef.current);
                setUi((current) => ({ ...current, statusMessage: null }));
              }}
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
