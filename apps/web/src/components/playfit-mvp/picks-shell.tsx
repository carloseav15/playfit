"use client";

import type { RankedSeedGame } from "@playfit/core/types";
import { ArrowLeft, CheckCircle2, Eye, MoreVertical, Trash2, XCircle } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { CoverArt } from "../playfit/cover-art";
import { usePlayfit } from "../playfit/playfit-context";
import { confidenceLabel } from "../playfit/product-utils";
import { StatusToast } from "../playfit/status-toast";
import { type AlreadyPlayedFeedback, AlreadyPlayedPanel } from "./already-played-panel";
import { PlayRouteTabs } from "./play-route-tabs";
import { RecommendationMetric } from "./recommendation-metric";
import { RecommendationReasonList } from "./recommendation-reasons";
import { useTodayRecommendations } from "./use-today-recommendations";

function ManagePickDialog({
  open,
  onClose,
  title,
  onAlreadyPlayed,
  onNotForMe,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  onAlreadyPlayed: () => void;
  onNotForMe: () => void;
  onRemove: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} eyebrow="Manage Pick" className="max-w-sm">
      <div className="grid gap-2 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onAlreadyPlayed();
            onClose();
          }}
          className="w-full h-12 rounded-xl text-xs font-bold justify-start px-4"
        >
          <CheckCircle2 className="size-4 mr-2.5 text-positive" />
          Already Played It
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onNotForMe();
            onClose();
          }}
          className="w-full h-12 rounded-xl text-xs font-bold justify-start px-4"
        >
          <XCircle className="size-4 mr-2.5 text-destructive" />
          No, skip this
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onRemove();
            onClose();
          }}
          className="w-full h-12 rounded-xl text-xs font-bold justify-start px-4 text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="size-4 mr-2.5" />
          Remove Pick
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="w-full h-12 rounded-xl text-xs font-bold mt-2"
        >
          Cancel
        </Button>
      </div>
    </Dialog>
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
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      {/* Desktop Card Layout */}
      <Card className="hidden md:block group relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all duration-300 hover:border-border/80 hover:shadow-md">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => onRemove(gameId)}
          className="absolute right-4 top-4 z-20 size-8 rounded-full border border-border/60 bg-secondary text-muted-foreground hover:bg-destructive/15 hover:text-destructive transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
          aria-label="Remove recommendation"
        >
          <Trash2 className="size-4" />
        </Button>

        <CardContent className="grid gap-5 p-6 md:grid-cols-[100px_minmax(0,1fr)]">
          <div className="flex flex-col items-center gap-2">
            <CoverArt
              game={entry.game}
              className="aspect-[2/3] w-24 rounded-sm shadow-md transition-transform duration-300 group-hover:scale-[1.02] border border-border/40"
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
                <h2 className="font-display text-3xl font-black leading-tight text-foreground">
                  {entry.game.title}
                </h2>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <RecommendationMetric
                label="Match"
                value={`${entry.affinityScore}%`}
                className="rounded-xl bg-secondary/20 px-0 py-2 text-center"
                labelClassName="text-[9px] tracking-wider"
                valueClassName="mt-0.5 text-sm"
              />
              <RecommendationMetric
                label="Watch-outs"
                value={`${entry.riskScore}%`}
                className="rounded-xl bg-secondary/20 px-0 py-2 text-center"
                labelClassName="text-[9px] tracking-wider"
                valueClassName="mt-0.5 text-sm"
              />
              <RecommendationMetric
                label="Confidence"
                value={confidenceLabel(entry.confidence)}
                className="rounded-xl bg-secondary/20 px-0 py-2 text-center"
                labelClassName="text-[9px] tracking-wider"
                valueClassName="mt-0.5 text-sm"
              />
            </div>
            <RecommendationReasonList
              reasons={entry.fitReasons}
              fallback="Playfit needs more feedback to explain this pick."
              maxItems={3}
              itemClassName="gap-2"
              markerClassName="mt-1.5"
            />

            <div className="flex flex-col gap-3.5 pt-3 border-t border-border/60">
              <div className="flex flex-wrap gap-2 items-center">
                <Button
                  type="button"
                  variant="secondary"
                  aria-expanded={expandedId === gameId}
                  aria-controls={alreadyPlayedPanelId}
                  onClick={onToggleAlreadyPlayed}
                  className="flex-1 border border-border/60 bg-secondary/50 hover:bg-secondary h-10 rounded-xl text-xs font-bold"
                >
                  <CheckCircle2 className="size-4 mr-1.5 text-positive" />
                  Already Played It
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => onNotForMe(gameId)}
                  className="flex-1 border border-border/60 bg-secondary/50 hover:bg-destructive-bg hover:text-destructive h-10 rounded-xl text-xs font-bold"
                >
                  <XCircle className="size-4 mr-1.5 text-destructive" />
                  No, skip this
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

      {/* Mobile Compact Row Layout */}
      <div className="flex md:hidden items-center justify-between p-3 bg-card border border-border rounded-2xl hover:border-border/80 transition-all gap-3 w-full min-w-0">
        <Link href={`/play/game/${gameId}`} className="flex items-center gap-3 min-w-0 flex-1">
          <CoverArt
            game={entry.game}
            className="aspect-[2/3] w-12 rounded-lg shadow-sm border border-border/40 shrink-0"
          />
          <div className="min-w-0">
            <h3 className="font-display text-base font-black text-foreground truncate leading-tight">
              {entry.game.title}
            </h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="text-[10px] font-extrabold text-accent">
                {entry.affinityScore}% Match
              </span>
            </div>
          </div>
        </Link>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setMenuOpen(true)}
          className="size-10 rounded-full shrink-0 text-muted-foreground hover:text-foreground hover:bg-secondary/40"
          aria-label="Manage pick"
        >
          <MoreVertical className="size-5" />
        </Button>

        <ManagePickDialog
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={entry.game.title}
          onAlreadyPlayed={onToggleAlreadyPlayed}
          onNotForMe={() => onNotForMe(gameId)}
          onRemove={() => onRemove(gameId)}
        />

        <AlreadyPlayedPanel
          id={alreadyPlayedPanelId}
          open={expandedId === gameId}
          onClose={onCloseAlreadyPlayed}
          onSelect={(feedback) => onAlreadyPlayed(gameId, feedback)}
        />
      </div>
    </>
  );
}

export function PicksShell() {
  const { applyDecisionFeedback, setPlayfitPick, state } = usePlayfit();
  const pathname = usePathname();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const profileReady = !!state.user.onboardingCompletedAt && !!state.user.profile;
  const { model, loading, loadError } = useTodayRecommendations({
    enabled: profileReady,
    profile: state.user.profile,
    gameStates: state.user.gameStates,
    onboarding: state.user.onboarding,
    errorMessage: "Playfit Picks could not be refreshed.",
    cacheScope: "picks",
  });

  if (!profileReady) {
    return (
      <div className="min-h-screen text-foreground relative flex items-center justify-center">
        <Container as="main" size="sm" className="py-8">
          <Card className="rounded-3xl border border-border bg-card shadow-lg p-6 text-center">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-2xl font-black">Set up your taste first</CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Select your platforms and a few favorite games so we can build your recommendations.
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
      className="relative"
    >
      <div className="pointer-events-none absolute left-1/4 top-1/4 size-[400px] rounded-full bg-accent/5 blur-[100px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 size-[350px] rounded-full bg-indigo-500/5 blur-[90px]" />

      <div className="min-h-[calc(100vh-4rem)] text-foreground">
        <Container as="main" size="md" className="flex flex-col gap-6 py-6 lg:py-8">
          <div className="hidden md:flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                asChild
                className="text-xs hover:text-foreground hover:bg-secondary h-11 px-3.5 rounded-xl shrink-0"
              >
                <Link href="/play" className="flex items-center">
                  <ArrowLeft className="size-4 mr-1.5" />
                  Back
                </Link>
              </Button>
              <h1 className="font-display text-lg sm:text-xl font-black tracking-tight text-foreground truncate">
                Saved Picks
              </h1>
            </div>
            <PlayRouteTabs
              pathname={pathname}
              tasteLabel="Your Taste"
              className="w-full sm:w-auto"
            />
          </div>

          {loadError ? (
            <Alert variant="warning" className="shrink-0">
              {loadError}
            </Alert>
          ) : null}

          <div className="flex flex-col gap-5">
            {picks.length === 0 ? (
              <Card className="rounded-3xl border border-border bg-card p-6 text-center">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className="text-xl font-bold">No saved picks yet</CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    Save recommendations here when they match your gaming criteria.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0 pt-4">
                  <Button
                    type="button"
                    asChild
                    className="bg-accent text-accent-foreground font-extrabold hover:bg-accent/90"
                  >
                    <Link href="/play">Find Recommendations</Link>
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
