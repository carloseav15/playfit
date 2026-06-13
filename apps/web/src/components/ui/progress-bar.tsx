"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export interface ProgressBarProps {
  value: number;
  min?: number;
  max?: number;
  label?: string;
  className?: string;
  barClassName?: string;
}

export function ProgressBar({
  value,
  min = 0,
  max = 100,
  label,
  className,
  barClassName,
}: ProgressBarProps) {
  const percent = ((value - min) / (max - min)) * 100;

  return (
    <div
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={label}
    >
      <motion.div
        className={cn("absolute inset-y-0 left-0 rounded-full bg-accent", barClassName)}
        initial={{ width: "0%" }}
        animate={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
      />
    </div>
  );
}
