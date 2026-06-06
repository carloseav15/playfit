"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";

import { usePlayfit } from "./playfit-context";

export function StatusToast() {
  const { ui, setUi } = usePlayfit();
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!ui.statusMessage) return;
    timerRef.current = setTimeout(() => {
      setUi((current) => ({ ...current, statusMessage: null }));
    }, 5000);
    return () => clearTimeout(timerRef.current);
  }, [ui.statusMessage, setUi]);

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
        >
          <button
            type="button"
            className="rounded-full border border-border bg-card px-4 py-2 text-sm font-bold shadow-xl"
            onClick={() => {
              clearTimeout(timerRef.current);
              setUi((current) => ({ ...current, statusMessage: null }));
            }}
          >
            {ui.statusMessage}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
