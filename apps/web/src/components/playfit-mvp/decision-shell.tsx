"use client";

import type {
  ProductDecisionFeedback,
  ProductTodayModel,
  RankedSeedGame,
} from "@playfit/core/types";
import { ChevronRight, ListChecks, SlidersHorizontal } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { addGamesToCache } from "@/lib/game-cache";
import { CoverArt } from "../playfit/cover-art";
import { OnboardingSection } from "../playfit/onboarding-section";
import { usePlayfit } from "../playfit/playfit-context";
import { formatGameDescriptor, recommendationGroupTitle } from "../playfit/product-utils";
import { StatusToast } from "../playfit/status-toast";
import { DecisionIntro } from "./decision-intro";
import { PlayNextCard } from "./play-next-card";

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
  const [model, setModel] = useState<ProductTodayModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [slowLoading, setSlowLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [startedCalibration, setStartedCalibration] = useState(false);
  const profileReady = !!state.user.onboardingCompletedAt && !!state.user.profile;

  useEffect(() => {
    if (!profileReady || !state.user.profile) {
      setModel(null);
      setLoadError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function fetchToday() {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/recommendations/today", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: state.user.profile,
            gameStates: state.user.gameStates,
            onboarding: state.user.onboarding,
          }),
        });
        if (!res.ok) {
          throw new Error("Play Next could not be refreshed.");
        }
        if (!cancelled && res.ok) {
          const data = (await res.json()) as ProductTodayModel;
          addGamesToCache(
            [...data.nextUp, ...data.resume, ...data.currentRun].map((entry) => entry.game),
          );
          setModel(data);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Play Next could not be refreshed.",
          );
          setModel(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchToday();
    return () => {
      cancelled = true;
    };
  }, [profileReady, state.user.profile, state.user.gameStates, state.user.onboarding]);

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
      <div className="min-h-screen bg-background text-foreground">
        <Container as="main" size="sm" className="grid gap-6 py-6 md:py-8">
          {!startedCalibration ? (
            <DecisionIntro onStart={() => setStartedCalibration(true)} />
          ) : (
            <div id="tune-your-taste">
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
      <Container as="main" size="sm" className="grid gap-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Building your Play Next</CardTitle>
            <CardDescription>
              Checking your platforms, taste signals, and already-resolved games.
            </CardDescription>
          </CardHeader>
        </Card>
        {slowLoading ? (
          <Alert variant="info" aria-live="polite">
            Still working through the catalog. Your current signals are safe.
          </Alert>
        ) : null}
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-24 w-full" />
      </Container>
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
            <CardTitle>No Play Next candidate yet</CardTitle>
            <CardDescription>
              Playfit needs a broader platform set or a few more taste signals before it can make a
              useful recommendation.
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
      className="lg:h-screen lg:overflow-hidden"
    >
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(94,128,255,0.08),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_38%)] text-foreground lg:h-full lg:min-h-0 lg:overflow-hidden">
        <Container
          as="main"
          size="lg"
          className="grid gap-6 py-6 lg:h-full lg:max-h-full lg:grid-cols-[1.15fr_0.85fr] lg:gap-8 lg:py-8 lg:overflow-hidden"
        >
          {/* LEFT COLUMN: Primary Card (Centered, Fixed) */}
          <div className="flex flex-col justify-center min-w-0 lg:h-full lg:overflow-hidden">
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

          {/* RIGHT COLUMN: Nav, Signals, and Scrollable Alternatives */}
          <div className="flex flex-col gap-6 min-w-0 lg:h-full lg:overflow-y-auto lg:pr-2">
            <section className="grid gap-3">
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant={pathname === "/play/picks" ? "secondary" : "ghost"}
                  asChild
                >
                  <Link href="/play/picks">
                    <ListChecks className="size-4" />
                    Picks {picksCount ? `(${picksCount})` : ""}
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant={pathname === "/play/taste" ? "secondary" : "ghost"}
                  asChild
                >
                  <Link href="/play/taste">
                    <SlidersHorizontal className="size-4" />
                    Taste
                  </Link>
                </Button>
              </div>
              <div className="grid justify-items-center gap-1">
                <CardTitle as="h2" className="text-center text-balance">
                  {recommendationGroupTitle(model?.nextUp ?? [])}
                </CardTitle>
                <CardDescription className="max-w-2xl text-center text-xs">
                  Find what to play next, save promising picks, and keep the reasons visible. Only
                  active platform games are suggested.
                </CardDescription>
              </div>
              <div className="mx-auto flex w-fit flex-wrap items-center justify-center gap-2 rounded-full border border-border bg-card/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                <span>{tasteSignalCount} taste signals</span>
                <span aria-hidden="true">/</span>
                <span>{positiveSignalCount} lean toward</span>
                <span aria-hidden="true">/</span>
                <span>{negativeSignalCount} steer away</span>
              </div>
            </section>

            {alternatives.length > 0 && (
              <section className="grid gap-3">
                <div>
                  <CardTitle as="h3" className="text-sm font-bold">
                    Also worth considering
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Shortlist only. Open a dossier when one needs more explanation.
                  </CardDescription>
                </div>
                <div className="grid gap-3">
                  {alternatives.map((entry) => (
                    <Card
                      key={entry.game.gameId}
                      className="overflow-hidden rounded-2xl border-border/80 bg-card/70 shadow-sm"
                    >
                      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-3 sm:flex-nowrap">
                        <div className="flex items-center gap-3 min-w-0">
                          <CoverArt game={entry.game} className="aspect-[2/3] w-12 shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground truncate">
                              {formatGameDescriptor(entry.game)}
                            </p>
                            <h3 className="font-display text-base font-extrabold leading-tight text-foreground truncate">
                              {entry.game.title}
                            </h3>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0 ml-auto sm:ml-0">
                          <Badge variant="secondary">{entry.affinityScore}% Match</Badge>
                          <Button type="button" variant="ghost" size="sm" asChild>
                            <Link href={`/play/game/${entry.game.gameId}`}>
                              See why
                              <ChevronRight className="size-4" />
                            </Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </div>
          <StatusToast />
        </Container>
      </div>
    </motion.div>
  );
}
