"use client";

import { buildTodayModel, type RankedSeedGame } from "@playfit/core";
import { Gamepad2, RotateCcw, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CoverArt } from "./cover-art";
import { usePlayfit } from "./playfit-context";
import {
  buildPlatformsKey,
  confidenceLabel,
  decisionLabel,
  decisionTone,
  primaryReason,
  recommendationGroupCopy,
  recommendationGroupTitle,
} from "./product-utils";
import { SectionHead } from "./section-head";

function CarouselCard({
  entry,
  rank,
  statusLabel,
}: {
  entry: RankedSeedGame;
  rank?: number;
  statusLabel?: string;
}) {
  const { openDossier } = usePlayfit();

  const barColor =
    entry.affinityScore >= 78
      ? "var(--positive)"
      : entry.affinityScore >= 62
        ? "var(--warning)"
        : "var(--muted-foreground)";

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.04 }}
      transition={{ duration: 0.18 }}
      onClick={() => openDossier(entry.game.gameId)}
      className="w-56 shrink-0 snap-start cursor-pointer rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative">
        <CoverArt game={entry.game} className="aspect-[2/3]" />
        {rank != null && (
          <span className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-background/80 text-xs font-bold backdrop-blur-sm">
            {rank}
          </span>
        )}
        <span
          className={cn(
            "absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-xs font-bold backdrop-blur-sm",
            entry.affinityScore >= 78
              ? "bg-positive/80"
              : entry.affinityScore >= 62
                ? "bg-warning/80"
                : "bg-muted/80",
          )}
        >
          {entry.affinityScore}
        </span>
      </div>
      <div className="mt-1.5 grid gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-h-10 overflow-hidden text-sm font-medium leading-tight">
            {entry.game.title}
          </p>
          <Badge variant={decisionTone(entry)}>{decisionLabel(entry)}</Badge>
        </div>
        <div
          className="h-1 w-full rounded-full bg-muted-foreground/20"
          role="progressbar"
          aria-valuenow={entry.affinityScore}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Affinity: ${entry.affinityScore}%`}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${entry.affinityScore}%`, backgroundColor: barColor }}
          />
        </div>
        <p className="min-h-8 overflow-hidden text-xs text-muted-foreground">
          {primaryReason(entry)}
        </p>
        <div className="grid gap-1 text-[11px] text-muted-foreground">
          <span>{confidenceLabel(entry.confidence)}</span>
          <span>{entry.cautionReasons[0] ?? "No major caveat yet."}</span>
        </div>
        {statusLabel && <p className="text-xs text-muted-foreground">{statusLabel}</p>}
      </div>
    </motion.button>
  );
}

function TodaySkeleton() {
  return (
    <section>
      <SectionHead
        eyebrow="Today"
        title="Today's picks"
        copy="What you're playing, what's next, and what to pick back up."
      />
      <div className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="min-h-56">
            <CardHeader>
              <Skeleton className="mb-2 h-3 w-16" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-56" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
              <Skeleton className="mt-4 h-9 w-full" />
            </CardContent>
          </Card>
          <Card className="min-h-56">
            <CardHeader>
              <Skeleton className="mb-2 h-3 w-16" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-56" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
              <Skeleton className="mt-4 h-9 w-full" />
            </CardContent>
          </Card>
          <Card className="min-h-56">
            <CardHeader>
              <Skeleton className="mb-2 h-3 w-16" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-56" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
              <Skeleton className="mt-4 h-9 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

export function TodaySection() {
  const { seedData, state, setUi } = usePlayfit();
  const platformsKey = useMemo(
    () => buildPlatformsKey(state.user),
    [state.user.onboarding.platforms],
  );
  const model = useMemo(() => {
    if (!state.user.profile) return null;
    return buildTodayModel(seedData.catalogGames, state, state.user.profile);
  }, [seedData.catalogGames, state.user.profile, state.user.gameStates, platformsKey]);

  if (!model) return <TodaySkeleton />;

  if (!state.user.onboardingCompletedAt) {
    return (
      <section>
        <SectionHead
          eyebrow="Today"
          title="Complete setup first"
          copy="Tell Playfit your platforms and a few favorites so it can start reading games for you."
        />
        <Button
          type="button"
          onClick={() => setUi((current) => ({ ...current, activeTab: "onboarding" }))}
        >
          Go to setup
        </Button>
      </section>
    );
  }

  const hasAnyContent =
    model.currentRun.length > 0 || model.nextUp.length > 0 || model.resume.length > 0;

  if (!hasAnyContent) {
    return (
      <section>
        <SectionHead
          eyebrow="Today"
          title="Your first reads are on the way"
          copy="Add games to your library and mark what you are playing. Playfit will surface the clearest reads here."
        />
        <Button
          type="button"
          onClick={() => setUi((current) => ({ ...current, activeTab: "finder" }))}
        >
          Browse games
        </Button>
      </section>
    );
  }

  return (
    <section>
      <SectionHead
        eyebrow="Today"
        title={model.nextUp.length > 0 ? recommendationGroupTitle(model.nextUp) : "Today"}
        copy={
          model.nextUp.length > 0
            ? recommendationGroupCopy(model.nextUp)
            : "What you are playing, what to resume, and what deserves a closer look."
        }
      />
      <div className="grid gap-8">
        {model.nextUp.length > 0 && (
          <section aria-labelledby="carousel-next-up" className="grid gap-3">
            <p
              id="carousel-next-up"
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
            >
              <Sparkles className="size-3.5" />
              {recommendationGroupTitle(model.nextUp)}
            </p>
            <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth [mask-image:linear-gradient(to_right,transparent_0,black_24px,black_calc(100%-24px),transparent_100%)]">
              {model.nextUp.map((entry, i) => (
                <CarouselCard key={entry.game.gameId} entry={entry} rank={i + 1} />
              ))}
            </div>
          </section>
        )}
        {model.currentRun.length > 0 && (
          <section aria-labelledby="carousel-current-run" className="grid gap-3">
            <p
              id="carousel-current-run"
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
            >
              <Gamepad2 className="size-3.5" />
              Current Run
            </p>
            <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth [mask-image:linear-gradient(to_right,transparent_0,black_24px,black_calc(100%-24px),transparent_100%)]">
              {model.currentRun.map((entry) => (
                <CarouselCard key={entry.game.gameId} entry={entry} statusLabel="Playing" />
              ))}
            </div>
          </section>
        )}
        {model.resume.length > 0 && (
          <section aria-labelledby="carousel-resume" className="grid gap-3">
            <p
              id="carousel-resume"
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground"
            >
              <RotateCcw className="size-3.5" />
              Resume
            </p>
            <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scroll-smooth [mask-image:linear-gradient(to_right,transparent_0,black_24px,black_calc(100%-24px),transparent_100%)]">
              {model.resume.map((entry) => (
                <CarouselCard key={entry.game.gameId} entry={entry} statusLabel="On hold" />
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
