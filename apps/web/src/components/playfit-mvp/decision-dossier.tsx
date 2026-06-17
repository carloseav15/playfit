"use client";

import {
  findSeriesGames,
  findSimilarGames,
  getTagWeight,
  scoreSeedGame,
} from "@playfit/core/domain";
import type { RankedSeedGame, SeedGame } from "@playfit/core/types";
import { ArrowLeft, CheckCircle2, ChevronRight, ListPlus, Play, XCircle } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  formatGameDescriptor,
} from "../playfit/product-utils";
import { StatusToast } from "../playfit/status-toast";
import { type AlreadyPlayedFeedback, AlreadyPlayedPanel } from "./already-played-panel";

const reasonOptions = ["Wrong mood", "Too long", "Too hard", "Not my genre"];

function _ReasonPanel({
  title,
  reasons,
  fallback,
}: {
  title: string;
  reasons: string[];
  fallback: string;
}) {
  const visibleReasons = reasons.length ? reasons : [fallback];

  return (
    <div className="rounded-2xl border border-border bg-secondary p-4">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>
      <ul className="grid gap-2 text-sm">
        {visibleReasons.slice(0, 4).map((reason) => (
          <li key={reason} className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
  const { applyDecisionFeedback, setPlayfitPick, setStatusMessage, startPlayfitPick } =
    usePlayfit();
  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const [showAlreadyPlayed, setShowAlreadyPlayed] = useState(false);
  const isPicked = entry.inPlayfitPicks;
  const alreadyPlayedPanelId = `dossier-already-played-${entry.game.gameId}`;

  function markNotForMe() {
    applyDecisionFeedback(entry.game.gameId, "not_for_me");
    setShowReasonPicker(true);
    setShowAlreadyPlayed(false);
  }

  function markAlreadyPlayed(feedback: AlreadyPlayedFeedback) {
    applyDecisionFeedback(entry.game.gameId, feedback);
    setShowAlreadyPlayed(false);
    setShowReasonPicker(false);
  }

  return (
    <div className="grid gap-4">
      <Stack direction="row" wrap gap={2}>
        {isPicked ? (
          <>
            <Button
              type="button"
              onClick={() => startPlayfitPick(entry.game.gameId)}
              className="shadow-sm"
            >
              <Play className="size-4" />
              Started
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPlayfitPick(entry.game.gameId, false)}
            >
              <ListPlus className="size-4" />
              Remove from Picks
            </Button>
          </>
        ) : (
          <Button type="button" onClick={() => setPlayfitPick(entry.game.gameId, true)}>
            <ListPlus className="size-4" />
            Add to Playfit Picks
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          aria-expanded={showAlreadyPlayed}
          aria-controls={alreadyPlayedPanelId}
          onClick={() => {
            setShowAlreadyPlayed((current) => !current);
            setShowReasonPicker(false);
          }}
        >
          <CheckCircle2 className="size-4" />
          Already played
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={markNotForMe}
          className="hover:bg-destructive/10 hover:text-destructive"
        >
          <XCircle className="size-4" />
          Not for me
        </Button>
      </Stack>
      <AlreadyPlayedPanel
        id={alreadyPlayedPanelId}
        open={showAlreadyPlayed}
        onClose={() => setShowAlreadyPlayed(false)}
        onSelect={markAlreadyPlayed}
      />
      {showReasonPicker ? (
        <div className="grid gap-2 rounded-2xl border border-border bg-secondary p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            What got in the way?
          </p>
          <Stack direction="row" wrap gap={2}>
            {reasonOptions.map((reason) => (
              <Button
                key={reason}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusMessage(`Noted: ${reason.toLowerCase()}.`);
                  setShowReasonPicker(false);
                }}
              >
                {reason}
              </Button>
            ))}
          </Stack>
        </div>
      ) : null}
    </div>
  );
}

export function DecisionDossier({ gameId }: { gameId: string }) {
  const { getSeedGame, state, seedData } = usePlayfit();
  const pathname = usePathname();
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
  const seriesGames = useMemo(
    () => (game && seedData?.allGames ? findSeriesGames(game, seedData.allGames, 3) : []),
    [game, seedData?.allGames],
  );
  const similarGames = useMemo(
    () => (game && seedData?.allGames ? findSimilarGames(game, seedData.allGames, 3) : []),
    [game, seedData?.allGames],
  );
  const gameState = game ? state.user.gameStates[game.gameId] : null;

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
              Tune your taste first
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

  const validCautions = (entry.cautionReasons ?? []).filter(
    (r) =>
      r &&
      r.trim() !== "" &&
      r !== "No reliable call yet." &&
      r !== "No major watch-out yet." &&
      r !== "No major caveat yet.",
  );
  const hasCautions = validCautions.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative min-h-screen text-foreground"
    >
      {/* Background glow effects */}
      <div className="pointer-events-none absolute left-1/4 top-1/4 size-[500px] rounded-full bg-accent/5 blur-[120px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 size-[400px] rounded-full bg-indigo-500/5 blur-[100px]" />

      <div className="min-h-screen lg:h-full lg:min-h-0">
        <Container as="main" size="md" className="grid gap-6 py-6 md:py-8 relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            <Button
              type="button"
              variant="ghost"
              className="w-fit text-xs hover:text-foreground hover:bg-white/5"
              asChild
            >
              <Link href="/play">
                <ArrowLeft className="size-4 mr-1.5" />
                Back to Play Next
              </Link>
            </Button>
            <div className="flex gap-1 bg-secondary/40 p-1 rounded-2xl border border-white/5 shrink-0">
              <Button
                type="button"
                variant={pathname === "/play/taste" ? "secondary" : "ghost"}
                className={cn(
                  "h-8 px-3.5 text-xs rounded-xl font-extrabold transition-all",
                  pathname === "/play/taste"
                    ? "bg-card shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
                asChild
              >
                <Link href="/play/taste">Taste</Link>
              </Button>
              <Button
                type="button"
                variant={pathname === "/play/picks" ? "secondary" : "ghost"}
                className={cn(
                  "h-8 px-3.5 text-xs rounded-xl font-extrabold transition-all",
                  pathname === "/play/picks"
                    ? "bg-card shadow-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5",
                )}
                asChild
              >
                <Link href="/play/picks">Picks</Link>
              </Button>
            </div>
          </div>

          <div className="grid min-w-0 gap-6 rounded-3xl border border-white/10 bg-card/45 p-5 shadow-2xl backdrop-blur-md lg:grid-cols-[minmax(180px,240px)_minmax(0,1fr)] lg:p-7">
            <CoverArt
              game={game}
              className="aspect-[2/3] w-full max-w-72 justify-self-center rounded-sm shadow-xl border border-white/5 shrink-0"
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
                    Recommended action
                  </Badge>
                </Stack>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                    {formatGameDescriptor(game)}
                  </p>
                  <h1 className="font-display text-3xl font-black leading-tight text-foreground mt-1">
                    {game.title}
                  </h1>
                </div>
                <CurrentUserState
                  status={gameState?.status}
                  rating={gameState?.rating}
                  excluded={gameState?.excluded}
                  inPlayfitPicks={gameState?.inPlayfitPicks}
                />
              </div>

              {/* Redesigned Metrics in Dossier */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-secondary/35 p-4">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    Match Affinity
                  </span>
                  <strong className="mt-1 block text-base font-extrabold text-foreground">
                    {entry.affinityScore}%
                  </strong>
                  <div className="absolute bottom-0 inset-x-0 h-1 bg-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-indigo-600"
                      style={{ width: `${entry.affinityScore}%` }}
                    />
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-secondary/35 p-4">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    Watch-out Score
                  </span>
                  <strong className="mt-1 block text-base font-extrabold text-foreground">
                    {entry.riskScore}%
                  </strong>
                  <div className="absolute bottom-0 inset-x-0 h-1 bg-white/5">
                    <div
                      className={cn(
                        "h-full",
                        entry.riskScore > 45 ? "bg-destructive" : "bg-warning",
                      )}
                      style={{ width: `${entry.riskScore}%` }}
                    />
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-secondary/35 p-4">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    Confidence Read
                  </span>
                  <strong className="mt-1 block text-base font-extrabold text-foreground">
                    {confidenceLabel(entry.confidence)}
                  </strong>
                  <div className="absolute bottom-0 inset-x-0 h-1 bg-white/5">
                    <div className="h-full bg-accent/70" style={{ width: "100%" }} />
                  </div>
                </div>
              </div>

              <div className={cn("grid gap-3.5", hasCautions ? "md:grid-cols-2" : "grid-cols-1")}>
                <div className="rounded-2xl border border-white/5 bg-secondary/20 p-4">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                    Why this could work
                  </p>
                  <ul className="grid gap-2 text-xs text-muted-foreground/80">
                    {(entry.fitReasons.length
                      ? entry.fitReasons
                      : ["Playfit needs more feedback before making a strong claim."]
                    )
                      .slice(0, 4)
                      .map((reason) => (
                        <li key={reason} className="flex gap-2 items-start">
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-positive animate-pulse" />
                          <span>{reason}</span>
                        </li>
                      ))}
                  </ul>
                </div>
                {hasCautions ? (
                  <div className="rounded-2xl border border-white/5 bg-secondary/20 p-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-warning">
                      Watch-outs
                    </p>
                    <ul className="grid gap-2 text-xs text-muted-foreground/80">
                      {validCautions.slice(0, 4).map((reason) => (
                        <li key={reason} className="flex gap-2 items-start">
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-warning animate-pulse" />
                          <span>{reason}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <DossierActions entry={entry} />
            </div>
          </div>

          {/* SIMILAR & SERIES GAMES */}
          <div className="grid gap-6 md:grid-cols-2">
            <Card className="rounded-3xl border border-white/5 bg-card/45 shadow-xl backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-extrabold text-foreground">
                  Similar Games
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Based on gameplay style tag overlap.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 p-5 pt-0">
                {similarGames.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center bg-secondary/10 border border-dashed border-white/5 rounded-2xl">
                    No similar games found in catalog.
                  </p>
                ) : (
                  similarGames.map((simGame) => (
                    <div
                      key={simGame.gameId}
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-secondary/20 p-2.5 hover:bg-secondary/40 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <CoverArt
                          game={simGame}
                          className="aspect-[2/3] w-10 shrink-0 rounded-sm shadow-md border border-white/5 transition-transform group-hover:scale-[1.03]"
                        />
                        <span className="truncate text-xs font-bold text-foreground group-hover:text-accent transition-colors">
                          {simGame.title}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-8 px-2.5 rounded-lg text-xs hover:text-accent"
                      >
                        <Link href={`/play/game/${simGame.gameId}`}>
                          View
                          <ChevronRight className="size-3.5 ml-0.5 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="rounded-3xl border border-white/5 bg-card/45 shadow-xl backdrop-blur-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-extrabold text-foreground">
                  From the Same Series
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground mt-0.5">
                  Other titles in this franchise.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 p-5 pt-0">
                {seriesGames.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 text-center bg-secondary/10 border border-dashed border-white/5 rounded-2xl">
                    No other games from this franchise in catalog.
                  </p>
                ) : (
                  seriesGames.map((serGame) => (
                    <div
                      key={serGame.gameId}
                      className="group flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-secondary/20 p-2.5 hover:bg-secondary/40 transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <CoverArt
                          game={serGame}
                          className="aspect-[2/3] w-10 shrink-0 rounded-sm shadow-md border border-white/5 transition-transform group-hover:scale-[1.03]"
                        />
                        <span className="truncate text-xs font-bold text-foreground group-hover:text-accent transition-colors">
                          {serGame.title}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-8 px-2.5 rounded-lg text-xs hover:text-accent"
                      >
                        <Link href={`/play/game/${serGame.gameId}`}>
                          View
                          <ChevronRight className="size-3.5 ml-0.5 transition-transform group-hover:translate-x-0.5" />
                        </Link>
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          {/* TAG SCORED EXPLAINABILITY TABLE */}
          <Card className="rounded-3xl border border-white/5 bg-card/45 shadow-xl backdrop-blur-sm overflow-hidden">
            <CardHeader className="border-b border-white/5 pb-4">
              <CardTitle className="text-sm font-extrabold text-foreground">
                Algorithmic Tag Explainability
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-0.5">
                How the recommendation engine evaluated this game's tags against your calibration
                signals.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/5 bg-secondary/30 text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">
                    <th className="p-4 pl-6">Gameplay Tag</th>
                    <th className="p-4">Calibration Preference</th>
                    <th className="p-4">Tag Weight</th>
                    <th className="p-4 text-right pr-6">Scoring Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {game.tags.map((tag) => {
                    const likedCount = state.user.profile?.likedTags[tag] ?? 0;
                    const dislikedCount = state.user.profile?.dislikedTags[tag] ?? 0;
                    const weight = getTagWeight(tag);

                    let prefLabel = "Neutral";
                    let prefVariant: "outline" | "positive" | "negative" = "outline";
                    let impact = "0";
                    let impactClass = "text-muted-foreground/60";

                    if (likedCount > dislikedCount) {
                      prefLabel = `Lean toward (${likedCount})`;
                      prefVariant = "positive";
                      impact = `+${likedCount * weight}`;
                      impactClass = "text-positive font-extrabold";
                    } else if (dislikedCount > likedCount) {
                      prefLabel = `Steer away (${dislikedCount})`;
                      prefVariant = "negative";
                      impact = `-${dislikedCount * weight * 2}`;
                      impactClass = "text-destructive font-extrabold";
                    }

                    return (
                      <tr key={tag} className="hover:bg-secondary/15 transition-colors">
                        <td className="p-4 pl-6 font-mono text-[10px] text-foreground font-semibold">
                          {tag.replace(/_/g, " ")}
                        </td>
                        <td className="p-4">
                          <Badge
                            variant={prefVariant}
                            className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                          >
                            {prefLabel}
                          </Badge>
                        </td>
                        <td className="p-4 font-mono text-[10px] text-muted-foreground">
                          {weight}
                        </td>
                        <td className="p-4 text-right pr-6 font-mono font-bold">
                          <span className={impactClass}>{impact}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </Container>
        <StatusToast />
      </div>
    </motion.div>
  );
}
