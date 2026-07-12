"use client";

import { motion } from "motion/react";
import { Eyebrow } from "@/components/ui/eyebrow";

export function LandingProblem() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto grid w-[min(760px,100%)] gap-3 px-4 py-12 text-center [&>*]:min-w-0 md:py-16"
    >
      <Eyebrow as="span" className="mx-auto">
        The problem
      </Eyebrow>
      <h2 className="text-balance font-display text-3xl font-extrabold tracking-tight md:text-4xl">
        A hundred games in your library — and thousands more out there. Still nothing you actually
        want to play.
      </h2>
      <p className="mx-auto max-w-2xl text-base leading-relaxed text-muted-foreground">
        Every list looks the same after a while — ratings, tags, hype. None of it says whether a
        game actually fits the person picking it. Playfit does.
      </p>
    </motion.section>
  );
}
