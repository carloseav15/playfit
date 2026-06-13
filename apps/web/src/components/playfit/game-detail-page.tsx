"use client";

import { scoreSeedGame } from "@playfit/core/domain";
import type { ProductPlayStatus, RankedSeedGame, SeedGame } from "@playfit/core/types";
import { Archive, ArrowLeft, Award, BookmarkPlus, Flag, Pause, Play, XCircle } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Dialog } from "@/components/ui/dialog";
import { RadioGroup, RadioItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Stack } from "@/components/ui/stack";

import { Carousel } from "./carousel";
import { CarouselCard } from "./carousel-card";
import { CoverArt } from "./cover-art";
import { Metric } from "./metric";
import { usePlayfit } from "./playfit-context";
import { confidenceLabel, statusOptions } from "./product-utils";
import { StarRating } from "./star-rating";
import { StatusToast } from "./status-toast";

const statusIcons: Record<string, ComponentType<{ className?: string }>> = {
  playing: Play,
  on_hold: Pause,
  shelved: Archive,
  beaten: Flag,
  completed: Award,
  abandoned: XCircle,
  want_to_play: BookmarkPlus,
};

type DetailStatusOption = {
  value: ProductPlayStatus;
  label: string;
  description: string;
};

const detailStatusOptions = statusOptions.filter(
  (option): option is DetailStatusOption => option.value !== "",
);

export function GameDetailPage({ gameId }: { gameId: string }) {
  const {
    state,
    closeDossier,
    setUi,
    setPlayStatus,
    setRating,
    toggleFlag,
    excludeGame,
    getSeedGame,
  } = usePlayfit();
  const [game, setGame] = useState<SeedGame | null>(null);
  const [similarGames, setSimilarGames] = useState<SeedGame[]>([]);
  const [seriesGames, setSeriesGames] = useState<SeedGame[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function fetchGameData() {
      const cached = getSeedGame(gameId);
      if (cancelled) return;

      if (cached) {
        setGame(cached);
        setLoading(false);
      } else {
        const res = await fetch("/api/games/batch", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ gameIds: [gameId] }),
        });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { games: SeedGame[] };
          if (data.games[0]) setGame(data.games[0]);
        }
        if (!cancelled) setLoading(false);
      }

      if (!cancelled) {
        try {
          const similarRes = await fetch("/api/recommendations/similar", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ gameId }),
          });
          if (similarRes.ok) {
            const data = (await similarRes.json()) as { similar: SeedGame[]; series: SeedGame[] };
            setSimilarGames(data.similar);
            setSeriesGames(data.series);
          }
        } catch {
          // Silently fail
        }
      }
    }
    void fetchGameData();
    return () => {
      cancelled = true;
    };
  }, [gameId, getSeedGame]);

  const entry = useMemo(
    () => (game && state.user.profile ? scoreSeedGame(game, state, state.user.profile) : null),
    [game, state],
  );
  const gameState = game ? state.user.gameStates[game.gameId] : null;

  function scoreGame(sg: SeedGame): RankedSeedGame | null {
    if (!state.user.profile) return null;
    return scoreSeedGame(sg, state, state.user.profile);
  }

  const [showExcludeConfirm, setShowExcludeConfirm] = useState(false);

  function goToSetup() {
    setUi((current) => ({ ...current, activeTab: "onboarding", profileMode: "overview" }));
    closeDossier();
  }

  if (loading) {
    return (
      <Container as="main" size="sm" className="grid min-h-screen place-items-center text-center">
        <div className="grid gap-4">
          <h1 className="font-display text-3xl font-extrabold">Loading...</h1>
          <p className="text-muted-foreground">Fetching game details.</p>
        </div>
      </Container>
    );
  }

  if (!game) {
    return (
      <Container as="main" size="sm" className="grid min-h-screen place-items-center text-center">
        <div className="grid gap-4">
          <h1 className="font-display text-3xl font-extrabold">Game not found</h1>
          <p className="text-muted-foreground">This title isn&apos;t in our catalog yet.</p>
          <div>
            <Button type="button" variant="secondary" onClick={closeDossier}>
              ← Back
            </Button>
          </div>
        </div>
      </Container>
    );
  }

  return (
    <Container as="main" size="md" className="min-h-screen py-6">
      <button
        type="button"
        onClick={closeDossier}
        className="mb-6 flex min-h-10 w-fit cursor-pointer items-center gap-1.5 rounded-md px-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="size-4" />
        Back to Playfit
      </button>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <CoverArt
          game={game}
          className="mx-auto aspect-[2/3] w-full max-w-[260px] lg:mx-0"
          priority
        />
        <div className="grid min-w-0 gap-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Game details
            </p>
            <h1 className="font-display text-3xl font-extrabold">{game.title}</h1>
          </div>

          {entry ? (
            <>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <Metric label="Match" value={entry.affinityScore} />
                <Metric label="Watch-outs" value={entry.riskScore} />
                <Metric label="Confidence" value={confidenceLabel(entry.confidence)} />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <ReasonPanel
                  title="Why this might work"
                  reasons={entry.fitReasons}
                  tone="positive"
                />
                <ReasonPanel
                  title="What could get in the way"
                  reasons={
                    entry.cautionReasons.length ? entry.cautionReasons : ["No major caveat yet."]
                  }
                  tone="warning"
                />
              </div>
            </>
          ) : (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle as="h2">Finish setup first</CardTitle>
                <CardDescription>
                  Set up your platforms and favorites so Playfit can start reading games for you.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button type="button" variant="secondary" onClick={goToSetup}>
                  Open setup
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle as="h2">Your progress</CardTitle>
              <CardDescription>Every choice here sharpens your next read.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <RadioGroup name={`play-status-${game.gameId}`}>
                {detailStatusOptions.map((option) => {
                  const Icon = statusIcons[option.value];
                  const isActive = gameState?.status === option.value;
                  return (
                    <RadioItem
                      key={option.value}
                      id={`status-${game.gameId}-${option.value}`}
                      name={`play-status-${game.gameId}`}
                      value={option.value}
                      checked={isActive}
                      onChange={() => setPlayStatus(game.gameId, option.value)}
                      label={option.label}
                      description={option.description}
                      icon={Icon ? <Icon className="size-4" /> : undefined}
                    />
                  );
                })}
              </RadioGroup>
              {gameState?.status && (
                <div className="pt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setPlayStatus(game.gameId, undefined)}
                  >
                    Clear status
                  </Button>
                </div>
              )}
              <Separator />
              <div>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">Save as</h3>
                <Stack direction="row" wrap gap={2}>
                  <Button
                    type="button"
                    variant={gameState?.inBacklog ? "default" : "secondary"}
                    aria-pressed={gameState?.inBacklog ?? false}
                    onClick={() => toggleFlag(game.gameId, "inBacklog")}
                  >
                    Backlog
                  </Button>
                  <Button
                    type="button"
                    variant={gameState?.inWishlist ? "default" : "secondary"}
                    aria-pressed={gameState?.inWishlist ?? false}
                    onClick={() => toggleFlag(game.gameId, "inWishlist")}
                  >
                    Wishlist
                  </Button>
                </Stack>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">Recommendation</h3>
                <Stack direction="row" wrap gap={2}>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setShowExcludeConfirm(true)}
                  >
                    Not for me
                  </Button>
                </Stack>
              </div>
              <Separator />
              <div>
                <h3 className="mb-2 text-xs font-medium text-muted-foreground">Rating</h3>
                {gameState?.rating == null || gameState.rating <= 0 ? (
                  <p className="mb-2 text-xs text-muted-foreground/60 italic">Not yet rated</p>
                ) : null}
                <StarRating
                  value={gameState?.rating}
                  onChange={(value) => setRating(game.gameId, value)}
                />
              </div>
            </CardContent>
          </Card>

          {seriesGames.length > 0 && (
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle as="h2">Same series</CardTitle>
                <CardDescription>Other titles in the {game.series} collection.</CardDescription>
              </CardHeader>
              <CardContent>
                <Carousel>
                  {seriesGames.map((sg) => (
                    <CarouselCard
                      key={sg.gameId}
                      game={sg}
                      entry={scoreGame(sg)}
                      status={state.user.gameStates[sg.gameId]?.status}
                    />
                  ))}
                </Carousel>
              </CardContent>
            </Card>
          )}
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle as="h2">Similar games</CardTitle>
              <CardDescription>Nearby titles in the catalog.</CardDescription>
            </CardHeader>
            <CardContent>
              {similarGames.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No similar titles in the catalog yet.
                </p>
              ) : (
                <Carousel>
                  {similarGames.map((sg) => (
                    <CarouselCard
                      key={sg.gameId}
                      game={sg}
                      entry={scoreGame(sg)}
                      status={state.user.gameStates[sg.gameId]?.status}
                    />
                  ))}
                </Carousel>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={showExcludeConfirm}
        onClose={() => setShowExcludeConfirm(false)}
        title="Exclude this game?"
      >
        <p className="text-sm text-muted-foreground">
          Playfit will stop recommending this title. You can undo this from the game library.
        </p>
        <div className="mt-4 flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setShowExcludeConfirm(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              excludeGame(game.gameId);
              closeDossier();
            }}
          >
            Exclude
          </Button>
        </div>
      </Dialog>
      <StatusToast />
    </Container>
  );
}

function ReasonPanel({
  title,
  reasons,
  tone,
}: {
  title: string;
  reasons: string[];
  tone: "positive" | "warning";
}) {
  return (
    <div className="rounded-md border border-border bg-secondary p-4">
      <Badge variant={tone}>{title}</Badge>
      <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
        {reasons.map((reason) => (
          <li key={reason}>• {reason}</li>
        ))}
      </ul>
    </div>
  );
}
