"use client";

import type { ProductTodayModel, RankedSeedGame } from "@playfit/core/types";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  Play,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const alreadyPlayedPanelId = `pick-already-played-${gameId}`;

  return (
    <Card className="overflow-hidden rounded-3xl border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),transparent)] shadow-sm">
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
            <Badge variant="positive">Saved pick</Badge>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Metric label="Match" value={entry.affinityScore} />
            <Metric label="Watch-outs" value={entry.riskScore} />
            <Metric label="Confidence" value={confidenceLabel(entry.confidence)} />
          </div>
          <ReasonList reasons={entry.fitReasons} />
          <Stack direction="row" wrap gap={2} className="items-center">
            <Button type="button" onClick={() => onStarted(gameId)} className="shadow-sm">
              <Play className="size-4" />
              Started
            </Button>
            <Button
              type="button"
              variant="secondary"
              aria-expanded={expandedId === gameId}
              aria-controls={alreadyPlayedPanelId}
              onClick={() => onToggleAlreadyPlayed(gameId)}
            >
              <CheckCircle2 className="size-4" />
              Already played
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onNotForMe(gameId)}
              className="hover:bg-destructive/10 hover:text-destructive"
            >
              <XCircle className="size-4" />
              Not for me
            </Button>
            <Button type="button" variant="ghost" onClick={() => onRemove(gameId)}>
              <Trash2 className="size-4" />
              Remove
            </Button>
            <Button type="button" variant="ghost" size="sm" asChild>
              <Link href={`/play/game/${gameId}`}>
                <Eye className="size-4" />
                See why
              </Link>
            </Button>
          </Stack>
          {expandedId === gameId ? (
            <AlreadyPlayedPanel
              id={alreadyPlayedPanelId}
              onSelect={(feedback) => onAlreadyPlayed(gameId, feedback)}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function PlayingCard({
  entry,
  onAlreadyPlayed,
  onStop,
}: {
  entry: RankedSeedGame;
  onAlreadyPlayed: (gameId: string, feedback: AlreadyPlayedFeedback) => void;
  onStop: (gameId: string) => void;
}) {
  const [showRating, setShowRating] = useState(false);
  const gameId = entry.game.gameId;

  return (
    <Card className="overflow-hidden rounded-3xl border-accent/20 bg-accent/5 shadow-md">
      <CardContent className="grid gap-4 p-4 md:grid-cols-[80px_minmax(0,1fr)] md:p-5">
        <CoverArt game={entry.game} className="aspect-[2/3] w-20 justify-self-center" />
        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-accent">
                Playing Now
              </p>
              <h2 className="font-display text-xl font-extrabold leading-tight">
                {entry.game.title}
              </h2>
            </div>
            <Badge variant="info">Active run</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            You started this pick. How is the experience landing? Resolve it to train your taste.
          </p>
          <Stack direction="row" wrap gap={2} className="items-center">
            <Button
              type="button"
              onClick={() => setShowRating((prev) => !prev)}
              className="shadow-sm"
            >
              <CheckCircle2 className="size-4" />
              Complete / Rate
            </Button>
            <Button type="button" variant="ghost" onClick={() => onStop(gameId)}>
              Stop playing
            </Button>
          </Stack>
          {showRating ? (
            <AlreadyPlayedPanel
              id={`playing-rate-${gameId}`}
              onSelect={(feedback) => onAlreadyPlayed(gameId, feedback)}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function PicksShell() {
  const { applyDecisionFeedback, setPlayfitPick, startPlayfitPick, setPlayStatus, state } =
    usePlayfit();
  const pathname = usePathname();
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
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="lg:h-screen lg:overflow-hidden"
    >
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(94,128,255,0.1),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_34%)] text-foreground lg:h-full lg:min-h-0 lg:overflow-hidden">
        <Container
          as="main"
          size="md"
          className="flex flex-col gap-6 py-6 lg:h-full lg:max-h-full lg:py-8 lg:overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            <Button type="button" variant="ghost" asChild>
              <Link href="/play">
                <ArrowLeft className="size-4" />
                Back to Play Next
              </Link>
            </Button>
            <Button
              type="button"
              variant={pathname === "/play/taste" ? "secondary" : "ghost"}
              asChild
            >
              <Link href="/play/taste">
                <SlidersHorizontal className="size-4" />
                Your Taste
              </Link>
            </Button>
          </div>

          <section className="grid gap-4 rounded-3xl border border-border bg-card/80 p-6 shadow-sm md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:items-end shrink-0">
            <div className="grid gap-2">
              <Sparkles className="size-5 text-accent" />
              <h1 className="font-display text-4xl font-extrabold leading-tight">Playfit Picks</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                Games Playfit thinks are worth your time next.
              </p>
            </div>
            <div className="flex justify-start md:justify-end">
              <p className="max-w-xs text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Sorted by current fit, not by the order you saved them.
              </p>
            </div>
          </section>

          {loadError ? (
            <Alert variant="warning" className="shrink-0">
              {loadError}
            </Alert>
          ) : null}

          {/* Scrollable list container on desktop */}
          <div className="flex flex-col gap-4 lg:flex-1 lg:overflow-y-auto lg:pr-2">
            {model?.currentRun && model.currentRun.length > 0 ? (
              <div className="grid gap-3 shrink-0 pb-2">
                {model.currentRun.map((entry) => (
                  <PlayingCard
                    key={entry.game.gameId}
                    entry={entry}
                    onAlreadyPlayed={(gameId, feedback) => {
                      applyDecisionFeedback(gameId, feedback);
                    }}
                    onStop={(gameId) => {
                      setPlayStatus(gameId, undefined);
                    }}
                  />
                ))}
              </div>
            ) : null}

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
              <section className="grid gap-4 pb-4">
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
          </div>
        </Container>
        <StatusToast />
      </div>
    </motion.div>
  );
}
