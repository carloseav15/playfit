"use client";

import { Compass } from "lucide-react";
import { motion } from "motion/react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export function LandingHero({ onStart }: { onStart: () => void }) {
  return (
    <section className="relative overflow-hidden px-4 pb-16 pt-10 sm:pt-16 md:pb-20 md:pt-20">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 size-[28rem] rounded-full bg-accent/20 blur-[120px] animate-pulse-slow"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/2 size-96 rounded-full bg-positive/10 blur-[100px] animate-pulse-slower"
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative z-10 mx-auto flex w-[min(760px,100%)] min-w-0 flex-col items-center gap-6 text-center"
      >
        <div className="flex items-center gap-3">
          <div className="relative size-11 shrink-0 overflow-hidden rounded-2xl border border-border/50 bg-secondary/50 shadow-md">
            <Image
              src="/playfit_logo_light.png"
              alt="Playfit"
              fill
              sizes="44px"
              className="object-cover dark:hidden"
            />
            <Image
              src="/playfit_logo_dark.png"
              alt="Playfit"
              fill
              sizes="44px"
              className="hidden object-cover dark:block"
            />
          </div>
          <span className="font-mono text-xs font-black uppercase tracking-[0.2em] text-accent">
            Playfit
          </span>
        </div>

        <h1 className="max-w-2xl text-balance font-display text-4xl font-black leading-[0.95] tracking-tight text-foreground sm:text-5xl md:text-6xl">
          Never waste your time on{" "}
          <span className="bg-gradient-to-r from-accent to-pink-500 bg-clip-text text-transparent">
            the wrong game again.
          </span>
        </h1>

        <p className="max-w-prose text-base leading-relaxed text-muted-foreground sm:text-lg">
          Tell Playfit what you've loved and what didn't land. It finds your next best match — in
          your library or not — with the reasons attached, not a wall of star ratings.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
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
            Free. No account needed.
          </span>
        </div>
      </motion.div>
    </section>
  );
}
