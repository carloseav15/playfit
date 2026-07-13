"use client";

import { buildTasteModel } from "@playfit/core/domain";
import { Layers, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { ensureGamesCached } from "@/lib/game-cache";
import { useHeader } from "../playfit/header-context";
import { usePlayfit } from "../playfit/playfit-context";
import { StatusToast } from "../playfit/status-toast";

import { TasteDesktop } from "./desktop/taste-desktop";
import { TasteMobile } from "./mobile/taste-mobile";
import {
  buildHistoryAndActivityEntries,
  getMissingGameIds,
  getSeedGamesById,
  getTasteGameIds,
} from "./taste-model";
import { useTodayRecommendations } from "./use-today-recommendations";

export { PlatformsTabContent } from "./platforms-tab-content";

export function TasteShell() {
  const { state, getSeedGame, applyDecisionFeedback, removeTasteSignal, setPlayfitPick } =
    usePlayfit();
  const [, setCacheVersion] = useState(0);
  const [hydrating, setHydrating] = useState(false);
  const [hydratedOnce, setHydratedOnce] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<"taste" | "activity">("taste");
  const [mapView, setMapView] = useState<"visual" | "list">("visual");
  const [subView, setSubView] = useState<"menu" | "map" | "list" | "activity">("menu");

  useHeader(
    subView === "map"
      ? { title: "Affinity Map", onBack: () => setSubView("menu") }
      : subView === "list"
        ? { title: "Traits List", onBack: () => setSubView("menu") }
        : subView === "activity"
          ? { title: "Activity", onBack: () => setSubView("menu") }
          : {},
    [subView],
  );
  const profile = state.user.profile;
  const requiredIds = useMemo(() => getTasteGameIds(state), [state]);
  const gamesById = getSeedGamesById(requiredIds, getSeedGame);
  const missingIds = getMissingGameIds(requiredIds, gamesById);
  const missingKey = missingIds.join("|");
  const model = useMemo(
    () => buildTasteModel(state.user.onboarding, state.user.gameStates, gamesById, profile),
    [state.user.onboarding, state.user.gameStates, gamesById, profile],
  );
  const belowCalibration =
    state.user.onboarding.likedGameIds.length < 3 ||
    (state.user.onboarding.dislikedGameIds ?? []).length < 1;

  const profileReady = !!state.user.onboardingCompletedAt && !!profile;
  const { model: recsModel } = useTodayRecommendations({
    enabled: profileReady,
    profile,
    gameStates: state.user.gameStates,
    onboarding: state.user.onboarding,
    errorMessage: "Recommendations could not be loaded for the map.",
    cacheScope: "decision",
  });

  useEffect(() => {
    if (!missingKey) {
      setHydrating(false);
      return;
    }

    let cancelled = false;
    setHydrating(true);
    const idsToFetch = missingKey.split("|").filter(Boolean);
    void ensureGamesCached(idsToFetch).finally(() => {
      if (cancelled) return;
      setCacheVersion((current) => current + 1);
      setHydratedOnce(true);
      setHydrating(false);
    });

    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  const historyAndActivityEntries = useMemo(
    () =>
      buildHistoryAndActivityEntries({
        gameStates: state.user.gameStates,
        historyEntries: model.historyEntries,
        gamesById,
      }),
    [state.user.gameStates, model.historyEntries, gamesById],
  );

  const recs = useMemo(() => {
    if (!recsModel) return [];
    return recsModel.nextUp;
  }, [recsModel]);

  if (!profile) {
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
                <Link href="/">Start Play Next</Link>
              </Button>
            </CardContent>
          </Card>
        </Container>
      </div>
    );
  }

  if (hydrating || (missingIds.length > 0 && !hydratedOnce)) {
    return (
      <Container as="main" size="md" className="grid gap-4 py-8">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-6 w-96 rounded-lg" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </Container>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative min-h-screen text-foreground w-full"
    >
      <div className="pointer-events-none absolute left-1/4 top-1/4 size-[400px] rounded-full bg-accent/5 blur-[100px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 size-[350px] rounded-full bg-indigo-500/5 blur-[90px]" />

      <div className="w-full">
        <Container as="main" size="md" className="flex flex-col gap-6 py-6 lg:py-8">
          <div className="hidden md:flex items-center justify-end gap-2 shrink-0">
            <Badge
              variant="info"
              className="bg-accent/10 text-accent border border-accent/30 text-[10px] font-bold py-1 px-3"
            >
              Based on {model.evidenceCount} preferences
            </Badge>
          </div>

          <section className="hidden md:grid relative overflow-hidden gap-4 rounded-3xl border border-border bg-card p-6 shadow-md md:grid-cols-[minmax(0,1.15fr)_minmax(250px,0.85fr)] md:items-end shrink-0">
            <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-accent/10 blur-xl" />
            <div className="grid gap-2 relative z-10">
              <div className="flex items-center gap-2 text-accent">
                <Layers className="size-4" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em]">
                  Gaming profile
                </span>
              </div>
              <h1 className="font-display text-4xl font-black tracking-tight text-foreground mt-1">
                Your Taste
              </h1>
              <p className="max-w-2xl text-xs text-muted-foreground leading-relaxed mt-0.5">
                What Playfit is learning from your active decisions. {model.confidenceLabel}.
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-secondary/50 p-4 relative z-10">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-accent flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" />
                Profile Summary
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {model.positiveCount > model.negativeCount
                  ? "Playfit leans toward your favorites, but still needs more signals to sharpen the edge cases."
                  : "Playfit is still balancing your likes and misses; a few more decisions will make the next pick steadier."}
              </p>
            </div>
          </section>

          {belowCalibration || missingIds.length > 0 ? (
            <Alert variant="warning" className="shrink-0">
              {belowCalibration && missingIds.length > 0
                ? "Add at least 3 liked games and 1 missed game to refine your recommendations. (Also, some older signals could not be loaded.)"
                : belowCalibration
                  ? "Add at least 3 liked games and 1 missed game to refine your recommendations."
                  : "Some older signals could not be loaded."}
            </Alert>
          ) : null}

          {/* Mobile sub-views layout */}
          <TasteMobile
            model={model}
            historyAndActivityEntries={historyAndActivityEntries}
            gamesById={gamesById}
            gameStates={state.user.gameStates}
            recs={recs}
            subView={subView}
            setSubView={setSubView}
            changingId={changingId}
            setChangingId={setChangingId}
            applyDecisionFeedback={applyDecisionFeedback}
            setPlayfitPick={setPlayfitPick}
            removeTasteSignal={removeTasteSignal}
          />

          {/* Desktop layout */}
          <TasteDesktop
            model={model}
            historyAndActivityEntries={historyAndActivityEntries}
            gamesById={gamesById}
            gameStates={state.user.gameStates}
            recs={recs}
            activeMainTab={activeMainTab}
            setActiveMainTab={setActiveMainTab}
            mapView={mapView}
            setMapView={setMapView}
            changingId={changingId}
            setChangingId={setChangingId}
            applyDecisionFeedback={applyDecisionFeedback}
            setPlayfitPick={setPlayfitPick}
            removeTasteSignal={removeTasteSignal}
          />
        </Container>
        <StatusToast />
      </div>
    </motion.div>
  );
}
