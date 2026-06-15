"use client";

import type { ProductTodayModel, RankedSeedGame } from "@playfit/core/types";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  ListChecks,
  Play,
  SlidersHorizontal,
  Trash2,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack } from "@/components/ui/stack";
import { addGamesToCache } from "@/lib/game-cache";
import { CoverArt } from "../playfit/cover-art";
import { Metric } from "../playfit/metric";
import { usePlayfit } from "../playfit/playfit-context";
import { confidenceLabel, formatGameDescriptor } from "../playfit/product-utils";
import { StatusToast } from "../playfit/status-toast";
import { type AlreadyPlayedFeedback, AlreadyPlayedPanel } from "./already-played-panel";

function ReasonList({ reasons }: { reasons: string[] }) {
  const visibleReasons = reasons.length
    ? reasons
    : ["Playfit needs more feedback to explain this pick."];

  return (
    <ul className="grid gap-1.5 text-sm text-muted-foreground">
      {visibleReasons.slice(0, 3).map((reason) => (
        <li key={reason} className="flex gap-2">
          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current" />
          <span>{reason}</span>
        </li>
      ))}
    </ul>
  );
}

function PickCard({
  entry,
  expandedId,
  onToggleAlreadyPlayed,
  onAlreadyPlayed,
  onNotForMe,
  onRemove,
  onStarted,
}: {
  entry: RankedSeedGame;
  expandedId: string | null;
  onToggleAlreadyPlayed: (gameId: string) => void;
  onAlreadyPlayed: (gameId: string, feedback: AlreadyPlayedFeedback) => void;
  onNotForMe: (gameId: string) => void;
  onRemove: (gameId: string) => void;
  onStarted: (gameId: string) => void;
}) {
  const gameId = entry.game.gameId;

  return (
    <Card className="overflow-hidden">
      <CardContent className="grid gap-4 p-4 md:grid-cols-[96px_minmax(0,1fr)] md:p-5">
        <CoverArt game={entry.game} className="aspect-[2/3] w-28 justify-self-center md:w-full" />
        <div className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {formatGameDescriptor(entry.game)}
              </p>
              <h2 className="font-display text-2xl font-extrabold leading-tight">
                {entry.game.title}
              </h2>
            </div>
            <Badge variant="positive">Playfit Pick</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Metric label="Match" value={entry.affinityScore} />
            <Metric label="Watch-outs" value={entry.riskScore} />
            <Metric label="Confidence" value={confidenceLabel(entry.confidence)} />
          </div>
          <ReasonList reasons={entry.fitReasons} />
          <Stack direction="row" wrap gap={2}>
            <Button type="button" onClick={() => onStarted(gameId)}>
              <Play className="size-4" />
              Started
            </Button>
            <Button type="button" variant="secondary" onClick={() => onToggleAlreadyPlayed(gameId)}>
              <CheckCircle2 className="size-4" />
              Already played
            </Button>
            <Button type="button" variant="secondary" onClick={() => onNotForMe(gameId)}>
              <XCircle className="size-4" />
              Not for me
            </Button>
            <Button type="button" variant="secondary" onClick={() => onRemove(gameId)}>
              <Trash2 className="size-4" />
              Remove
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link href={`/play/game/${gameId}`}>
                <Eye className="size-4" />
                See why
              </Link>
            </Button>
          </Stack>
          {expandedId === gameId ? (
            <AlreadyPlayedPanel onSelect={(feedback) => onAlreadyPlayed(gameId, feedback)} />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function PicksShell() {
  const { applyDecisionFeedback, setPlayfitPick, startPlayfitPick, state } = usePlayfit();
  const [model, setModel] = useState<ProductTodayModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const profileReady = !!state.user.onboardingCompletedAt && !!state.user.profile;

  useEffect(() => {
    if (!profileReady || !state.user.profile) {
      setModel(null);
      setLoadError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchPicks() {
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
          throw new Error("Playfit Picks could not be refreshed.");
        }
        const data = (await res.json()) as ProductTodayModel;
        if (!cancelled) {
          addGamesToCache(data.picks.map((entry) => entry.game));
          setModel(data);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Playfit Picks could not be refreshed.",
          );
          setModel(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchPicks();
    return () => {
      cancelled = true;
    };
  }, [profileReady, state.user.profile, state.user.gameStates, state.user.onboarding]);

  if (!profileReady) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <Container as="main" size="sm" className="grid min-h-screen place-items-center py-8">
          <Card>
            <CardHeader>
              <CardTitle>Tune your taste first</CardTitle>
              <CardDescription>
                Pick your platforms and a few games so Playfit can build your picks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" asChild>
                <Link href="/play">Start Play Next</Link>
              </Button>
            </CardContent>
          </Card>
        </Container>
      </div>
    );
  }

  if (loading) {
    return (
      <Container as="main" size="md" className="grid gap-4 py-8">
        <Skeleton className="h-8 w-52" />
        <Skeleton className="h-6 w-96" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </Container>
    );
  }

  const picks = model?.picks ?? [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Container as="main" size="md" className="grid gap-6 py-6 md:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="ghost" asChild>
            <Link href="/play">
              <ArrowLeft className="size-4" />
              Back to Play Next
            </Link>
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link href="/play/taste">
              <SlidersHorizontal className="size-4" />
              Your Taste
            </Link>
          </Button>
        </div>
        <section className="grid gap-2">
          <div className="flex items-center gap-2">
            <ListChecks className="size-5 text-muted-foreground" />
            <h1 className="font-display text-4xl font-extrabold leading-tight">Playfit Picks</h1>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Games Playfit thinks are worth your time next.
          </p>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Sorted by current fit, not by the order you saved them.
          </p>
        </section>
        {loadError ? <Alert variant="warning">{loadError}</Alert> : null}
        {picks.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No Playfit Picks yet</CardTitle>
              <CardDescription>
                Add a recommendation from Play Next when it looks worth your time.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" asChild>
                <Link href="/play">Find Play Next</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <section className="grid gap-3">
            {picks.map((entry) => (
              <PickCard
                key={entry.game.gameId}
                entry={entry}
                expandedId={expandedId}
                onToggleAlreadyPlayed={(gameId) =>
                  setExpandedId((current) => (current === gameId ? null : gameId))
                }
                onAlreadyPlayed={(gameId, feedback) => {
                  applyDecisionFeedback(gameId, feedback);
                  setExpandedId(null);
                }}
                onNotForMe={(gameId) => applyDecisionFeedback(gameId, "not_for_me")}
                onRemove={(gameId) => setPlayfitPick(gameId, false)}
                onStarted={(gameId) => startPlayfitPick(gameId)}
              />
            ))}
          </section>
        )}
      </Container>
      <StatusToast />
    </div>
  );
}
