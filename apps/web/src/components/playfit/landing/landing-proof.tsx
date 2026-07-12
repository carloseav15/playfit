"use client";

import { motion } from "motion/react";
import { RecommendationMetric } from "@/components/playfit/recommendation-metric";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/eyebrow";

const stats = [
  { label: "Catalog", value: "65,000+", detail: "games tracked" },
  { label: "Platforms", value: "36", detail: "consoles & storefronts" },
  { label: "Setup time", value: "< 1 min", detail: "3 picks to start" },
];

const decisionBadges: Array<{
  label: string;
  variant: "positive" | "info" | "warning" | "secondary";
}> = [
  { label: "Strong match", variant: "positive" },
  { label: "Worth a look", variant: "info" },
  { label: "Watch out", variant: "warning" },
  { label: "Too early to tell", variant: "secondary" },
];

export function LandingProof() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto grid w-[min(900px,100%)] gap-8 px-4 py-12 [&>*]:min-w-0 md:py-16"
    >
      <div className="grid gap-3 text-center">
        <Eyebrow as="span" className="mx-auto">
          Every read, honestly labeled
        </Eyebrow>
        <h2 className="text-balance font-display text-3xl font-extrabold tracking-tight md:text-4xl">
          Playfit tells you when it isn't sure yet.
        </h2>
        <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground">
          A confident pick and an early guess look nothing alike. Every recommendation carries its
          own match score, watch-outs, and confidence — never dressed up as more certain than it is.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {decisionBadges.map((badge) => (
          <Badge key={badge.label} variant={badge.variant} className="px-3 py-1 text-xs">
            {badge.label}
          </Badge>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((stat) => (
          <RecommendationMetric
            key={stat.label}
            label={stat.label}
            value={stat.value}
            detail={stat.detail}
            className="text-center"
          />
        ))}
      </div>
    </motion.section>
  );
}
