"use client";

import type { RankedSeedGame } from "@playfit/core/types";
import { CheckCircle2, Eye, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CoverArt } from "../../playfit/cover-art";
import { confidenceLabel } from "../../playfit/product-utils";
import { type AlreadyPlayedFeedback, AlreadyPlayedPanel } from "../already-played-panel";
import { RecommendationMetric } from "../recommendation-metric";
import { RecommendationReasonList } from "../recommendation-reasons";

interface PicksDesktopProps {
  entry: RankedSeedGame;
  expandedId: string | null;
  onToggleAlreadyPlayed: () => void;
  onCloseAlreadyPlayed: () => void;
  onAlreadyPlayed: (gameId: string, feedback: AlreadyPlayedFeedback) => void;
  onNotForMe: (gameId: string) => void;
  onRemove: (gameId: string) => void;
}

export function PicksDesktop({
  entry,
  expandedId,
  onToggleAlreadyPlayed,
  onCloseAlreadyPlayed,
  onAlreadyPlayed,
  onNotForMe,
  onRemove,
}: PicksDesktopProps) {
  const gameId = entry.game.gameId;
  const alreadyPlayedPanelId = `pick-already-played-${gameId}`;

  return (
    <Card className="group relative overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition-all duration-300 hover:border-border/80 hover:shadow-md">
      <CardContent className="grid gap-5 p-6 md:grid-cols-[100px_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-2">
          <CoverArt
            game={entry.game}
            className="aspect-[3/4] w-24 rounded-sm shadow-md transition-transform duration-300 group-hover:scale-[1.02] border border-border/40"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            asChild
            className="text-xs text-accent hover:text-accent/80 hover:bg-transparent h-auto p-0 mt-0.5"
          >
            <Link href={`/game/${gameId}`} className="flex items-center">
              <Eye className="size-3.5 mr-1" />
              See details
            </Link>
          </Button>
        </div>

        <div className="grid min-w-0 gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 pr-8">
              <h2 className="font-display text-3xl font-black leading-tight text-foreground">
                {entry.game.title}
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <RecommendationMetric
              label="Match"
              value={`${entry.affinityScore}%`}
              className="rounded-xl bg-secondary/20 px-0 py-2 text-center"
              labelClassName="text-[9px] tracking-wider"
              valueClassName="mt-0.5 text-sm"
            />
            <RecommendationMetric
              label="Watch-outs"
              value={`${entry.riskScore}%`}
              className="rounded-xl bg-secondary/20 px-0 py-2 text-center"
              labelClassName="text-[9px] tracking-wider"
              valueClassName="mt-0.5 text-sm"
            />
            <RecommendationMetric
              label="Confidence"
              value={confidenceLabel(entry.confidence)}
              className="rounded-xl bg-secondary/20 px-0 py-2 text-center"
              labelClassName="text-[9px] tracking-wider"
              valueClassName="mt-0.5 text-sm"
            />
          </div>
          <RecommendationReasonList
            reasons={entry.fitReasons}
            fallback="Playfit needs more feedback to explain this pick."
            maxItems={3}
            itemClassName="gap-2"
            markerClassName="mt-1.5"
          />

          <div className="flex flex-col gap-3.5 pt-3 border-t border-border/60">
            <div className="flex flex-wrap gap-2 items-center">
              <Button
                type="button"
                variant="secondary"
                aria-expanded={expandedId === gameId}
                aria-controls={alreadyPlayedPanelId}
                onClick={onToggleAlreadyPlayed}
                className="flex-1 border border-border/60 bg-secondary/50 hover:bg-secondary h-10 rounded-xl text-xs font-bold"
              >
                <CheckCircle2 className="size-4 mr-1.5 text-positive" />
                Already Played It
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onNotForMe(gameId)}
                className="flex-1 border border-border/60 bg-secondary/50 hover:bg-destructive-bg hover:text-destructive h-10 rounded-xl text-xs font-bold"
              >
                <XCircle className="size-4 mr-1.5 text-destructive" />
                No, skip this
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onRemove(gameId)}
                className="flex-1 border border-border/60 bg-secondary/50 hover:bg-destructive-bg hover:text-destructive h-10 rounded-xl text-xs font-bold"
              >
                <Trash2 className="size-4 mr-1.5 text-destructive" />
                Remove Pick
              </Button>
            </div>
          </div>
          <AlreadyPlayedPanel
            id={alreadyPlayedPanelId}
            open={expandedId === gameId}
            onClose={onCloseAlreadyPlayed}
            onSelect={(feedback) => onAlreadyPlayed(gameId, feedback)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
