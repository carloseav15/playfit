"use client";

import type { RankedSeedGame } from "@playfit/core/types";
import { CheckCircle2, ChevronRight, Dices, Eye, ListPlus, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CoverArt } from "../playfit/cover-art";
import {
  confidenceLabel,
  decisionLabel,
  decisionTone,
  matchQualityLabel,
  primaryReason,
  watchOutLabel,
} from "../playfit/product-utils";
import { type AlreadyPlayedFeedback, AlreadyPlayedPanel } from "./already-played-panel";
import { FeedbackReasonPicker } from "./feedback-reason-picker";
import { RecommendationMetric } from "./recommendation-metric";
import { filterUsefulCautions, RecommendationReasons } from "./recommendation-reasons";

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
  const validCautions = filterUsefulCautions(entry.cautionReasons);
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
      <Card className="group relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm hover:border-border/80 hover:shadow-md transition-all duration-300">
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
              <h3 className="font-display text-2xl font-black leading-tight text-foreground">
                {entry.game.title}
              </h3>
            </div>
            {entry.fitReasons.length > 0 || hasCautions ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{bestReason}</p>
            ) : null}
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
            <FeedbackReasonPicker
              onSelect={(reason) => {
                onReason?.(reason);
                setShowReasonPicker(false);
              }}
              className="border-border/60 bg-secondary/50 md:col-span-3 mt-2"
              labelClassName="text-[10px]"
              buttonClassName="text-xs border-border bg-card hover:bg-secondary"
            />
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "relative min-w-0 overflow-hidden rounded-3xl border border-border shadow-md transition-all duration-300",
        primary && "bg-card shadow-lg",
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 -bottom-16 size-44 rounded-full bg-indigo-500/10 blur-3xl" />

      <CardHeader className="pb-2 relative z-10 p-4 sm:p-6">
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
      <CardContent className="grid gap-4 sm:gap-6 relative z-10 p-4 sm:p-6 pt-0 sm:pt-0">
        <div
          className={cn(
            "grid gap-4 sm:gap-5",
            primary && "md:grid-cols-[minmax(150px,210px)_minmax(0,1fr)]",
          )}
        >
          <div className="relative group/cover justify-self-center w-full max-w-[130px] sm:max-w-[176px] md:max-w-none">
            <CoverArt
              game={entry.game}
              className="aspect-[2/3] w-full rounded-sm shadow-xl transition-all duration-300 group-hover/cover:scale-[1.02] group-hover/cover:shadow-2xl border border-border/40"
              priority={primary}
            />
          </div>
          <div className="grid min-w-0 content-start gap-3 sm:gap-4">
            <div>
              <h2
                className={cn(
                  "font-display font-black leading-[0.95] tracking-tight text-foreground",
                  primary ? "text-2xl sm:text-4xl md:text-5xl" : "text-xl sm:text-2xl",
                )}
              >
                {entry.game.title}
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2 text-xs">
              <RecommendationMetric
                label="Match"
                value={matchLabel}
                detail={`${entry.affinityScore}/100`}
                numericValue={entry.affinityScore}
                colorClass="bg-gradient-to-r from-accent to-indigo-600"
                interactive
                className="p-2.5 sm:p-4"
                labelClassName="text-[8px] sm:text-[10px]"
                valueClassName="text-sm sm:text-base"
              />
              <RecommendationMetric
                label="Watch-outs"
                value={watchLabel}
                detail={`${entry.riskScore}/100`}
                numericValue={entry.riskScore}
                colorClass={entry.riskScore > 45 ? "bg-destructive" : "bg-warning"}
                interactive
                className="p-2.5 sm:p-4"
                labelClassName="text-[8px] sm:text-[10px]"
                valueClassName="text-sm sm:text-base"
              />
              <RecommendationMetric
                label="Confidence"
                value={confidence}
                colorClass="bg-accent/70"
                interactive
                className="p-2.5 sm:p-4"
                labelClassName="text-[8px] sm:text-[10px]"
                valueClassName="text-sm sm:text-base"
              />
            </div>
            {entry.fitReasons.length > 0 || hasCautions ? (
              <div
                className={cn(
                  "grid gap-2.5 sm:gap-3.5",
                  entry.fitReasons.length > 0 && hasCautions ? "md:grid-cols-2" : "grid-cols-1",
                )}
              >
                {entry.fitReasons.length > 0 ? (
                  <RecommendationReasons
                    title="Why this fits"
                    reasons={entry.fitReasons}
                    fallback={entry.fitReasons[0]}
                    variant="paragraph"
                    className="bg-secondary/25 p-3 sm:p-4 hover:bg-secondary/40 transition-colors duration-200"
                    titleClassName="mb-0"
                  />
                ) : null}
                {hasCautions ? (
                  <RecommendationReasons
                    title="Watch-outs"
                    reasons={[firstWatchOut]}
                    fallback={firstWatchOut}
                    tone="warning"
                    variant="paragraph"
                    className="bg-secondary/25 p-3 sm:p-4 hover:bg-secondary/40 transition-colors duration-200"
                    titleClassName="mb-0"
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 pt-2 border-t border-border/60">
          <Button
            type="button"
            onClick={onAddPick}
            disabled={inPlayfitPicks}
            className={cn(
              "w-full h-11 sm:h-12 font-extrabold text-sm rounded-2xl transition-all duration-300 active:scale-[0.99]",
              inPlayfitPicks
                ? "bg-secondary text-muted-foreground cursor-not-allowed"
                : "bg-accent text-white dark:bg-gradient-to-r dark:from-accent dark:to-indigo-600 shadow-[0_4px_14px_rgba(15,118,110,0.2)] dark:shadow-[0_0_20px_rgba(255,106,61,0.25)] hover:shadow-[0_6px_20px_rgba(15,118,110,0.3)] dark:hover:shadow-[0_0_25px_rgba(255,106,61,0.4)] scale-100 hover:scale-[1.01]",
            )}
          >
            <ListPlus className="size-4 mr-2" />
            {inPlayfitPicks ? "Saved in Playfit Picks" : "Add to Playfit Picks"}
          </Button>

          <div className="flex flex-col gap-2 p-2.5 sm:p-3 rounded-2xl bg-secondary/50 border border-border/50">
            <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground/80 px-1">
              What's your verdict?
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                aria-expanded={showAlreadyPlayed}
                aria-controls={alreadyPlayedPanelId}
                onClick={() => {
                  setShowAlreadyPlayed((current) => !current);
                  setShowReasonPicker(false);
                }}
                className="flex-1 text-xs border border-border/60 bg-secondary/50 hover:bg-secondary h-10 sm:h-11 rounded-xl text-xs font-bold"
              >
                <CheckCircle2 className="size-4 mr-1.5 text-positive" />
                Already Played
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={markNotForMe}
                className="flex-1 text-xs border border-border/60 bg-secondary/50 hover:bg-destructive-bg hover:text-destructive h-10 sm:h-11 rounded-xl text-xs font-bold"
              >
                <XCircle className="size-4 mr-1.5 text-destructive" />
                No, skip this
              </Button>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2">
          {onShowAnother ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onShowAnother}
              className="text-xs hover:text-foreground h-11 sm:h-9 justify-center sm:justify-start"
            >
              <Dices className="size-4 mr-1.5 text-muted-foreground" />
              Show me another option
            </Button>
          ) : (
            <div />
          )}
          <Button
            type="button"
            variant="ghost"
            asChild
            className="text-xs text-accent hover:text-accent/80 h-11 sm:h-9 justify-center sm:justify-start"
          >
            <Link href={`/play/game/${entry.game.gameId}`}>
              <Eye className="size-4 mr-1.5" />
              See analysis
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
          <FeedbackReasonPicker
            onSelect={(reason) => {
              onReason?.(reason);
              setShowReasonPicker(false);
            }}
            className="border-border/60 bg-secondary/50 animate-in fade-in slide-in-from-top-2 duration-300"
            labelClassName="text-[10px]"
            buttonClassName="text-xs border-border bg-card hover:bg-secondary"
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
