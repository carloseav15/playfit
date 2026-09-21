"use client";

import { buildTasteModel } from "@playfit/core/domain";
import type { ProductTasteMapTrait } from "@playfit/core/types";
import { motion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { ensureGamesCached } from "@/lib/game-cache";
import { redirectToMarketingLanding } from "@/lib/redirect-to-landing";
import { useHeader } from "../playfit/header-context";
import { usePlayfitState } from "../playfit/playfit-context";
import { StatusToast } from "../playfit/status-toast";

import { TasteDesktop } from "./desktop/taste-desktop";
import { TasteMobile } from "./mobile/taste-mobile";
import type { TasteSection } from "./taste/taste-sections";
import {
  buildHistoryAndActivityEntries,
  getMissingGameIds,
  getSeedGamesById,
  getTasteGameIds,
} from "./taste-model";
import { useTodayRecommendations } from "./use-today-recommendations";

export { PlatformsTabContent } from "./platforms-tab-content";

export function TasteShell({ section = "dna" }: { section?: TasteSection }) {
  const { state, getSeedGame, applyDecisionFeedback, removeTasteSignal, setPlayfitPick } =
    usePlayfitState();
  const [cacheVersion, setCacheVersion] = useState(0);
  const [hydrating, setHydrating] = useState(false);
  const [hydratedOnce, setHydratedOnce] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [subView, setSubView] = useState<"menu" | "map" | "list" | "activity">("menu");
  const [traitFilter, setTraitFilter] = useState<{ id: string; label: string } | null>(null);

  // Jumping here from a trait pill in the Taste DNA view -- filter Activity down to the
  // games that actually contributed to that trait, instead of leaving the reader to
  // guess which entry in a long history list is the one responsible.
  const handleSelectTrait = useCallback((trait: ProductTasteMapTrait) => {
    setTraitFilter({ id: trait.id, label: trait.label });
    setSubView("activity");
  }, []);
  const handleClearTraitFilter = useCallback(() => setTraitFilter(null), []);

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
  // requiredIds gets a new array identity on every state change (even ones
  // unrelated to which games are tracked), and cacheVersion is the explicit
  // signal that ensureGamesCached() populated new entries. Recomputing on
  // every render (unmemoized) forced a full affinity-map + model rebuild on
  // every unrelated re-render (e.g. switching the mobile subView).
  // biome-ignore lint/correctness/useExhaustiveDependencies: cacheVersion isn't read in the body, but its bump is the signal that getSeedGame's underlying cache gained entries and gamesById must be re-derived.
  const gamesById = useMemo(
    () => getSeedGamesById(requiredIds, getSeedGame),
    [requiredIds, getSeedGame, cacheVersion],
  );
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
  const {
    model: recsModel,
    loadError: recsLoadError,
    retry: retryRecs,
  } = useTodayRecommendations({
    enabled: profileReady && (requiredIds.length > 0 || !!profile?.ratedCount),
    profile,
    gameStates: state.user.gameStates,
    onboarding: state.user.onboarding,
    errorMessage: "Recommendations could not be loaded for the map.",
    cacheScope: "decision",
  });
  const [isRetryingRecs, setIsRetryingRecs] = useState(false);
  const handleRetryRecs = useCallback(() => {
    setIsRetryingRecs(true);
    Promise.resolve(retryRecs()).finally(() => setIsRetryingRecs(false));
  }, [retryRecs]);

  useEffect(() => {
    if (!profileReady) redirectToMarketingLanding();
  }, [profileReady]);

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

  if (!profileReady) {
    return null;
  }

  if (requiredIds.length === 0 && model.evidenceCount === 0 && !profile?.ratedCount) {
    return (
      <Container as="main" size="md" className="grid gap-4 py-8">
        <h1 className="font-display text-3xl font-bold">Your Taste</h1>
        <section className="grid gap-4 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-xl font-semibold">Start with a game you know</h2>
          <p className="max-w-xl text-muted-foreground">
            Tell Playfit what you enjoyed or what did not work for you. Your preferences and history
            will appear here as you add feedback.
          </p>
          <Button asChild className="w-fit">
            <Link href="/search">Find a game to rate</Link>
          </Button>
        </section>
      </Container>
    );
  }

  if (!hydratedOnce && (hydrating || missingIds.length > 0)) {
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
        <Container as="main" size="lg" className="flex flex-col gap-6 py-6 lg:py-8">
          <h1 className="sr-only md:not-sr-only md:font-display md:text-4xl md:font-black md:tracking-tight">
            Your Taste
          </h1>
          {belowCalibration || missingIds.length > 0 ? (
            <Alert variant="warning" className="shrink-0">
              {belowCalibration && missingIds.length > 0
                ? "Add at least 3 liked games and 1 missed game to refine your recommendations. (Also, some older signals could not be loaded.)"
                : belowCalibration
                  ? "Add at least 3 liked games and 1 missed game to refine your recommendations."
                  : "Some older signals could not be loaded."}
            </Alert>
          ) : null}

          {recsLoadError ? (
            <Alert
              variant="error"
              className="shrink-0 flex flex-wrap items-center justify-between gap-3"
            >
              <span>{recsLoadError}</span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleRetryRecs}
                disabled={isRetryingRecs}
              >
                {isRetryingRecs ? "Retrying..." : "Try again"}
              </Button>
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
            traitFilter={traitFilter}
            onSelectTrait={handleSelectTrait}
            onClearTraitFilter={handleClearTraitFilter}
          />

          {/* Desktop layout */}
          <TasteDesktop
            section={section}
            model={model}
            historyAndActivityEntries={historyAndActivityEntries}
            gamesById={gamesById}
            gameStates={state.user.gameStates}
            recs={recs}
            changingId={changingId}
            setChangingId={setChangingId}
            applyDecisionFeedback={applyDecisionFeedback}
            setPlayfitPick={setPlayfitPick}
            removeTasteSignal={removeTasteSignal}
            traitFilter={traitFilter}
            onSelectTrait={handleSelectTrait}
            onClearTraitFilter={handleClearTraitFilter}
          />
        </Container>
        <StatusToast />
      </div>
    </motion.div>
  );
}
