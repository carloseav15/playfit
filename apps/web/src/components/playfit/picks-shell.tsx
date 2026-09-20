"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { redirectToMarketingLanding } from "@/lib/redirect-to-landing";
import { usePlayfitState } from "../playfit/playfit-context";
import { StatusToast } from "../playfit/status-toast";
import { PICKS_POSTER_GRID_CLASS_NAME, PicksPosterGrid } from "./picks-poster-grid";
import { usePicksRecommendations } from "./use-picks-recommendations";

const POSTER_SKELETON_KEYS = Array.from({ length: 12 }, (_, i) => `poster-skeleton-${i}`);

export function PicksShell() {
  const { state } = usePlayfitState();
  const profileReady = !!state.user.onboardingCompletedAt && !!state.user.profile;
  useEffect(() => {
    if (!profileReady) redirectToMarketingLanding();
  }, [profileReady]);

  const { picks, loading, refreshing, loadError, retry } = usePicksRecommendations({
    enabled: profileReady,
    stateVersion: state.stateVersion,
    profile: state.user.profile,
    gameStates: state.user.gameStates,
    errorMessage: "My Picks could not be refreshed.",
  });
  const [isRetrying, setIsRetrying] = useState(false);
  const handleRetry = useCallback(() => {
    setIsRetrying(true);
    Promise.resolve(retry()).finally(() => setIsRetrying(false));
  }, [retry]);

  if (!profileReady) {
    return null;
  }

  if (loading) {
    return (
      <Container as="main" size="lg" className="flex flex-col gap-6 py-6 lg:py-8">
        <div className="grid gap-2">
          <Skeleton className="h-9 w-40 rounded-xl" />
          <Skeleton className="h-5 w-56 rounded-lg" />
        </div>
        <div className={PICKS_POSTER_GRID_CLASS_NAME}>
          {POSTER_SKELETON_KEYS.map((key) => (
            <div key={key} className="grid gap-2.5">
              <Skeleton className="aspect-[3/4] w-full rounded-sm" />
              <Skeleton className="h-4 w-3/4 rounded-md" />
            </div>
          ))}
        </div>
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
      <div className="pointer-events-none absolute left-1/4 top-1/4 size-[400px] rounded-full bg-accent/5 blur-[100px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 size-[350px] rounded-full bg-indigo-500/5 blur-[90px]" />

      <div className="min-h-[calc(100vh-4rem)] text-foreground">
        <Container as="main" size="lg" className="flex flex-col gap-6 py-6 lg:py-8">
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight text-foreground">
              My Picks
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {picks.length > 0
                ? `${picks.length} saved ${picks.length === 1 ? "pick" : "picks"} · best match first`
                : "Games you save from Play Next show up here."}
            </p>
          </div>
          <p
            role="status"
            aria-live="polite"
            className="-mb-2 -mt-4 h-5 text-sm text-muted-foreground"
          >
            {refreshing ? "Updating picks…" : ""}
          </p>
          {loadError ? (
            <Alert
              variant="warning"
              className="shrink-0 flex flex-wrap items-center justify-between gap-3"
            >
              <span>{loadError}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleRetry}
                disabled={isRetrying}
              >
                {isRetrying ? "Retrying..." : "Try again"}
              </Button>
            </Alert>
          ) : null}

          <div className="flex flex-col gap-5">
            {picks.length === 0 ? (
              <Card className="rounded-3xl border border-border bg-card p-6 text-center">
                <CardHeader className="px-0 pt-0">
                  <CardTitle as="h2" className="text-xl font-bold">
                    Nothing saved yet
                  </CardTitle>
                  <CardDescription className="text-xs text-muted-foreground mt-1">
                    Save games from Play Next and they'll show up here, ranked by how well they fit
                    you.
                  </CardDescription>
                </CardHeader>
                <CardContent className="px-0 pb-0 pt-4">
                  <Button
                    type="button"
                    asChild
                    className="bg-accent text-accent-foreground font-extrabold hover:bg-accent/90"
                  >
                    <Link href="/">Find Recommendations</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <PicksPosterGrid picks={picks} />
            )}
          </div>
        </Container>
        <StatusToast />
      </div>
    </motion.div>
  );
}
