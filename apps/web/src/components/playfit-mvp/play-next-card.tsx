"use client";

import type { RankedSeedGame } from "@playfit/core/types";
import { Dices, Eye, ListPlus, Play, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";
import { CoverArt } from "../playfit/cover-art";
import { Metric } from "../playfit/metric";
import {
  confidenceLabel,
  decisionLabel,
  decisionTone,
  formatGameDescriptor,
} from "../playfit/product-utils";

const reasonOptions = ["Wrong mood", "Too long", "Too hard", "Not my genre"];

function ReasonList({
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
    <div className="rounded-md border border-border bg-secondary p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        {title}
      </p>
      <ul className="grid gap-1.5 text-sm text-foreground">
        {visibleReasons.slice(0, 3).map((reason) => (
          <li key={reason} className="flex gap-2">
            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-current" />
            <span>{reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlayNextCard({
  entry,
  primary = false,
  onPlay,
  onLater,
  onNotForMe,
  onShowAnother,
  onReason,
}: {
  entry: RankedSeedGame;
  primary?: boolean;
  onPlay: () => void;
  onLater: () => void;
  onNotForMe: () => void;
  onShowAnother?: () => void;
  onReason?: (reason: string) => void;
}) {
  const [showReasonPicker, setShowReasonPicker] = useState(false);
  const tone = decisionTone(entry);
  const label = decisionLabel(entry);

  function markNotForMe() {
    onNotForMe();
    setShowReasonPicker(true);
  }

  return (
    <Card
      className={cn(
        "min-w-0 overflow-hidden",
        primary &&
          "border-[color-mix(in_srgb,var(--accent),transparent_58%)] bg-[color-mix(in_srgb,var(--card),var(--accent)_7%)]",
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
                  "font-display font-extrabold leading-tight",
                  primary ? "text-3xl" : "text-xl",
                )}
              >
                {entry.game.title}
              </h2>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <Metric label="Match" value={entry.affinityScore} />
              <Metric label="Watch-outs" value={entry.riskScore} />
              <Metric label="Confidence" value={confidenceLabel(entry.confidence)} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <ReasonList
                title="Why"
                reasons={entry.fitReasons}
                fallback="Playfit needs a little more feedback before making a strong claim."
              />
              <ReasonList
                title="Watch-outs"
                reasons={entry.cautionReasons}
                fallback="No major watch-out yet."
              />
            </div>
          </div>
        </div>
        <Stack direction="row" wrap gap={2}>
          <Button type="button" onClick={onPlay}>
            <Play className="size-4" />
            I&apos;ll play this
          </Button>
          <Button type="button" variant="secondary" onClick={onLater}>
            <ListPlus className="size-4" />
            Maybe later
          </Button>
          <Button type="button" variant="secondary" onClick={markNotForMe}>
            <XCircle className="size-4" />
            Not for me
          </Button>
          {onShowAnother ? (
            <Button type="button" variant="secondary" onClick={onShowAnother}>
              <Dices className="size-4" />
              Show another
            </Button>
          ) : null}
          <Button type="button" variant="ghost" asChild>
            <Link href={`/play/game/${entry.game.gameId}`}>
              <Eye className="size-4" />
              See why
            </Link>
          </Button>
        </Stack>
        {showReasonPicker ? (
          <div className="grid gap-2 rounded-md border border-border bg-secondary p-3">
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
