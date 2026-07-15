"use client";

import type { ProductDecisionFeedback, RankedSeedGame } from "@playfit/core/types";
import { ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { redirectToMarketingLanding } from "@/lib/redirect-to-landing";
import { cn } from "@/lib/utils";
import { CoverArt } from "../playfit/cover-art";
import { OnboardingSection } from "../playfit/onboarding-section";
import type { SaveStatus } from "../playfit/playfit-context";
import { usePlayfitState, usePlayfitUi } from "../playfit/playfit-context";
import { recommendationGroupTitle } from "../playfit/product-utils";
import { StatusToast } from "../playfit/status-toast";
import { PlayNextCard } from "./play-next-card";
import { usePlayNextRecommendations } from "./use-play-next-recommendations";

export function shouldRefreshRecommendationsAfterSave({
  pending,
  previousSaveStatus,
  saveStatus,
}: {
  pending: boolean;
  previousSaveStatus: SaveStatus;
  saveStatus: SaveStatus;
}) {
  return pending && previousSaveStatus === "saving" && saveStatus === "saved";
}

export function shouldShowNoRecommendations({
  primary,
  loading,
  refreshing,
  refreshPending,
}: {
  primary: RankedSeedGame | null;
  loading: boolean;
  refreshing: boolean;
  refreshPending: boolean;
}) {
  return !primary && !loading && !refreshing && !refreshPending;
}

export function DecisionShell({
  startInCalibration = false,
  onExitToLanding,
}: {
  startInCalibration?: boolean;
  /** When set by the marketing landing page, open the onboarding wizard directly. */
  onExitToLanding?: () => void;
}) {
  const { state, applyDecisionFeedback, setPlayfitPick, resetLocalState } = usePlayfitState();
  const { ui } = usePlayfitUi();
  const [slowLoading, setSlowLoading] = useState(false);
  // Resume the onboarding wizard directly when the account has in-progress onboarding
  // data saved server-side. The marketing landing also sets this flag when its CTA opens
  // the wizard, so there is only one onboarding entry experience.
  const [calibrationOpen, setCalibrationOpen] = useState(() => {
    if (startInCalibration) return true;
    const onboarding = state.user.onboarding;
    return (
      !state.user.onboardingCompletedAt &&
      (onboarding.platforms.length > 0 ||
        onboarding.likedGameIds.length > 0 ||
        onboarding.dislikedGameIds.length > 0)
    );
  });
  const [recommendationRefreshPending, setRecommendationRefreshPending] = useState(false);
  const recommendationRefreshPendingRef = useRef(false);
  const previousSaveStatusRef = useRef<SaveStatus>(ui.saveStatus);
  const profileReady = !!state.user.onboardingCompletedAt && !!state.user.profile;

  const [pool, setPool] = useState<RankedSeedGame[]>([]);
  const [stablePrimaryId, setStablePrimaryId] = useState<string | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(() => new Set());
  const initialPrimarySetRef = useRef(false);
  const exhaustedRef = useRef(false);
  const { model, loading, refreshing, loadError, refreshRecommendations } =
    usePlayNextRecommendations({
      enabled: profileReady,
      errorMessage: "Play Next could not be refreshed.",
      onNeedsResync: resetLocalState,
    });

  const isInitialLoading = loading && !model;
  const isWaitingForCandidates = recommendationRefreshPending || refreshing;

  useEffect(() => {
    if (!profileReady && !startInCalibration) redirectToMarketingLanding();
  }, [profileReady, startInCalibration]);

  useEffect(() => {
    if (
      shouldRefreshRecommendationsAfterSave({
        pending: recommendationRefreshPendingRef.current,
        previousSaveStatus: previousSaveStatusRef.current,
        saveStatus: ui.saveStatus,
      })
    ) {
      recommendationRefreshPendingRef.current = false;
      setRecommendationRefreshPending(false);
      refreshRecommendations();
    }

    if (recommendationRefreshPendingRef.current && ui.saveStatus === "error") {
      recommendationRefreshPendingRef.current = false;
      setRecommendationRefreshPending(false);
    }

    previousSaveStatusRef.current = ui.saveStatus;
  }, [refreshRecommendations, ui.saveStatus]);

  useEffect(() => {
    if (!profileReady) {
      recommendationRefreshPendingRef.current = false;
      setRecommendationRefreshPending(false);
    }
  }, [profileReady]);

  const isTransient = isInitialLoading;

  useEffect(() => {
    if (!isTransient) {
      setSlowLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => setSlowLoading(true), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [isTransient]);

  const visiblePool = useMemo(
    () => pool.filter((entry) => !excludedIds.has(entry.game.gameId)),
    [pool, excludedIds],
  );

  const primary = useMemo(
    () =>
      visiblePool.find((entry) => entry.game.gameId === stablePrimaryId) ?? visiblePool[0] ?? null,
    [visiblePool, stablePrimaryId],
  );

  const primaryIndex = useMemo(
    () => visiblePool.findIndex((entry) => entry.game.gameId === primary?.game.gameId),
    [visiblePool, primary],
  );

  const alternatives = useMemo(() => {
    if (primaryIndex < 0 || !primary) return [];
    return visiblePool.slice(primaryIndex + 1, primaryIndex + 4);
  }, [visiblePool, primaryIndex, primary]);

  // Set stable primary from the very first model load
  useEffect(() => {
    if (model?.primary && !initialPrimarySetRef.current) {
      initialPrimarySetRef.current = true;
      setStablePrimaryId(model.primary.game.gameId);
    }
  }, [model]);

  // Merge model entries into the pool (accumulates across refreshes)
  useEffect(() => {
    if (!model) return;
    const modelEntries = [model.primary, ...model.alternatives].filter(
      (entry): entry is RankedSeedGame => entry !== null,
    );

    if (modelEntries.length === 0) return;

    setPool((prev) => {
      const existingIds = new Set(prev.map((e) => e.game.gameId));
      const newEntries = modelEntries.filter((e) => !existingIds.has(e.game.gameId));
      if (newEntries.length === 0 && prev.length > 0) {
        exhaustedRef.current = true;
      }
      return newEntries.length > 0 ? [...prev, ...newEntries] : prev;
    });
  }, [model]);

  // Auto-load next page when the visible pool is nearly empty
  useEffect(() => {
    if (
      visiblePool.length <= 2 &&
      !exhaustedRef.current &&
      !refreshing &&
      !recommendationRefreshPending &&
      profileReady
    ) {
      refreshRecommendations();
    }
  }, [
    visiblePool.length,
    refreshing,
    recommendationRefreshPending,
    profileReady,
    refreshRecommendations,
  ]);

  // Scroll to top whenever the primary recommendation changes
  useEffect(() => {
    if (primary?.game.gameId) {
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  }, [primary?.game.gameId]);

  function advancePrimaryPast(currentGameId: string) {
    const currentIdx = visiblePool.findIndex((e) => e.game.gameId === currentGameId);
    const next = visiblePool[currentIdx + 1] ?? null;
    setStablePrimaryId(next?.game.gameId ?? null);
  }

  function handleFeedback(entry: RankedSeedGame, feedback: ProductDecisionFeedback) {
    const gameId = entry.game.gameId;
    setExcludedIds((prev) => new Set([...prev, gameId]));
    advancePrimaryPast(gameId);
    recommendationRefreshPendingRef.current = true;
    setRecommendationRefreshPending(true);
    applyDecisionFeedback(gameId, feedback, () => {
      setExcludedIds((prev) => {
        const next = new Set(prev);
        next.delete(gameId);
        return next;
      });
      setStablePrimaryId(gameId);
      recommendationRefreshPendingRef.current = false;
      setRecommendationRefreshPending(false);
    });
  }

  function handleAddPick(entry: RankedSeedGame) {
    setExcludedIds((prev) => new Set([...prev, entry.game.gameId]));
    advancePrimaryPast(entry.game.gameId);
    recommendationRefreshPendingRef.current = true;
    setRecommendationRefreshPending(true);
    setPlayfitPick(entry.game.gameId, true);
  }

  function handleShowAnother(entry: RankedSeedGame) {
    setExcludedIds((prev) => new Set([...prev, entry.game.gameId]));
    advancePrimaryPast(entry.game.gameId);
  }

  const positiveSignalCount = state.user.onboarding.likedGameIds.length;
  const negativeSignalCount = state.user.onboarding.dislikedGameIds.length;
  const tasteSignalCount = positiveSignalCount + negativeSignalCount;
  const ratedCount = state.user.profile?.ratedCount ?? 0;

  if (!profileReady) {
    if (!startInCalibration) return null;

    return (
      <div
        className={cn(
          "bg-background text-foreground flex flex-col w-full justify-start",
          calibrationOpen
            ? "min-h-[100dvh] md:h-auto md:min-h-[calc(100vh-4rem)] md:items-center md:justify-center md:p-4"
            : "min-h-[calc(100vh-4rem)] items-center justify-center p-4",
        )}
      >
        <Container
          as="main"
          size={calibrationOpen ? "full" : "md"}
          className={cn(
            "w-full flex flex-col min-h-0",
            calibrationOpen
              ? "min-h-0 p-0 py-0 md:h-auto md:max-w-5xl md:px-6 md:py-8 md:gap-6"
              : "grid gap-6 py-4 md:py-8",
          )}
        >
          <div id="tune-your-taste" className="flex-1 flex flex-col min-h-0 w-full">
            <OnboardingSection onExit={onExitToLanding ?? (() => setCalibrationOpen(false))} />
          </div>
        </Container>
        <StatusToast />
      </div>
    );
  }

  if (isTransient) {
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
                <Skeleton className="aspect-[3/4] w-full rounded-sm shadow-xl" />

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
                  <Skeleton className="aspect-[3/4] w-12 rounded-sm" />
                  <div className="grid gap-2 flex-1">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <div className="flex gap-3 items-center">
                  <Skeleton className="aspect-[3/4] w-12 rounded-sm" />
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

  if (!primary && isWaitingForCandidates) {
    return (
      <Container as="main" size="sm" className="grid gap-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Refreshing recommendations...</CardTitle>
            <CardDescription>
              Your action is being saved. Playfit is finding the next candidate in the background.
            </CardDescription>
          </CardHeader>
        </Card>
        <StatusToast />
      </Container>
    );
  }

  if (
    shouldShowNoRecommendations({
      primary,
      loading,
      refreshing,
      refreshPending: recommendationRefreshPending,
    })
  ) {
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
        {pool.length > 0 ? (
          <>
            <Alert variant="info">All current candidates were skipped in this session.</Alert>
            <Button type="button" variant="secondary" onClick={() => setExcludedIds(new Set())}>
              Show skipped again
            </Button>
          </>
        ) : null}
        <StatusToast />
      </Container>
    );
  }

  if (!primary) return null;

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
              />
            </motion.div>
          </div>

          <div className="flex flex-col gap-6 min-w-0">
            <section className="grid gap-4 bg-secondary border border-border rounded-3xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <CardTitle as="h2" className="text-xl font-black tracking-tight text-foreground">
                  {recommendationGroupTitle(visiblePool)}
                </CardTitle>
              </div>

              <div className="grid gap-1">
                <CardDescription className="text-xs text-muted-foreground leading-relaxed">
                  Find what to play next, save promising picks, and keep the reasons visible. Only
                  games available on your selected platforms are suggested.
                </CardDescription>
                {ratedCount < 3 && (
                  <p className="text-[11px] text-accent mt-0.5 font-semibold">
                    ✨ Rate {3 - ratedCount} more game{3 - ratedCount === 1 ? "" : "s"} to unlock
                    detailed match reasons.
                  </p>
                )}
                {isWaitingForCandidates ? (
                  <p className="text-[11px] text-muted-foreground mt-0.5 font-semibold">
                    Refreshing the next read in the background.
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-2 gap-y-1 rounded-xl bg-accent/5 border border-accent/20 px-3.5 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
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
                        href={`/game/${entry.game.gameId}`}
                        className="group flex items-center justify-between gap-4 p-4 transition-all duration-300 hover:bg-secondary/25 no-underline"
                      >
                        <div className="flex items-center gap-3.5 min-w-0">
                          <CoverArt
                            game={entry.game}
                            className="aspect-[3/4] w-11 shrink-0 rounded-sm shadow-md transition-transform duration-300 group-hover:scale-[1.03]"
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
