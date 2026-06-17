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
  colorClass = "bg-accent",
}: {
  label: string;
  value: string;
  detail?: string;
  numericValue?: number;
  colorClass?: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/5 bg-secondary/35 p-4 transition-all duration-300 hover:border-white/10 hover:bg-secondary/40"
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
      <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </span>
      <strong className="mt-1 block text-base font-extrabold leading-tight text-foreground">
        {value}
      </strong>
      {detail ? (
        <span className="mt-1 block text-xs text-muted-foreground/80">{detail}</span>
      ) : null}

      {numericValue != null && (
        <div className="absolute bottom-0 inset-x-0 h-1 bg-white/5">
          <div
            className={cn("h-full transition-all duration-500", colorClass)}
            style={{ width: `${numericValue}%` }}
          />
        </div>
      )}
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
  const validCautions = (entry.cautionReasons ?? []).filter(
    (r) =>
      r &&
      r.trim() !== "" &&
      r !== "No reliable call yet." &&
      r !== "No major watch-out yet." &&
      r !== "No major caveat yet.",
  );
  const hasCautions = validCautions.length > 0;
  const firstWatchOut = validCautions[0] ?? "";
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
      <Card className="group relative overflow-hidden rounded-3xl border border-white/5 bg-card/50 shadow-lg backdrop-blur-sm transition-all duration-300 hover:border-white/10 hover:shadow-xl">
        <CardContent className="grid gap-4 p-5 md:grid-cols-[6rem_minmax(0,1fr)_auto] md:items-center">
          <CoverArt
            game={entry.game}
            className="aspect-[2/3] w-24 justify-self-center rounded-sm shadow-md transition-transform duration-300 group-hover:scale-[1.03]"
          />
          <div className="grid min-w-0 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={tone}
                className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
              >
                {label}
              </Badge>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {formatGameDescriptor(entry.game)}
              </p>
              <h3 className="font-display text-xl font-extrabold leading-tight text-foreground">
                {entry.game.title}
              </h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">{bestReason}</p>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary" className="bg-secondary/40">
                {matchLabel}
              </Badge>
              <Badge variant="secondary" className="bg-secondary/40">
                {watchLabel}
              </Badge>
              <Badge variant="secondary" className="bg-secondary/40">
                {confidence}
              </Badge>
            </div>
          </div>
          <div className="grid gap-2 md:min-w-44">
            <Button
              type="button"
              size="sm"
              onClick={onAddPick}
              disabled={inPlayfitPicks}
              className={cn(
                "w-full bg-accent text-accent-foreground font-extrabold hover:bg-accent/90",
                inPlayfitPicks && "bg-secondary text-muted-foreground",
              )}
            >
              <ListPlus className="size-4" />
              {inPlayfitPicks ? "In Picks" : "Add pick"}
            </Button>
            <div className="flex flex-wrap gap-1.5 justify-between md:justify-end">
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
                className="text-xs hover:text-foreground"
              >
                Played
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={markNotForMe}
                className="text-xs hover:text-foreground"
              >
                Not for me
              </Button>
              {onShowAnother ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onShowAnother}
                  className="text-xs hover:text-foreground"
                >
                  Skip
                </Button>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                asChild
                className="text-xs hover:text-accent"
              >
                <Link href={`/play/game/${entry.game.gameId}`}>
                  Why?
                  <ChevronRight className="size-3.5 ml-0.5" />
                </Link>
              </Button>
            </div>
          </div>
          <AlreadyPlayedPanel
            id={alreadyPlayedPanelId}
            open={showAlreadyPlayed}
            onClose={() => setShowAlreadyPlayed(false)}
            onSelect={chooseAlreadyPlayed}
          />
          {showReasonPicker ? (
            <div className="grid gap-2 rounded-2xl border border-white/5 bg-secondary/30 p-4 md:col-span-3 mt-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
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
                    className="text-xs border-white/10 bg-card hover:bg-secondary"
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
        "relative min-w-0 overflow-hidden rounded-3xl border border-white/10 shadow-2xl backdrop-blur-md",
        primary && "bg-gradient-to-br from-card/85 to-card/60",
      )}
    >
      {/* Decorative inner glows */}
      <div className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 -bottom-16 size-44 rounded-full bg-indigo-500/10 blur-3xl" />

      <CardHeader className="pb-2 relative z-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge
            variant={tone}
            className="px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest shadow-sm"
          >
            {primary ? "Play this next" : "Worth checking"}
          </Badge>
          <Badge
            variant="outline"
            className="border-accent/30 text-accent font-bold px-2 py-0.5 text-xs bg-accent/5"
          >
            {label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 relative z-10">
        <div
          className={cn(
            "grid gap-5",
            primary && "md:grid-cols-[minmax(150px,210px)_minmax(0,1fr)]",
          )}
        >
          <div className="relative group/cover justify-self-center w-full max-w-44 md:max-w-none">
            <CoverArt
              game={entry.game}
              className="aspect-[2/3] w-full rounded-sm shadow-xl transition-all duration-300 group-hover/cover:scale-[1.02] group-hover/cover:shadow-2xl border border-white/5"
              priority={primary}
            />
          </div>
          <div className="grid min-w-0 content-start gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-accent">
                {formatGameDescriptor(entry.game)}
              </p>
              <h2
                className={cn(
                  "font-display font-black leading-[0.95] tracking-tight mt-1 text-foreground",
                  primary ? "text-3xl md:text-4xl" : "text-xl",
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
                colorClass="bg-gradient-to-r from-accent to-indigo-600"
              />
              <DecisionMetric
                label="Watch-outs"
                value={watchLabel}
                detail={`${entry.riskScore}/100`}
                numericValue={entry.riskScore}
                colorClass={entry.riskScore > 45 ? "bg-destructive" : "bg-warning"}
              />
              <DecisionMetric label="Confidence" value={confidence} colorClass="bg-accent/70" />
            </div>
            <div className={cn("grid gap-3.5", hasCautions ? "md:grid-cols-2" : "grid-cols-1")}>
              <div className="rounded-2xl border border-white/5 bg-secondary/25 p-4 hover:bg-secondary/40 transition-colors duration-200">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                  Why this fits
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{bestReason}</p>
              </div>
              {hasCautions ? (
                <div className="rounded-2xl border border-white/5 bg-secondary/25 p-4 hover:bg-secondary/40 transition-colors duration-200">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-warning">
                    Watch-outs
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {firstWatchOut}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid gap-4 pt-2 border-t border-white/5">
          <Button
            type="button"
            onClick={onAddPick}
            disabled={inPlayfitPicks}
            className={cn(
              "w-full h-12 font-extrabold text-sm rounded-2xl transition-all duration-300 active:scale-[0.99]",
              inPlayfitPicks
                ? "bg-secondary text-muted-foreground cursor-not-allowed"
                : "bg-gradient-to-r from-accent to-indigo-600 text-white shadow-[0_0_20px_rgba(255,106,61,0.2)] hover:shadow-[0_0_25px_rgba(255,106,61,0.35)] scale-100 hover:scale-[1.01]",
            )}
          >
            <ListPlus className="size-4 mr-2" />
            {inPlayfitPicks ? "Saved in Playfit Picks" : "Add to Playfit Picks"}
          </Button>

          <div className="flex flex-col gap-3 p-3 rounded-2xl bg-secondary/15 border border-white/5">
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/80 px-1">
              Calibration Feedback
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                aria-expanded={showAlreadyPlayed}
                aria-controls={alreadyPlayedPanelId}
                onClick={() => {
                  setShowAlreadyPlayed((current) => !current);
                  setShowReasonPicker(false);
                }}
                className="flex-1 text-xs border-white/5 bg-secondary/40 hover:bg-secondary/80 hover:text-foreground"
              >
                <CheckCircle2 className="size-4" />
                Already Played
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={markNotForMe}
                className="flex-1 text-xs border-white/5 bg-secondary/40 hover:bg-destructive-bg hover:text-destructive"
              >
                <XCircle className="size-4" />
                Not for me
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          {onShowAnother ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onShowAnother}
              className="text-xs hover:text-foreground"
            >
              <Dices className="size-4 mr-1.5 text-muted-foreground" />
              Show another recommendation
            </Button>
          ) : (
            <div />
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            asChild
            className="text-xs text-accent hover:text-accent/80"
          >
            <Link href={`/play/game/${entry.game.gameId}`}>
              <Eye className="size-4 mr-1.5" />
              Why this fits & analysis
            </Link>
          </Button>
        </div>
        <AlreadyPlayedPanel
          id={alreadyPlayedPanelId}
          open={showAlreadyPlayed}
          onClose={() => setShowAlreadyPlayed(false)}
          onSelect={chooseAlreadyPlayed}
        />
        {showReasonPicker ? (
          <div className="grid gap-2 rounded-2xl border border-white/5 bg-secondary/35 p-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
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
                  className="text-xs border-white/10 bg-card hover:bg-secondary"
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
