"use client";

import type { RankedSeedGame } from "@playfit/core/types";
import { CheckCircle2, ChevronRight, Dices, Eye, ListPlus, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";
import { CoverArt } from "../playfit/cover-art";
import {
  confidenceLabel,
  decisionLabel,
  decisionTone,
  formatGameDescriptor,
  matchQualityLabel,
  primaryReason,
  watchOutLabel,
} from "../playfit/product-utils";
import { type AlreadyPlayedFeedback, AlreadyPlayedPanel } from "./already-played-panel";

const reasonOptions = ["Wrong mood", "Too long", "Too hard", "Not my genre"];

function DecisionMetric({
  label,
  value,
  detail,
  numericValue,
}: {
  label: string;
  value: string;
  detail?: string;
  numericValue?: number;
}) {
  return (
    <div
      className="rounded-xl border border-border bg-secondary p-3"
      {...(numericValue != null
        ? {
            role: "meter",
            "aria-valuenow": numericValue,
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-label": `${label}: ${value}${detail ? `, ${detail}` : ""}`,
          }
        : {
            "aria-label": `${label}: ${value}${detail ? `, ${detail}` : ""}`,
          })}
    >
      <span className="block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <strong className="mt-1 block text-sm leading-tight">{value}</strong>
      {detail ? <span className="mt-1 block text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}

export function PlayNextCard({
  entry,
  primary = false,
  inPlayfitPicks = false,
  onAddPick,
  onNotForMe,
  onAlreadyPlayed,
  onShowAnother,
  onReason,
}: {
  entry: RankedSeedGame;
  primary?: boolean;
  inPlayfitPicks?: boolean;
  onAddPick: () => void;
  onNotForMe: () => void;
  onAlreadyPlayed: (feedback: AlreadyPlayedFeedback) => void;
  onShowAnother?: () => void;
  onReason?: (reason: string) => void;
}) {
  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const [showAlreadyPlayed, setShowAlreadyPlayed] = useState(false);
  const alreadyPlayedPanelId = `already-played-${entry.game.gameId}`;
  const tone = decisionTone(entry);
  const label = decisionLabel(entry);
  const bestReason = primaryReason(entry);
  const firstWatchOut = entry.cautionReasons[0] ?? "No major watch-out yet.";
  const matchLabel = matchQualityLabel(entry.affinityScore);
  const watchLabel = watchOutLabel(entry.riskScore);
  const confidence = confidenceLabel(entry.confidence);

  function markNotForMe() {
    onNotForMe();
    setShowReasonPicker(true);
    setShowAlreadyPlayed(false);
  }

  function chooseAlreadyPlayed(feedback: AlreadyPlayedFeedback) {
    onAlreadyPlayed(feedback);
    setShowAlreadyPlayed(false);
    setShowReasonPicker(false);
  }

  if (!primary) {
    return (
      <Card className="overflow-hidden rounded-2xl border-border/80 bg-card/70 shadow-sm">
        <CardContent className="grid gap-4 p-4 md:grid-cols-[5rem_minmax(0,1fr)_auto] md:items-center">
          <CoverArt game={entry.game} className="aspect-[2/3] w-20 justify-self-center" />
          <div className="grid min-w-0 gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={tone}>Worth checking</Badge>
              <Badge variant="outline">{label}</Badge>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {formatGameDescriptor(entry.game)}
              </p>
              <h3 className="font-display text-xl font-extrabold leading-tight">
                {entry.game.title}
              </h3>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{bestReason}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{matchLabel}</Badge>
              <Badge variant="secondary">{watchLabel}</Badge>
              <Badge variant="secondary">{confidence}</Badge>
            </div>
          </div>
          <div className="grid gap-2 md:min-w-44">
            <Button type="button" size="sm" onClick={onAddPick} disabled={inPlayfitPicks}>
              <ListPlus className="size-4" />
              {inPlayfitPicks ? "In Picks" : "Add pick"}
            </Button>
            <div className="flex flex-wrap gap-2 md:justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={showAlreadyPlayed}
                aria-controls={alreadyPlayedPanelId}
                onClick={() => {
                  setShowAlreadyPlayed((current) => !current);
                  setShowReasonPicker(false);
                }}
              >
                Played
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={markNotForMe}>
                Not for me
              </Button>
              {onShowAnother ? (
                <Button type="button" variant="ghost" size="sm" onClick={onShowAnother}>
                  Show another
                </Button>
              ) : null}
              <Button type="button" variant="ghost" size="sm" asChild>
                <Link href={`/play/game/${entry.game.gameId}`}>
                  See why
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>
          {showAlreadyPlayed ? (
            <div className="md:col-span-3">
              <AlreadyPlayedPanel id={alreadyPlayedPanelId} onSelect={chooseAlreadyPlayed} />
            </div>
          ) : null}
          {showReasonPicker ? (
            <div className="grid gap-2 rounded-2xl border border-border bg-secondary p-4 md:col-span-3">
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
                      onReason?.(reason);
                      setShowReasonPicker(false);
                    }}
                  >
                    {reason}
                  </Button>
                ))}
              </Stack>
            </div>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "min-w-0 overflow-hidden rounded-3xl",
        primary &&
          "border-[color-mix(in_srgb,var(--accent),transparent_58%)] bg-[color-mix(in_srgb,var(--card),var(--accent)_7%)] shadow-sm",
      )}
    >
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge variant={tone}>{primary ? "Play this next" : "Worth checking"}</Badge>
          <Badge variant="outline">{label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div
          className={cn(
            "grid gap-4",
            primary && "md:grid-cols-[minmax(150px,220px)_minmax(0,1fr)]",
          )}
        >
          <CoverArt
            game={entry.game}
            className={cn(
              "aspect-[2/3] w-full max-w-48 justify-self-center",
              primary && "md:max-w-none",
            )}
            priority={primary}
          />
          <div className="grid min-w-0 content-start gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {formatGameDescriptor(entry.game)}
              </p>
              <h2
                className={cn(
                  "font-display font-extrabold leading-tight tracking-tight",
                  primary ? "text-3xl md:text-[2.15rem]" : "text-xl",
                )}
              >
                {entry.game.title}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
              <DecisionMetric
                label="Match"
                value={matchLabel}
                detail={`${entry.affinityScore}/100`}
                numericValue={entry.affinityScore}
              />
              <DecisionMetric
                label="Watch-outs"
                value={watchLabel}
                detail={`${entry.riskScore}/100`}
                numericValue={entry.riskScore}
              />
              <DecisionMetric label="Confidence" value={confidence} />
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <div className="rounded-2xl border border-border bg-secondary p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Best signal
                </p>
                <p className="mt-2 text-sm leading-6">{bestReason}</p>
              </div>
              <div className="rounded-2xl border border-border bg-secondary p-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Watch-out
                </p>
                <p className="mt-2 text-sm leading-6">{firstWatchOut}</p>
              </div>
            </div>
          </div>
        </div>
        <Stack
          direction="row"
          wrap
          gap={2}
          className="items-center rounded-2xl bg-secondary/60 p-2"
        >
          <Button type="button" onClick={onAddPick} disabled={inPlayfitPicks} className="shadow-sm">
            <ListPlus className="size-4" />
            {inPlayfitPicks ? "In Playfit Picks" : "Add to Playfit Picks"}
          </Button>
          <span className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Correct the read
          </span>
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
        <div className="flex flex-wrap items-center gap-2">
          {onShowAnother ? (
            <Button type="button" variant="ghost" onClick={onShowAnother}>
              <Dices className="size-4" />
              Show another
            </Button>
          ) : null}
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href={`/play/game/${entry.game.gameId}`}>
              <Eye className="size-4" />
              See why
            </Link>
          </Button>
        </div>
        {showAlreadyPlayed ? (
          <AlreadyPlayedPanel id={alreadyPlayedPanelId} onSelect={chooseAlreadyPlayed} />
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
                    onReason?.(reason);
                    setShowReasonPicker(false);
                  }}
                >
                  {reason}
                </Button>
              ))}
            </Stack>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
