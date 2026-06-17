"use client";

import type { ProductTodayModel, RankedSeedGame } from "@playfit/core/types";
import { ArrowLeft, CheckCircle2, Eye, Sparkles, Trash2, XCircle } from "lucide-react";
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
import { usePlayfit } from "../playfit/playfit-context";
import { confidenceLabel, formatGameDescriptor } from "../playfit/product-utils";
import { StatusToast } from "../playfit/status-toast";
import { type AlreadyPlayedFeedback, AlreadyPlayedPanel } from "./already-played-panel";

function ReasonList({ reasons }: { reasons: string[] }) {
  const visibleReasons = reasons.length
    ? reasons
    : ["Playfit needs more feedback to explain this pick."];

  return (
    <ul className="grid gap-2 text-xs text-muted-foreground/80">
      {visibleReasons.slice(0, 3).map((reason) => (
        <li key={reason} className="flex gap-2 items-start">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent animate-pulse" />
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
  onCloseAlreadyPlayed,
  onAlreadyPlayed,
  onNotForMe,
  onRemove,
}: {
  entry: RankedSeedGame;
  expandedId: string | null;
  onToggleAlreadyPlayed: () => void;
  onCloseAlreadyPlayed: () => void;
  onAlreadyPlayed: (gameId: string, feedback: AlreadyPlayedFeedback) => void;
  onNotForMe: (gameId: string) => void;
  onRemove: (gameId: string) => void;
}) {
  const gameId = entry.game.gameId;
  const alreadyPlayedPanelId = `pick-already-played-${gameId}`;

  return (
    <Card className="group relative overflow-hidden rounded-3xl border border-white/5 bg-card/40 backdrop-blur-md shadow-lg transition-all duration-300 hover:border-white/10 hover:shadow-xl">
      {/* Floating Remove Button */}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => onRemove(gameId)}
        className="absolute right-4 top-4 z-20 size-8 rounded-full border border-white/5 bg-secondary/30 text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-all md:opacity-0 md:group-hover:opacity-100 focus:opacity-100"
        aria-label="Remove recommendation"
      >
        <Trash2 className="size-4" />
      </Button>

      <CardContent className="grid gap-5 p-5 md:grid-cols-[100px_minmax(0,1fr)] md:p-6">
        {/* Cover Art and Details Link Column */}
        <div className="flex flex-col items-center gap-2">
          <CoverArt
            game={entry.game}
            className="aspect-[2/3] w-24 rounded-sm shadow-md transition-transform duration-300 group-hover:scale-[1.02] border border-white/5"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            asChild
            className="text-xs text-accent hover:text-accent/80 hover:bg-transparent h-auto p-0 mt-0.5"
          >
            <Link href={`/play/game/${gameId}`} className="flex items-center">
              <Eye className="size-3.5 mr-1" />
              See details
            </Link>
          </Button>
        </div>

        <div className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 pr-8">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                {formatGameDescriptor(entry.game)}
              </p>
              <h2 className="font-display text-2xl font-black leading-tight text-foreground mt-0.5">
                {entry.game.title}
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-xl border border-white/5 bg-secondary/20 py-2">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Match
              </span>
              <strong className="mt-0.5 block text-sm font-extrabold text-foreground">
                {entry.affinityScore}%
              </strong>
            </div>
            <div className="rounded-xl border border-white/5 bg-secondary/20 py-2">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Watch-outs
              </span>
              <strong className="mt-0.5 block text-sm font-extrabold text-foreground">
                {entry.riskScore}%
              </strong>
            </div>
            <div className="rounded-xl border border-white/5 bg-secondary/20 py-2">
              <span className="block text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                Confidence
              </span>
              <strong className="mt-0.5 block text-sm font-extrabold text-foreground">
                {confidenceLabel(entry.confidence)}
              </strong>
            </div>
          </div>
          <ReasonList reasons={entry.fitReasons} />

          <div className="flex flex-col gap-3.5 pt-3 border-t border-white/5">
            <div className="flex flex-wrap gap-2 items-center">
              <Button
                type="button"
                variant="secondary"
                aria-expanded={expandedId === gameId}
                aria-controls={alreadyPlayedPanelId}
                onClick={onToggleAlreadyPlayed}
                className="flex-1 border-white/5 bg-secondary/30 hover:bg-secondary/70 h-10 rounded-xl text-xs font-bold"
              >
                <CheckCircle2 className="size-4 mr-1.5 text-positive" />
                Already Played
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onNotForMe(gameId)}
                className="flex-1 border-white/5 bg-secondary/30 hover:bg-destructive-bg hover:text-destructive h-10 rounded-xl text-xs font-bold"
              >
                <XCircle className="size-4 mr-1.5 text-destructive" />
                Not for me
              </Button>
            </div>
          </div>
          <AlreadyPlayedPanel
            id={alreadyPlayedPanelId}
            open={expandedId === gameId}
            onClose={onCloseAlreadyPlayed}
            onSelect={(feedback) => onAlreadyPlayed(gameId, feedback)}
          />
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
    <Card className="relative overflow-hidden rounded-3xl border border-accent/20 bg-accent/[0.03] shadow-lg backdrop-blur-md">
      <div className="pointer-events-none absolute -right-12 -top-12 size-36 rounded-full bg-accent/5 blur-2xl" />
      <CardContent className="grid gap-4 p-5 md:grid-cols-[80px_minmax(0,1fr)] md:p-6">
        <CoverArt
          game={entry.game}
          className="aspect-[2/3] w-20 justify-self-center rounded-sm shadow-md border border-white/5"
        />
        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-accent animate-ping" />
                <span className="size-2 rounded-full bg-accent -ml-3.5" />
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-accent">
                  Active Run
                </p>
              </div>
              <h2 className="font-display text-xl font-extrabold leading-tight text-foreground mt-1">
                {entry.game.title}
              </h2>
            </div>
            <Badge
              variant="info"
              className="bg-accent/15 text-accent border border-accent/30 text-[10px] font-bold"
            >
              Currently Playing
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            You started this pick. How is the experience landing? Resolve it to train your taste.
          </p>

          <div className="flex flex-col gap-3 pt-2">
            <Stack direction="row" wrap gap={2} className="items-center">
              <Button
                type="button"
                onClick={() => setShowRating((prev) => !prev)}
                className="bg-accent text-accent-foreground font-extrabold hover:bg-accent/90 shadow-md h-9 text-xs rounded-xl"
              >
                <CheckCircle2 className="size-4 mr-1.5" />
                Complete & Rate Game
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onStop(gameId)}
                className="text-xs hover:text-foreground"
              >
                Stop Playing
              </Button>
            </Stack>
            <AlreadyPlayedPanel
              id={`playing-rate-${gameId}`}
              open={showRating}
              onClose={() => setShowRating(false)}
              onSelect={(feedback) => onAlreadyPlayed(gameId, feedback)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function PicksShell() {
  const { applyDecisionFeedback, setPlayfitPick, setPlayStatus, state } = usePlayfit();
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
      <div className="min-h-screen text-foreground relative flex items-center justify-center">
        <Container as="main" size="sm" className="py-8">
          <Card className="rounded-3xl border border-white/5 bg-card/65 backdrop-blur-md shadow-2xl p-6 text-center">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-2xl font-black">Tune your taste first</CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Pick your platforms and a few games so Playfit can build your picks.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0 pt-4">
              <Button
                type="button"
                asChild
                className="bg-accent text-accent-foreground font-extrabold hover:bg-accent/90"
              >
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
        <Skeleton className="h-8 w-52 rounded-xl" />
        <Skeleton className="h-6 w-96 rounded-lg" />
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-44 w-full rounded-2xl" />
      </Container>
    );
  }

  const picks = model?.picks ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="lg:h-[calc(100vh-4rem)] lg:overflow-hidden relative"
    >
      {/* Background glow effects */}
      <div className="pointer-events-none absolute left-1/4 top-1/4 size-[400px] rounded-full bg-accent/5 blur-[100px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 size-[350px] rounded-full bg-indigo-500/5 blur-[90px]" />

      <div className="min-h-[calc(100vh-4rem)] text-foreground lg:h-full lg:min-h-0 lg:overflow-hidden">
        <Container
          as="main"
          size="md"
          className="flex flex-col gap-6 py-6 lg:h-full lg:max-h-full lg:py-8 lg:overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            <Button
              type="button"
              variant="ghost"
              asChild
              className="text-xs hover:text-foreground hover:bg-white/5"
            >
              <Link href="/play" className="flex items-center">
                <ArrowLeft className="size-4 mr-1.5" />
                Back to Play Next Recommendation
              </Link>
            </Button>
            <div className="flex gap-1 bg-secondary/40 p-1 rounded-2xl border border-white/5">
              <Button
                type="button"
                variant={pathname === "/play/picks" ? "secondary" : "ghost"}
                asChild
                className="h-8 px-3.5 text-xs rounded-xl font-extrabold bg-card shadow-sm text-foreground"
              >
                <Link href="/play/picks">Picks</Link>
              </Button>
              <Button
                type="button"
                variant={pathname === "/play/taste" ? "secondary" : "ghost"}
                asChild
                className="h-8 px-3.5 text-xs rounded-xl font-extrabold text-muted-foreground hover:text-foreground hover:bg-white/5"
              >
                <Link href="/play/taste">Your Taste</Link>
              </Button>
            </div>
          </div>

          <section className="relative overflow-hidden grid gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-card/85 to-card/60 p-6 shadow-xl backdrop-blur-md shrink-0">
            <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-accent/10 blur-xl" />
            <div className="grid gap-2 relative z-10">
              <div className="flex items-center gap-2 text-accent">
                <Sparkles className="size-4" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em]">
                  Saved Queue
                </span>
              </div>
              <h1 className="font-display text-4xl font-black tracking-tight text-foreground mt-1">
                Saved Recommendations
              </h1>
              <p className="max-w-2xl text-xs text-muted-foreground leading-relaxed mt-0.5">
                Your personal queue of saved game recommendations.
              </p>
            </div>
          </section>

          {loadError ? (
            <Alert variant="warning" className="shrink-0">
              {loadError}
            </Alert>
          ) : null}

          {/* Scrollable list container on desktop */}
          <div className="flex flex-col gap-5 lg:flex-1 lg:overflow-y-auto lg:pr-2">
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
              <Card className="rounded-3xl border border-white/5 bg-card/45 backdrop-blur-sm p-6 text-center">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="text-xl font-bold">No saved recommendations yet</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    Add a recommendation from Play Next when it matches your gaming criteria.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0 pt-4">
                  <Button
                    type="button"
                    asChild
                    className="bg-accent text-accent-foreground font-extrabold hover:bg-accent/90"
                  >
                    <Link href="/play">Go Find Recommendations</Link>
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
                    onToggleAlreadyPlayed={() =>
                      setExpandedId((current) =>
                        current === entry.game.gameId ? null : entry.game.gameId,
                      )
                    }
                    onCloseAlreadyPlayed={() => setExpandedId(null)}
                    onAlreadyPlayed={(gameId, feedback) => {
                      applyDecisionFeedback(gameId, feedback);
                      setExpandedId(null);
                    }}
                    onNotForMe={(gameId) => applyDecisionFeedback(gameId, "not_for_me")}
                    onRemove={(gameId) => setPlayfitPick(gameId, false)}
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
