"use client";

import { findSimilarGames, type ProductPlayStatus, scoreSeedGame } from "@playfit/core";
import {
  Archive,
  ArrowLeft,
  Award,
  BookmarkPlus,
  Check,
  Flag,
  Pause,
  Play,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";

import { CoverArt } from "./cover-art";
import { Metric } from "./metric";
import { usePlayfit } from "./playfit-context";
import { buildPlatformsKey, confidenceLabel, statusOptions } from "./product-utils";
import { StarRating } from "./star-rating";

const statusIcons: Record<string, ComponentType<{ className?: string }>> = {
  playing: Play,
  on_hold: Pause,
  shelved: Archive,
  beaten: Flag,
  completed: Award,
  abandoned: XCircle,
  want_to_play: BookmarkPlus,
};

export function GameDetailPage({ gameId }: { gameId: string }) {
  const {
    seedData,
    state,
    closeDossier,
    openDossier,
    setPlayStatus,
    setRating,
    toggleFlag,
    excludeGame,
  } = usePlayfit();
  const game = seedData.gamesById.get(gameId) ?? null;
  const platformsKey = useMemo(
    () => buildPlatformsKey(state.user),
    [state.user.onboarding.platforms],
  );
  const entry = useMemo(
    () => (game && state.user.profile ? scoreSeedGame(game, state, state.user.profile) : null),
    [game, state.user.profile, state.user.gameStates, platformsKey, seedData.gamesById],
  );
  const gameState = game ? state.user.gameStates[game.gameId] : null;
  const similarGames = useMemo(
    () => (game ? findSimilarGames(game, seedData.allGames, 5) : []),
    [game, seedData.allGames],
  );

  const [showExcludeConfirm, setShowExcludeConfirm] = useState(false);

  function handleStatusClick(value: ProductPlayStatus | "") {
    if (!game || !value) return;
    const nextStatus = gameState?.status === value ? undefined : (value as ProductPlayStatus);
    setPlayStatus(game.gameId, nextStatus);
  }

  if (!game) {
    return (
      <div className="mx-auto grid min-h-screen max-w-[580px] place-items-center px-4 text-center">
        <div className="grid gap-4">
          <h1 className="font-display text-3xl font-extrabold">Game not found</h1>
          <p className="text-muted-foreground">This title isn&apos;t in our catalog yet.</p>
          <div>
            <Button type="button" variant="secondary" onClick={closeDossier}>
              ← Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[980px] px-4 py-6">
      <button
        type="button"
        onClick={closeDossier}
        className="mb-6 flex cursor-pointer items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Playfit
      </button>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <CoverArt game={game} className="aspect-[2/3]" />
        <div className="grid gap-5">
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
            <Card>
              <CardHeader>
                <CardTitle>Finish setup first</CardTitle>
                <CardDescription>
                  Set up your platforms and favorites so Playfit can start reading games for you.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Your progress</CardTitle>
              <CardDescription>Every choice here sharpens your next read.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <fieldset className="grid gap-1">
                <legend className="sr-only">Play status</legend>
                {statusOptions.map((option) => {
                  if (!option.value) return null;
                  const Icon = statusIcons[option.value];
                  const isActive = gameState?.status === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => handleStatusClick(option.value)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isActive
                          ? "bg-primary/10 text-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background">
                        {Icon && <Icon className="size-4" />}
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium leading-tight">
                          {option.label}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      </span>
                      {isActive && <Check className="size-4 shrink-0 text-primary" />}
                    </button>
                  );
                })}
              </fieldset>
              <Separator />
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Save as</p>
                <div className="flex flex-wrap gap-2">
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
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setShowExcludeConfirm(true)}
                  >
                    Not for me
                  </Button>
                </div>
              </div>
              <Separator />
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Rating</p>
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

          <Card>
            <CardHeader>
              <CardTitle>Similar games</CardTitle>
              <CardDescription>Nearby titles in the catalog.</CardDescription>
            </CardHeader>
            <CardContent>
              {similarGames.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No similar titles in the catalog yet.
                </p>
              ) : (
                <div className="grid gap-2">
                  {similarGames.map((sg) => (
                    <button
                      key={sg.gameId}
                      type="button"
                      className="flex items-center gap-3 rounded-md border border-border bg-secondary p-2 text-left text-sm transition-all duration-150 hover:bg-secondary/60 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => openDossier(sg.gameId)}
                    >
                      <span className="flex-1 font-medium">{sg.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {sg.series || sg.primaryGenre}
                      </span>
                    </button>
                  ))}
                </div>
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
    </div>
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
