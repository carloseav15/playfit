"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { usePlayfitUi } from "./playfit-context";

const dotVariants = {
  idle: { opacity: 0, scale: 0.8 },
  saving: { opacity: 1, scale: 1 },
  saved: { opacity: 1, scale: 1 },
  error: { opacity: 1, scale: 1 },
};

const dotColors: Record<string, string> = {
  saving: "bg-warning",
  saved: "bg-positive",
  error: "bg-negative",
};

const dotLabels: Record<string, string> = {
  saving: "Saving",
  saved: "Saved",
  error: "Save error",
};

export function SaveIndicator() {
  const { ui, setUi } = usePlayfitUi();
  const status = ui.saveStatus;
  const show = status === "saving" || status === "saved" || status === "error";

  useEffect(() => {
    if (status === "saved") {
      const timer = setTimeout(() => {
        setUi((prev) => ({ ...prev, saveStatus: "idle" }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [status, setUi]);

  return (
    <AnimatePresence>
      {show ? (
        <motion.div
          key={status}
          initial={{ opacity: 0, y: -8, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.9 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-sm"
        >
          <motion.span
            key={status}
            initial={false}
            animate={dotVariants[status]}
            className={`size-2 rounded-full ${dotColors[status]} ${status === "saving" ? "animate-pulse" : ""}`}
            transition={{ duration: 0.2 }}
          />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {dotLabels[status]}
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
