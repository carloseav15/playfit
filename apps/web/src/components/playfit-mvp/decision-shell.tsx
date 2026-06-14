"use client";

import type { ProductTodayModel, RankedSeedGame } from "@playfit/core/types";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { addGamesToCache } from "@/lib/game-cache";
import { OnboardingSection } from "../playfit/onboarding-section";
import { usePlayfit } from "../playfit/playfit-context";
import { recommendationGroupTitle } from "../playfit/product-utils";
import { StatusToast } from "../playfit/status-toast";
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
  const { setStatusMessage, state, applyDecisionFeedback } = usePlayfit();
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

  function handleFeedback(
    entry: RankedSeedGame,
    feedback: "play" | "later" | "loved" | "liked" | "mixed" | "not_for_me",
  ) {
    applyDecisionFeedback(entry.game.gameId, feedback);
    setSkippedIds((prev) => new Set([...prev, entry.game.gameId]));
  }

  function handleShowAnother(entry: RankedSeedGame) {
    setSkippedIds((prev) => new Set([...prev, entry.game.gameId]));
  }

  function handleReason(reason: string) {
    setStatusMessage(`Noted: ${reason.toLowerCase()}.`);
  }

  if (!profileReady) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Container as="main" size="sm" className="py-8">
          <OnboardingSection />
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
          <Alert variant="info">All current candidates were skipped in this session.</Alert>
        ) : null}
        <StatusToast />
      </Container>
    );
  }

  return (
    <Container as="main" size="sm" className="grid gap-6 py-8">
      <section>
        <CardTitle as="h2" className="text-center">
          {recommendationGroupTitle(model?.nextUp ?? [])}
        </CardTitle>
        <CardDescription className="mt-1 text-center">Find what to play next.</CardDescription>
      </section>

      <PlayNextCard
        entry={primary}
        primary
        onPlay={() => handleFeedback(primary, "play")}
        onLater={() => handleFeedback(primary, "later")}
        onNotForMe={() => handleFeedback(primary, "not_for_me")}
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
              onPlay={() => handleFeedback(entry, "play")}
              onLater={() => handleFeedback(entry, "later")}
              onNotForMe={() => handleFeedback(entry, "not_for_me")}
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
