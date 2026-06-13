"use client";

import type { ProductPlayStatus, RankedSeedGame, SeedGame } from "@playfit/core/types";
import { motion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { IconBadge } from "@/components/ui/icon-badge";

import { CoverArt } from "./cover-art";
import { usePlayfit } from "./playfit-context";
import {
  decisionIcons,
  decisionLabel,
  decisionTone,
  primaryReason,
  statusBadgeTone,
  statusIconMap,
  statusOptions,
} from "./product-utils";

export function CarouselCard({
  game,
  entry,
  rank,
  status,
}: {
  game: SeedGame;
  entry?: RankedSeedGame | null;
  rank?: number;
  status?: ProductPlayStatus;
}) {
  const { openDossier } = usePlayfit();

  const tone = entry ? decisionTone(entry) : null;
  const DecisionIcon = tone ? decisionIcons[tone] : null;
  const StatusIcon = status ? statusIconMap[status] : null;
  const statusLabel = status ? statusOptions.find((s) => s.value === status)?.label : null;

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.18 }}
      onClick={() => openDossier(game.gameId)}
      className="w-56 shrink-0 snap-start cursor-pointer rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Open ${game.title} details`}
    >
      <div className="relative">
        <CoverArt game={game} className="aspect-[2/3]" decorative />
        {rank != null && (
          <span className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-background/80 text-xs font-bold backdrop-blur-sm">
            {rank}
          </span>
        )}
        {tone && DecisionIcon && entry != null && (
          <span
            className="absolute right-1.5 top-1.5 flex items-center gap-1"
            title={`${decisionLabel(entry)}${status && statusLabel ? ` · ${statusLabel}` : ""}`}
          >
            <IconBadge tone={tone}>
              <DecisionIcon className="size-3.5" />
            </IconBadge>
            {StatusIcon && status && (
              <IconBadge tone={statusBadgeTone[status]}>
                <StatusIcon className="size-3.5" />
              </IconBadge>
            )}
          </span>
        )}
      </div>
      <div className="mt-1.5 grid gap-1">
        <div className="flex items-start justify-between gap-2">
          <p className="min-h-10 overflow-hidden text-sm font-medium leading-tight">{game.title}</p>
          {entry && <Badge variant={decisionTone(entry)}>{decisionLabel(entry)}</Badge>}
        </div>
        {entry && (
          <p className="overflow-hidden text-xs text-muted-foreground">{primaryReason(entry)}</p>
        )}
        {entry?.cautionReasons[0] && (
          <p className="text-[11px] text-muted-foreground">{entry.cautionReasons[0]}</p>
        )}
      </div>
    </motion.button>
  );
}
