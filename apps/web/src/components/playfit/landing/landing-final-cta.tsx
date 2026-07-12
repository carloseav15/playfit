"use client";

import { Compass } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function LandingFinalCta({ onStart }: { onStart: () => void }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto grid w-[min(700px,100%)] gap-6 px-4 py-16 text-center [&>*]:min-w-0 md:py-20"
    >
      <h2 className="text-balance font-display text-3xl font-black tracking-tight md:text-5xl">
        Three picks. One clear answer.
      </h2>

      <div className="flex flex-col items-center gap-3">
        <Button
          type="button"
          size="lg"
          className="w-full bg-accent font-extrabold text-white shadow-[0_4px_14px_rgba(15,118,110,0.2)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_6px_20px_rgba(15,118,110,0.3)] active:scale-[0.98] dark:bg-gradient-to-r dark:from-accent dark:to-accent/75 dark:shadow-[0_0_20px_rgba(255,106,61,0.25)] dark:hover:shadow-[0_0_25px_rgba(255,106,61,0.4)] sm:w-fit"
          onClick={onStart}
        >
          <Compass className="mr-2 size-4" />
          Find what to play
        </Button>
        <span className="text-xs font-semibold text-muted-foreground">
          Free, no account needed.
        </span>
      </div>

      <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-border/60 pt-6 text-xs text-muted-foreground">
        <Link
          href="/legal/privacy"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Privacy Policy
        </Link>
        <Link
          href="/legal/terms"
          className="underline-offset-4 hover:text-foreground hover:underline"
        >
          Terms of Service
        </Link>
      </footer>
    </motion.section>
  );
}
