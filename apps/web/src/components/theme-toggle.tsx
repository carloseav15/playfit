"use client";

import { Moon, Sun } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="size-10" />;

  const next = theme === "dark" ? "light" : "dark";

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.85 }}
      onClick={() => setTheme(next)}
      className={cn(
        "flex size-10 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className || "fixed right-4 top-4 z-50",
      )}
      aria-label={`Switch to ${next} mode`}
    >
      <motion.div
        key={theme}
        initial={{ rotate: -90, opacity: 0 }}
        animate={{ rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 20 }}
      >
        {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </motion.div>
    </motion.button>
  );
}
