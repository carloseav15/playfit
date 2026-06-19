"use client";

import type { RankedSeedGame } from "@playfit/core/types";
import { ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { usePlayfit } from "../playfit/playfit-context";
import { StatusToast } from "../playfit/status-toast";
import type { AlreadyPlayedFeedback } from "./already-played-panel";
import { PicksDesktop } from "./desktop/picks-desktop";
import { PicksMobile } from "./mobile/picks-mobile";
import { PlayRouteTabs } from "./play-route-tabs";
import { useTodayRecommendations } from "./use-today-recommendations";

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
  return (
    <>
      <div className="hidden md:block">
        <PicksDesktop
          entry={entry}
          expandedId={expandedId}
          onToggleAlreadyPlayed={onToggleAlreadyPlayed}
          onCloseAlreadyPlayed={onCloseAlreadyPlayed}
          onAlreadyPlayed={onAlreadyPlayed}
          onNotForMe={onNotForMe}
          onRemove={onRemove}
        />
      </div>
      <div className="block md:hidden">
        <PicksMobile
          entry={entry}
          expandedId={expandedId}
          onToggleAlreadyPlayed={onToggleAlreadyPlayed}
          onCloseAlreadyPlayed={onCloseAlreadyPlayed}
          onAlreadyPlayed={onAlreadyPlayed}
          onNotForMe={onNotForMe}
          onRemove={onRemove}
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
