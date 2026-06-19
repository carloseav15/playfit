"use client";

import { scoreSeedGame } from "@playfit/core/domain";
import type { RankedSeedGame, SeedGame } from "@playfit/core/types";
import { ArrowLeft, Check, CheckCircle2, ListPlus, XCircle } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Stack } from "@/components/ui/stack";
import { fetchGame } from "@/lib/game-cache";
import { cn } from "@/lib/utils";
import { CoverArt } from "../playfit/cover-art";
import { usePlayfit } from "../playfit/playfit-context";
import {
  confidenceLabel,
  decisionLabel,
  decisionTone,
  formatDisplayGenre,
  isValidReleaseYear,
} from "../playfit/product-utils";
import { StatusToast } from "../playfit/status-toast";
import { type AlreadyPlayedFeedback, AlreadyPlayedPanel } from "./already-played-panel";
import { PlayRouteTabs } from "./play-route-tabs";
import { RecommendationMetric } from "./recommendation-metric";
import { filterUsefulCautions, RecommendationReasons } from "./recommendation-reasons";

function CurrentUserState({
  status,
  rating,
  excluded,
  inPlayfitPicks,
}: {
  status?: string;
  rating?: number;
  excluded?: boolean;
  inPlayfitPicks?: boolean;
}) {
  const labels = [
    inPlayfitPicks ? "In Playfit Picks" : null,
    status ? `Status: ${status.replaceAll("_", " ")}` : null,
    rating ? `Rating: ${rating}` : null,
    excluded ? "Skipped for now" : null,
  ].filter(Boolean);

  if (labels.length === 0) {
    return <Badge variant="outline">No decision yet</Badge>;
  }

  return (
    <Stack direction="row" wrap gap={2}>
      {labels.map((label) => (
        <Badge key={label} variant={label === "Skipped for now" ? "negative" : "outline"}>
          {label}
        </Badge>
      ))}
    </Stack>
  );
}

function DossierActions({ entry }: { entry: RankedSeedGame }) {
  const { applyDecisionFeedback, setPlayfitPick } = usePlayfit();
  const [showAlreadyPlayed, setShowAlreadyPlayed] = useState(false);
  const isPicked = entry.inPlayfitPicks;
  const alreadyPlayedPanelId = `dossier-already-played-${entry.game.gameId}`;

  function markNotForMe() {
    applyDecisionFeedback(entry.game.gameId, "not_for_me");
    setShowAlreadyPlayed(false);
  }

  function markAlreadyPlayed(feedback: AlreadyPlayedFeedback) {
    applyDecisionFeedback(entry.game.gameId, feedback);
    setShowAlreadyPlayed(false);
  }

  return (
    <div className="fixed bottom-16 left-0 right-0 z-30 border-t border-border/60 bg-background/95 backdrop-blur-xl p-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] pb-[max(1rem,env(safe-area-inset-bottom))] md:relative md:bottom-auto md:z-auto md:p-0 md:bg-transparent md:border-0 md:shadow-none md:pb-0">
      <div className="mx-auto max-w-md md:max-w-none flex flex-col sm:flex-row gap-2.5">
        {isPicked ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPlayfitPick(entry.game.gameId, false)}
            className="flex-1 h-11 md:h-10 text-xs font-bold"
          >
            <ListPlus className="size-4" />
            Remove from Picks
          </Button>
        ) : (
          <Button
            type="button"
            onClick={() => setPlayfitPick(entry.game.gameId, true)}
            className="flex-1 h-11 md:h-10 text-xs font-bold"
          >
            <ListPlus className="size-4" />
            Save to Picks
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          aria-expanded={showAlreadyPlayed}
          aria-controls={alreadyPlayedPanelId}
          onClick={() => {
            setShowAlreadyPlayed((current) => !current);
          }}
          className="flex-1 h-11 md:h-10 text-xs font-bold"
        >
          <CheckCircle2 className="size-4" />
          Already played
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={markNotForMe}
          className="flex-1 h-11 md:h-10 text-xs font-bold hover:bg-destructive/10 hover:text-destructive"
        >
          <XCircle className="size-4" />
          Not for me
        </Button>
      </div>
      <AlreadyPlayedPanel
        id={alreadyPlayedPanelId}
        open={showAlreadyPlayed}
        onClose={() => setShowAlreadyPlayed(false)}
        onSelect={markAlreadyPlayed}
      />
    </div>
  );
}

export function DecisionDossier({ gameId }: { gameId: string }) {
  const { getSeedGame, state } = usePlayfit();
  const pathname = usePathname();
  const router = useRouter();
  const cachedGame = getSeedGame(gameId);
  const [fetchedGame, setFetchedGame] = useState<SeedGame | null>(null);
  const [loadingGame, setLoadingGame] = useState(!cachedGame);
  const game = cachedGame ?? fetchedGame;

  useEffect(() => {
    if (cachedGame) {
      setFetchedGame(null);
      setLoadingGame(false);
      return;
    }

    let cancelled = false;
    setLoadingGame(true);
    setFetchedGame(null);

    void fetchGame(gameId)
      .then((nextGame) => {
        if (!cancelled) setFetchedGame(nextGame);
      })
      .catch(() => {
        if (!cancelled) setFetchedGame(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingGame(false);
      });

    return () => {
      cancelled = true;
    };
  }, [gameId, cachedGame]);

  const entry = useMemo(
    () => (game && state.user.profile ? scoreSeedGame(game, state, state.user.profile) : null),
    [game, state],
  );
  const gameState = game ? state.user.gameStates[game.gameId] : null;

  const ownedPlatformIds = useMemo(() => {
    return new Set(state.user.onboarding.platforms.map((p) => p.platformId));
  }, [state.user.onboarding.platforms]);

  const platformsList = useMemo(() => {
    const ids = game?.availablePlatformIds ?? [];
    const names = game?.availablePlatformNames ?? [];
    return ids.map((id, index) => ({
      id,
      name: names[index] || id,
    }));
  }, [game]);

  if (!game) {
    if (loadingGame) {
      return (
        <Container as="main" size="sm" className="grid min-h-screen place-items-center py-8">
          <Card>
            <CardHeader>
              <h1 className="font-display text-2xl font-semibold leading-tight">
                Loading game details
              </h1>
              <CardDescription>Preparing this Playfit read.</CardDescription>
            </CardHeader>
          </Card>
        </Container>
      );
    }

    return (
      <Container as="main" size="sm" className="grid min-h-screen place-items-center py-8">
        <Card>
          <CardHeader>
            <h1 className="font-display text-2xl font-semibold leading-tight">Game not found</h1>
            <CardDescription>This title is not in the current Playfit catalog.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="secondary" asChild>
              <Link href="/play">Back to Play Next</Link>
            </Button>
          </CardContent>
        </Card>
      </Container>
    );
  }

  if (!entry) {
    return (
      <Container as="main" size="sm" className="grid min-h-screen place-items-center py-8">
        <Card>
          <CardHeader>
            <h1 className="font-display text-2xl font-semibold leading-tight">
              Set up your taste first
            </h1>
            <CardDescription>
              Pick your platforms and a few games so Playfit can explain this recommendation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" asChild>
              <Link href="/play">Start Play Next</Link>
            </Button>
          </CardContent>
        </Card>
      </Container>
    );
  }

  const validCautions = filterUsefulCautions(entry.cautionReasons);
  const hasCautions = validCautions.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative min-h-screen text-foreground"
    >
      <div className="pointer-events-none absolute left-1/4 top-1/4 size-[500px] rounded-full bg-accent/5 blur-[120px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 size-[400px] rounded-full bg-indigo-500/5 blur-[100px]" />

      <div className="min-h-screen lg:h-full lg:min-h-0">
        <Container as="main" size="md" className="grid gap-6 pt-6 pb-56 md:py-8 relative z-10">
          <div className="hidden md:flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
            <Button
              type="button"
              variant="ghost"
              className="w-fit text-xs hover:text-foreground hover:bg-secondary h-11 px-3.5 rounded-xl shrink-0"
              onClick={() => router.back()}
            >
              <ArrowLeft className="size-4 mr-1.5" />
              Back
            </Button>
            <PlayRouteTabs
              pathname={pathname}
              order={["taste", "picks"]}
              className="w-full sm:w-auto"
            />
          </div>

          <div className="grid min-w-0 gap-6 rounded-3xl border border-border bg-card p-5 shadow-lg lg:grid-cols-[minmax(180px,240px)_minmax(0,1fr)] lg:p-7">
            <CoverArt
              game={game}
              className="aspect-[2/3] w-full max-w-72 justify-self-center rounded-sm shadow-xl border border-border/40 shrink-0"
            />
            <div className="grid min-w-0 content-start gap-5">
              <div className="grid gap-3">
                <Stack direction="row" wrap gap={2} className="items-center">
                  <Badge
                    variant={decisionTone(entry)}
                    className="px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  >
                    {decisionLabel(entry)}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="border-accent/30 text-accent font-bold px-2 py-0.5 text-[10px] bg-accent/5"
                  >
                    Recommended
                  </Badge>
                </Stack>
                <div>
                  <h1 className="font-display text-4xl font-black leading-tight text-foreground">
                    {game.title}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {isValidReleaseYear(game.releaseYear) && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {game.releaseYear}
                      </span>
                    )}
                    {isValidReleaseYear(game.releaseYear) &&
                      formatDisplayGenre(game.primaryGenre) && (
                        <span className="text-muted-foreground/40 text-xs">•</span>
                      )}
                    {formatDisplayGenre(game.primaryGenre) && (
                      <span className="text-xs text-muted-foreground uppercase font-black tracking-wider">
                        {formatDisplayGenre(game.primaryGenre)}
                      </span>
                    )}
                  </div>
                </div>
                <CurrentUserState
                  status={gameState?.status}
                  rating={gameState?.rating}
                  excluded={gameState?.excluded}
                  inPlayfitPicks={gameState?.inPlayfitPicks}
                />
                {platformsList.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {platformsList.map((platform) => {
                      const isOwned = ownedPlatformIds.has(platform.id);
                      return isOwned ? (
                        <Badge
                          key={platform.id}
                          variant="outline"
                          className="bg-accent/5 text-accent border-accent/30 text-[10px] font-black py-0.5 px-2 rounded-lg flex items-center gap-1 shadow-sm"
                        >
                          <Check className="size-3 stroke-[3]" />
                          {platform.name}
                        </Badge>
                      ) : (
                        <Badge
                          key={platform.id}
                          variant="secondary"
                          className="bg-secondary/30 text-muted-foreground/80 border border-border/40 text-[10px] font-medium py-0.5 px-2 rounded-lg"
                        >
                          {platform.name}
                        </Badge>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <RecommendationMetric
                  label="Match Affinity"
                  value={`${entry.affinityScore}%`}
                  numericValue={entry.affinityScore}
                  colorClass="bg-gradient-to-r from-accent to-indigo-600"
                  labelClassName="text-[9px]"
                />
                <RecommendationMetric
                  label="Watch-out Score"
                  value={`${entry.riskScore}%`}
                  numericValue={entry.riskScore}
                  colorClass={entry.riskScore > 45 ? "bg-destructive" : "bg-warning"}
                  labelClassName="text-[9px]"
                />
                <RecommendationMetric
                  label="Confidence Read"
                  value={confidenceLabel(entry.confidence)}
                  numericValue={100}
                  colorClass="bg-accent/70"
                  labelClassName="text-[9px]"
                />
              </div>

              <div className={cn("grid gap-3.5", hasCautions ? "md:grid-cols-2" : "grid-cols-1")}>
                <RecommendationReasons
                  title="Why it fits"
                  reasons={entry.fitReasons}
                  fallback="Playfit needs more feedback before making a strong claim."
                  tone="positive"
                />
                {hasCautions ? (
                  <RecommendationReasons
                    title="Watch-outs"
                    reasons={validCautions}
                    fallback="No major watch-out yet."
                    tone="warning"
                  />
                ) : null}
              </div>
              <DossierActions entry={entry} />
            </div>
          </div>
        </Container>
        <StatusToast />
      </div>
    </motion.div>
  );
}
