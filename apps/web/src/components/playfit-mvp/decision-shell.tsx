"use client";

import type { ProductDecisionFeedback, RankedSeedGame } from "@playfit/core/types";
import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CoverArt } from "../playfit/cover-art";
import { OnboardingSection } from "../playfit/onboarding-section";
import { usePlayfit } from "../playfit/playfit-context";
import { recommendationGroupTitle } from "../playfit/product-utils";
import { StatusToast } from "../playfit/status-toast";
import { DecisionIntro } from "./decision-intro";
import { PlayNextCard } from "./play-next-card";
import { PlayRouteTabs } from "./play-route-tabs";
import { useTodayRecommendations } from "./use-today-recommendations";

function uniqueEntries(list: RankedSeedGame[]) {
  const seen = new Set<string>();
  return list.filter((entry) => {
    if (seen.has(entry.game.gameId)) return false;
    seen.add(entry.game.gameId);
    return true;
  });
}

export function DecisionShell() {
  const { setStatusMessage, state, applyDecisionFeedback, setPlayfitPick } = usePlayfit();
  const pathname = usePathname();
  const [skippedIds, setSkippedIds] = useState<Set<string>>(() => new Set());
  const [slowLoading, setSlowLoading] = useState(false);
  const [startedCalibration, setStartedCalibration] = useState(false);
  const profileReady = !!state.user.onboardingCompletedAt && !!state.user.profile;
  const { model, loading, loadError } = useTodayRecommendations({
    enabled: profileReady,
    profile: state.user.profile,
    gameStates: state.user.gameStates,
    onboarding: state.user.onboarding,
    errorMessage: "Play Next could not be refreshed.",
    cacheScope: "decision",
  });

  useEffect(() => {
    if (!loading) {
      setSlowLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setSlowLoading(true), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [loading]);

  const candidates = useMemo(() => {
    if (!model) return [];
    return uniqueEntries([...model.nextUp, ...model.resume, ...model.currentRun]);
  }, [model]);
  const visibleCandidates = candidates.filter((entry) => !skippedIds.has(entry.game.gameId));
  const primary = visibleCandidates[0] ?? null;
  const alternatives = visibleCandidates
    .filter((entry) => entry.game.gameId !== primary?.game.gameId)
    .slice(0, 3);

  // Scroll to top whenever the primary recommendation changes
  useEffect(() => {
    if (primary?.game.gameId) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [primary?.game.gameId]);

  function handleFeedback(entry: RankedSeedGame, feedback: ProductDecisionFeedback) {
    applyDecisionFeedback(entry.game.gameId, feedback);
    setSkippedIds((prev) => new Set([...prev, entry.game.gameId]));
  }

  function handleAddPick(entry: RankedSeedGame) {
    setPlayfitPick(entry.game.gameId, true);
    setSkippedIds((prev) => new Set([...prev, entry.game.gameId]));
  }

  function handleShowAnother(entry: RankedSeedGame) {
    setSkippedIds((prev) => new Set([...prev, entry.game.gameId]));
  }

  function handleReason(reason: string) {
    setStatusMessage(`Noted: ${reason.toLowerCase()}.`);
  }

  const picksCount = Object.values(state.user.gameStates).filter(
    (record) =>
      record.inPlayfitPicks &&
      record.status !== "completed" &&
      record.status !== "beaten" &&
      record.status !== "abandoned" &&
      !record.excluded,
  ).length;
  const positiveSignalCount = state.user.onboarding.likedGameIds.length;
  const negativeSignalCount = state.user.onboarding.dislikedGameIds.length;
  const tasteSignalCount = positiveSignalCount + negativeSignalCount;

  if (!profileReady) {
    return (
      <div
        className={cn(
          "bg-background text-foreground flex flex-col w-full justify-start",
          startedCalibration
            ? "h-[100dvh] overflow-hidden md:h-auto md:min-h-[calc(100vh-4rem)] md:items-center md:justify-center md:p-4"
            : "min-h-[calc(100vh-4rem)] items-center justify-center p-4",
        )}
      >
        <Container
          as="main"
          size={startedCalibration ? "full" : "md"}
          className={cn(
            "w-full flex flex-col min-h-0",
            startedCalibration
              ? "h-full p-0 py-0 md:h-auto md:max-w-5xl md:px-6 md:py-8 md:gap-6"
              : "grid gap-6 py-4 md:py-8",
          )}
        >
          {!startedCalibration ? (
            <DecisionIntro onStart={() => setStartedCalibration(true)} />
          ) : (
            <div id="tune-your-taste" className="flex-1 flex flex-col min-h-0 w-full">
              <OnboardingSection />
            </div>
          )}
        </Container>
        <StatusToast />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="relative text-foreground animate-pulse">
        <div className="pointer-events-none absolute left-1/4 top-1/4 size-[500px] rounded-full bg-accent/5 blur-[120px]" />
        <div className="pointer-events-none absolute right-1/4 bottom-1/4 size-[400px] rounded-full bg-indigo-500/5 blur-[100px]" />

        <Container
          as="main"
          size="lg"
          className="grid gap-8 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10 lg:py-8"
        >
          <div className="flex flex-col justify-start min-w-0">
            <div className="rounded-3xl border border-border bg-card p-6 shadow-lg">
              <div className="flex justify-between items-center pb-6">
                <Skeleton className="h-6 w-32 rounded-full" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>

              <div className="grid gap-5 md:grid-cols-[minmax(150px,210px)_minmax(0,1fr)]">
                <Skeleton className="aspect-[2/3] w-full rounded-sm shadow-xl" />

                <div className="grid content-start gap-4">
                  <div>
                    <Skeleton className="h-3 w-24 mb-2" />
                    <Skeleton className="h-9 w-3/4" />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <Skeleton className="h-16 w-full rounded-2xl" />
                    <Skeleton className="h-16 w-full rounded-2xl" />
                    <Skeleton className="h-16 w-full rounded-2xl" />
                  </div>

                  <div className="grid grid-cols-2 gap-3.5">
                    <Skeleton className="h-24 w-full rounded-2xl" />
                    <Skeleton className="h-24 w-full rounded-2xl" />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 pt-6 mt-6 border-t border-border/60">
                <Skeleton className="h-12 w-full rounded-2xl" />
                <Skeleton className="h-20 w-full rounded-2xl" />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-6 min-w-0">
            <section className="grid gap-4 bg-secondary border border-border rounded-3xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="grid gap-1">
                  <h2 className="text-xl font-black tracking-tight text-foreground flex items-center gap-2">
                    <span className="inline-block size-2 rounded-full bg-accent animate-ping" />
                    Finding recommendations...
                  </h2>
                </div>
                <div className="flex gap-1.5 bg-secondary/80 p-1 rounded-2xl border border-border/60">
                  <Skeleton className="h-8 w-16 rounded-xl" />
                  <Skeleton className="h-8 w-16 rounded-xl" />
                </div>
              </div>

              <div className="grid gap-2">
                <CardDescription className="text-xs text-muted-foreground leading-relaxed">
                  Checking your platforms, liked games, and preferences.
                </CardDescription>
              </div>

              {slowLoading ? (
                <div className="rounded-xl border border-warning/20 bg-warning/5 p-3.5 text-xs text-warning leading-relaxed animate-pulse">
                  Analyzing the catalog. Your preferences are saved.
                </div>
              ) : (
                <Skeleton className="h-10 w-full rounded-xl" />
              )}
            </section>

            <section className="grid gap-3">
              <div className="px-1">
                <CardTitle as="h3" className="text-sm font-extrabold text-foreground">
                  Also worth considering
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Other potential candidates matching your preferences.
                </CardDescription>
              </div>
              <div className="rounded-3xl border border-border bg-card p-5 shadow-md grid gap-3">
                <div className="flex gap-3 items-center">
                  <Skeleton className="aspect-[2/3] w-12 rounded-sm" />
                  <div className="grid gap-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <div className="flex gap-3 items-center">
                  <Skeleton className="aspect-[2/3] w-12 rounded-sm" />
                  <div className="grid gap-2 flex-1">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
              </div>
            </section>
          </div>
        </Container>
      </div>
    );
  }

  if (loadError) {
    return (
      <Container as="main" size="sm" className="grid gap-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Play Next could not load</CardTitle>
            <CardDescription>{loadError}</CardDescription>
          </CardHeader>
        </Card>
        <StatusToast />
      </Container>
    );
  }

  if (!primary) {
    return (
      <Container as="main" size="sm" className="grid gap-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>No games to recommend yet</CardTitle>
            <CardDescription>
              Try adding more platforms or rating more games so we can find a recommendation.
            </CardDescription>
          </CardHeader>
        </Card>
        {candidates.length > 0 ? (
          <>
            <Alert variant="info">All current candidates were skipped in this session.</Alert>
            <Button type="button" variant="secondary" onClick={() => setSkippedIds(new Set())}>
              Show skipped again
            </Button>
          </>
        ) : null}
        <StatusToast />
      </Container>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative"
    >
      <div className="pointer-events-none absolute left-1/4 top-1/4 size-[500px] rounded-full bg-accent/5 blur-[120px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 size-[400px] rounded-full bg-indigo-500/5 blur-[100px]" />

      <div className="text-foreground">
        <Container
          as="main"
          size="lg"
          className="grid gap-8 py-6 lg:grid-cols-[1.15fr_0.85fr] lg:gap-10 lg:py-8"
        >
          <div className="flex flex-col justify-start min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 28, mass: 0.8 }}
              className="w-full"
            >
              <PlayNextCard
                entry={primary}
                primary
                inPlayfitPicks={primary.inPlayfitPicks}
                onAddPick={() => handleAddPick(primary)}
                onNotForMe={() => handleFeedback(primary, "not_for_me")}
                onAlreadyPlayed={(feedback) => handleFeedback(primary, feedback)}
                onShowAnother={() => handleShowAnother(primary)}
                onReason={handleReason}
              />
            </motion.div>
          </div>

          <div className="flex flex-col gap-6 min-w-0">
            <section className="grid gap-4 bg-secondary border border-border rounded-3xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle as="h2" className="text-xl font-black tracking-tight text-foreground">
                  {recommendationGroupTitle(model?.nextUp ?? [])}
                </CardTitle>
                <PlayRouteTabs
                  pathname={pathname}
                  picksCount={picksCount}
                  showIcons
                  className="hidden md:flex gap-1.5"
                />
              </div>

              <div className="grid gap-1">
                <CardDescription className="text-xs text-muted-foreground leading-relaxed">
                  Find what to play next, save promising picks, and keep the reasons visible. Only
                  games available on your selected platforms are suggested.
                </CardDescription>
              </div>

              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-accent/5 border border-accent/20 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                <span>{tasteSignalCount} preferences</span>
                <span aria-hidden="true" className="opacity-40">
                  /
                </span>
                <span>{positiveSignalCount} liked</span>
                <span aria-hidden="true" className="opacity-40">
                  /
                </span>
                <span>{negativeSignalCount} avoided</span>
              </div>
            </section>

            {alternatives.length > 0 && (
              <section className="grid gap-3">
                <div className="px-1">
                  <CardTitle as="h3" className="text-sm font-extrabold text-foreground">
                    Also worth considering
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-0.5">
                    Other potential candidates matching your preferences.
                  </CardDescription>
                </div>
                <Card className="overflow-hidden rounded-3xl border border-border bg-card shadow-md">
                  <div className="divide-y divide-border">
                    {alternatives.map((entry) => (
                      <Link
                        key={entry.game.gameId}
                        href={`/play/game/${entry.game.gameId}`}
                        className="group flex items-center justify-between gap-4 p-4 transition-all duration-300 hover:bg-secondary/25 no-underline"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <CoverArt
                            game={entry.game}
                            className="aspect-[2/3] w-11 shrink-0 rounded-sm shadow-md transition-transform duration-300 group-hover:scale-[1.03]"
                          />
                          <div className="min-w-0">
                            <h3 className="font-display text-base font-black leading-snug text-foreground truncate">
                              {entry.game.title}
                            </h3>
                          </div>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          <Badge
                            variant="secondary"
                            className="bg-positive-bg text-positive border border-positive/20 text-[10px] font-extrabold"
                          >
                            {entry.affinityScore}% Match
                          </Badge>
                          <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </Card>
              </section>
            )}
          </div>
          <StatusToast />
        </Container>
      </div>
    </motion.div>
  );
}
