"use client";

import { scoreSeedGame } from "@playfit/core/domain";
import type { RankedSeedGame, SeedGame } from "@playfit/core/types";
import {
  ArrowLeft,
  CheckCircle2,
  ListChecks,
  ListPlus,
  Play,
  SlidersHorizontal,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Stack } from "@/components/ui/stack";
import { fetchGame } from "@/lib/game-cache";
import { CoverArt } from "../playfit/cover-art";
import { Metric } from "../playfit/metric";
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

function ReasonPanel({
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
      {showAlreadyPlayed ? (
        <AlreadyPlayedPanel id={alreadyPlayedPanelId} onSelect={markAlreadyPlayed} />
      ) : null}
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
  const { getSeedGame, state } = usePlayfit();
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(94,128,255,0.08),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_38%)] text-foreground">
        <Container as="main" size="md" className="grid gap-6 py-6 md:py-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="ghost" className="w-fit" asChild>
              <Link href="/play">
                <ArrowLeft className="size-4" />
                Back to Play Next
              </Link>
            </Button>
            <Button
              type="button"
              variant={pathname === "/play/taste" ? "secondary" : "ghost"}
              className="w-fit"
              asChild
            >
              <Link href="/play/taste">
                <SlidersHorizontal className="size-4" />
                Your Taste
              </Link>
            </Button>
            <Button
              type="button"
              variant={pathname === "/play/picks" ? "secondary" : "ghost"}
              className="w-fit"
              asChild
            >
              <Link href="/play/picks">
                <ListChecks className="size-4" />
                Playfit Picks
              </Link>
            </Button>
          </div>
          <div className="grid min-w-0 gap-6 rounded-3xl border border-border bg-card/70 p-4 shadow-sm lg:grid-cols-[minmax(180px,280px)_minmax(0,1fr)] lg:p-6">
            <CoverArt game={game} className="aspect-[2/3] w-full max-w-72 justify-self-center" />
            <div className="grid min-w-0 content-start gap-5">
              <div className="grid gap-3">
                <Stack direction="row" wrap gap={2}>
                  <Badge variant={decisionTone(entry)}>{decisionLabel(entry)}</Badge>
                  <Badge variant="outline">Recommended action</Badge>
                </Stack>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {formatGameDescriptor(game)}
                  </p>
                  <h1 className="font-display text-4xl font-extrabold leading-tight">
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
              <div className="grid grid-cols-1 gap-2 text-center text-xs sm:grid-cols-3">
                <Metric label="Match" value={entry.affinityScore} />
                <Metric label="Watch-outs" value={entry.riskScore} />
                <Metric label="Confidence" value={confidenceLabel(entry.confidence)} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <ReasonPanel
                  title="Why this could work"
                  reasons={entry.fitReasons}
                  fallback="Playfit needs more feedback before making a strong claim."
                />
                <ReasonPanel
                  title="Watch-outs"
                  reasons={entry.cautionReasons}
                  fallback="No major watch-out yet."
                />
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
