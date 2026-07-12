"use client";

import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion } from "motion/react";
import { useRef } from "react";
import { CoverArt } from "@/components/playfit/cover-art";
import { matchQualityLabel } from "@/components/playfit/product-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";
import { IconBadge } from "@/components/ui/icon-badge";
import { landingDemoResults, landingDemoTaste } from "./demo-data";

export function LandingDemo() {
  const carouselRef = useRef<HTMLDivElement>(null);

  const scrollByCard = (direction: 1 | -1) => {
    carouselRef.current?.scrollBy({ left: direction * 220, behavior: "smooth" });
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="mx-auto grid w-[min(900px,100%)] min-w-0 gap-8 px-4 py-12 md:py-16"
    >
      <div className="grid min-w-0 gap-3 text-center">
        <Eyebrow as="span" className="mx-auto">
          See it work
        </Eyebrow>
        <h2 className="text-balance font-display text-3xl font-extrabold tracking-tight md:text-4xl">
          This is a real taste profile, run through Playfit's actual engine.
        </h2>
        <p className="mx-auto max-w-xl text-base leading-relaxed text-muted-foreground">
          No setup needed to see it work — here's what it found, ordered by match.
        </p>
      </div>

      <div className="grid min-w-0 gap-3">
        <p className="text-center text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Loved these — not this one
        </p>
        <div className="flex flex-wrap items-start justify-center gap-4">
          {landingDemoTaste.loved.map((game) => (
            <div key={game.gameId} className="grid w-20 gap-1.5 text-center">
              <div className="relative">
                <CoverArt game={game} className="shadow-md" />
                <IconBadge
                  tone="positive"
                  className="absolute -bottom-1.5 -right-1.5 p-1 shadow-md"
                >
                  <Check className="size-3 text-white" />
                </IconBadge>
              </div>
              <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-muted-foreground">
                {game.title}
              </span>
            </div>
          ))}
          {landingDemoTaste.disliked.map((game) => (
            <div key={game.gameId} className="grid w-20 gap-1.5 text-center">
              <div className="relative">
                <CoverArt game={game} className="shadow-md" />
                <IconBadge
                  tone="negative"
                  className="absolute -bottom-1.5 -right-1.5 p-1 shadow-md"
                >
                  <X className="size-3 text-white" />
                </IconBadge>
              </div>
              <span className="line-clamp-2 text-[10px] font-semibold leading-tight text-muted-foreground">
                {game.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="relative min-w-0">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => scrollByCard(-1)}
          className="absolute left-0 top-1/2 z-10 hidden size-8 -translate-y-1/2 rounded-full border border-border bg-background/80 shadow-sm sm:flex"
          aria-label="Scroll to previous recommendation"
        >
          <ChevronLeft className="size-4" />
        </Button>

        <div
          ref={carouselRef}
          className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory px-1 py-1 sm:px-10"
        >
          {landingDemoResults.map((entry) => (
            <div
              key={entry.game.gameId}
              className="grid w-40 shrink-0 snap-center gap-2 rounded-2xl border border-border bg-card p-2.5 shadow-sm"
            >
              <CoverArt game={entry.game} className="shadow-sm" />
              <div className="grid gap-1">
                <p className="line-clamp-2 text-xs font-bold leading-tight text-foreground">
                  {entry.game.title}
                </p>
                <Badge variant="info" className="w-fit px-1.5 py-0 text-[10px]">
                  {matchQualityLabel(entry.affinityScore)} · {entry.affinityScore}/100
                </Badge>
              </div>
            </div>
          ))}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => scrollByCard(1)}
          className="absolute right-0 top-1/2 z-10 hidden size-8 -translate-y-1/2 rounded-full border border-border bg-background/80 shadow-sm sm:flex"
          aria-label="Scroll to next recommendation"
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      <p className="min-w-0 text-center text-xs text-muted-foreground">
        Based on {landingDemoTaste.loved.length} loved picks from setup alone — ratings sharpen the
        reasons further.
      </p>
    </motion.section>
  );
}
