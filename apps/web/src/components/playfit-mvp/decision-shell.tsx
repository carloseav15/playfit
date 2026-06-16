"use client";

import type {
  ProductDecisionFeedback,
  ProductTodayModel,
  RankedSeedGame,
} from "@playfit/core/types";
import { ListChecks, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { addGamesToCache } from "@/lib/game-cache";
import { OnboardingSection } from "../playfit/onboarding-section";
import { usePlayfit } from "../playfit/playfit-context";
import { recommendationGroupTitle } from "../playfit/product-utils";
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
  const [skippedIds, setSkippedIds] = useState<Set<string>>(() => new Set());
  const [model, setModel] = useState<ProductTodayModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  if (!profileReady) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Container as="main" size="sm" className="grid gap-6 py-6 md:py-8">
          <DecisionIntro />
          <div id="tune-your-taste">
            <OnboardingSection />
          </div>
        </Container>
        <StatusToast />
      </div>
    );
  }

  if (loading) {
    return (
      <Container as="main" size="sm" className="grid gap-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-6 w-96" />
        <Skeleton className="h-64 w-full" />
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
            <CardTitle>No more candidates</CardTitle>
            <CardDescription>
              Add more games to your library to find your next play.
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
    <Container as="main" size="sm" className="grid gap-6 py-8">
      <section className="grid gap-3">
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" asChild>
            <Link href="/play/picks">
              <ListChecks className="size-4" />
              Picks {picksCount ? `(${picksCount})` : ""}
            </Link>
          </Button>
          <Button type="button" variant="ghost" asChild>
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
          <CardDescription className="max-w-2xl text-center">
            Find what to play next, save promising picks, and keep the reasons visible.
          </CardDescription>
        </div>
      </section>

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

      {alternatives.length > 0 && (
        <section className="grid gap-3">
          <CardTitle as="h2" className="text-sm">
            Also worth considering
          </CardTitle>
          {alternatives.map((entry) => (
            <PlayNextCard
              key={entry.game.gameId}
              entry={entry}
              inPlayfitPicks={entry.inPlayfitPicks}
              onAddPick={() => handleAddPick(entry)}
              onNotForMe={() => handleFeedback(entry, "not_for_me")}
              onAlreadyPlayed={(feedback) => handleFeedback(entry, feedback)}
              onShowAnother={() => handleShowAnother(entry)}
              onReason={handleReason}
            />
          ))}
        </section>
      )}
      <StatusToast />
    </Container>
  );
}
