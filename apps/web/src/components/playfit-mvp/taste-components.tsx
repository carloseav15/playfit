"use client";

import { formatTasteTraitLabel } from "@playfit/core/domain";
import type {
  ProductDecisionFeedback,
  ProductTasteDecision,
  ProductTasteMapTrait,
} from "@playfit/core/types";
import {
  ChevronRight,
  Heart,
  MoreVertical,
  Pencil,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Waves,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { SectionLabel } from "@/components/ui/section-label";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";
import { CoverArt } from "../playfit/cover-art";
import { usePlayfit } from "../playfit/playfit-context";
import { StarRating } from "../playfit/star-rating";
import type { HistoryOrActivityEntry } from "./taste-model";

const decisionLabels: Record<ProductTasteDecision | "picks", string> = {
  setup_favorite: "Setup: Loved",
  setup_miss: "Setup: Missed",
  loved: "Loved",
  liked: "Liked",
  mixed: "Mixed",
  dropped: "Dropped",
  not_for_me: "Not for me",
  picks: "Saved pick",
};

const changeOptions: {
  feedback: ProductDecisionFeedback;
  label: string;
  Icon: typeof Heart;
}[] = [
  { feedback: "played_loved", label: "Loved", Icon: Heart },
  { feedback: "played_liked", label: "Liked", Icon: ThumbsUp },
  { feedback: "played_mixed", label: "Mixed", Icon: Waves },
  { feedback: "played_dropped", label: "Dropped", Icon: ThumbsDown },
  { feedback: "not_for_me", label: "Not for me", Icon: XCircle },
];

function formatDate(value?: string) {
  if (!value) return "Setup signal";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function toneVariant(entry: HistoryOrActivityEntry) {
  if (entry.decision === "picks") return "positive";
  if (entry.tone === "positive") return "positive";
  if (entry.tone === "negative") return "negative";
  return "warning";
}

function wrapText(text: string, maxChars = 12): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (currentLine && `${currentLine} ${word}`.length > maxChars) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? `${currentLine} ${word}` : word;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

export function TasteMap({ traits }: { traits: ProductTasteMapTrait[] }) {
  const maxStrength = Math.max(...traits.map((trait) => trait.strength), 1);

  const radarData = useMemo(() => {
    if (traits.length < 3) return null;

    // Filter positive and negative traits
    const posList = [...traits]
      .filter((t) => t.direction === "positive" && t.strength > 0)
      .sort((a, b) => b.strength - a.strength);

    const negList = [...traits]
      .filter((t) => t.direction === "negative" && t.strength > 0)
      .sort((a, b) => b.strength - a.strength);

    let list: ProductTasteMapTrait[] = [];
    if (negList.length > 0) {
      list = [...posList.slice(0, 4), ...negList.slice(0, 1)];
    } else {
      list = posList.slice(0, 5);
    }

    const n = list.length;
    if (n < 3) return null;

    const maxVal = Math.max(...traits.map((t) => t.strength), 1);
    const center = 120;
    const radius = 62;

    const pointsList = list.map((trait, i) => {
      const angle = (i * 2 * Math.PI) / n - Math.PI / 2;
      const val = (trait.strength / maxVal) * radius;
      const x = center + val * Math.cos(angle);
      const y = center + val * Math.sin(angle);
      return {
        key: `point-${trait.kind}-${trait.id}`,
        x: x.toFixed(1),
        y: y.toFixed(1),
      };
    });

    const points = pointsList.map((pt) => `${pt.x},${pt.y}`).join(" ");

    const spokes = list.map((trait, i) => {
      const angle = (i * 2 * Math.PI) / n - Math.PI / 2;
      const outerX = center + radius * Math.cos(angle);
      const outerY = center + radius * Math.sin(angle);

      // Place label slightly further out: horizontal has 14 units, vertical has 8 units
      const labelX = center + (radius + 14) * Math.cos(angle);
      const labelY = center + (radius + 8) * Math.sin(angle);
      const percentage = Math.round((trait.strength / maxVal) * 100);

      return {
        key: `spoke-${trait.kind}-${trait.id}`,
        label: trait.label,
        direction: trait.direction,
        strength: trait.strength,
        percentage,
        outerX,
        outerY,
        labelX,
        labelY,
        angle,
      };
    });

    const gridLevels = [0.25, 0.5, 0.75, 1.0].map((level) => {
      const pts = list
        .map((_, i) => {
          const angle = (i * 2 * Math.PI) / n - Math.PI / 2;
          const val = level * radius;
          const x = center + val * Math.cos(angle);
          const y = center + val * Math.sin(angle);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
      return {
        key: `grid-${level}`,
        pts,
      };
    });

    return { points, pointsList, spokes, gridLevels, center, list };
  }, [traits]);

  const lovedTraits = useMemo(() => {
    return traits
      .filter((t) => t.positiveCount >= t.negativeCount && (t.positiveCount > 0 || t.strength > 0))
      .sort((a, b) => b.strength - a.strength);
  }, [traits]);

  const avoidedTraits = useMemo(() => {
    return traits
      .filter((t) => t.negativeCount > t.positiveCount)
      .sort((a, b) => b.strength - a.strength);
  }, [traits]);

  const renderPillCloud = (traitsList: ProductTasteMapTrait[], type: "loved" | "avoided") => {
    if (traitsList.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center p-6 border border-dashed border-border/50 rounded-2xl bg-secondary/5 text-muted-foreground/60">
          <p className="text-xs">No signals recorded yet.</p>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-2">
        {traitsList.map((trait) => {
          const isStrong = trait.strength >= maxStrength * 0.6;
          const isMedium =
            trait.strength >= maxStrength * 0.3 && trait.strength < maxStrength * 0.6;

          return (
            <div
              key={`${trait.kind}:${trait.id}`}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs transition-all duration-300 select-none",
                type === "loved"
                  ? "bg-positive/5 border-positive/15 text-positive-foreground/90 hover:bg-positive/10 hover:border-positive/30 hover:shadow-[0_0_10px_rgba(46,213,115,0.1)]"
                  : "bg-negative/5 border-negative/15 text-negative-foreground/90 hover:bg-negative/10 hover:border-negative/30 hover:shadow-[0_0_10px_rgba(255,71,87,0.1)]",
                isStrong && "font-extrabold scale-[1.03] border-opacity-40",
                isMedium && "font-semibold",
                !isStrong && !isMedium && "opacity-75 text-[11px]",
              )}
            >
              <span>{trait.label}</span>
              <span
                className={cn(
                  "text-[8px] font-bold px-1.5 py-0.5 rounded-full border leading-none font-mono",
                  type === "loved"
                    ? "bg-positive/10 border-positive/20 text-positive/90"
                    : "bg-negative/10 border-negative/20 text-negative/90",
                )}
              >
                {trait.strength}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Card className="rounded-3xl border border-border bg-card shadow-lg overflow-hidden">
      <CardHeader>
        <CardTitle className="text-lg font-black text-foreground">Taste Map</CardTitle>
        <CardDescription className="text-xs text-muted-foreground mt-0.5">
          Your Gaming DNA represents scorable preferences calculated from your taste baseline and
          catalog activity.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {traits.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground text-center bg-secondary/60">
            Add more taste decisions to draw a useful map.
          </p>
        ) : (
          <div className="grid gap-6">
            {/* Radar Chart Section */}
            {radarData && (
              <div className="grid gap-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground/60 border-b border-border/40 pb-1">
                  Gaming DNA
                </h4>
                <div className="flex justify-center items-center py-4 bg-secondary/10 rounded-3xl border border-white/5 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent blur-3xl" />
                  <svg
                    viewBox="0 0 240 240"
                    className="w-72 h-72 sm:w-80 sm:h-80 relative z-10 drop-shadow-[0_0_15px_rgba(255,106,61,0.25)]"
                  >
                    <title>Gaming Taste DNA Radar Chart</title>
                    {/* Concentric grid lines background shading */}
                    {radarData.gridLevels.slice(-1).map((grid) => (
                      <polygon
                        key={`${grid.key}-fill`}
                        points={grid.pts}
                        fill="currentColor"
                        className="text-foreground/[0.02] dark:text-white/[0.015]"
                      />
                    ))}

                    {/* Concentric grid lines */}
                    {radarData.gridLevels.map((grid, idx) => (
                      <polygon
                        key={grid.key}
                        points={grid.pts}
                        fill="none"
                        className={cn(
                          idx === radarData.gridLevels.length - 1
                            ? "stroke-border/60"
                            : "stroke-border/30",
                        )}
                        strokeWidth={idx === radarData.gridLevels.length - 1 ? "1" : "0.5"}
                        strokeDasharray={
                          idx === radarData.gridLevels.length - 1 ? undefined : "2,2"
                        }
                      />
                    ))}

                    {/* Spokes */}
                    {radarData.spokes.map((spoke) => {
                      const isNegative = spoke.direction === "negative";
                      return (
                        <line
                          key={spoke.key}
                          x1={radarData.center}
                          y1={radarData.center}
                          x2={spoke.outerX}
                          y2={spoke.outerY}
                          className={cn(isNegative ? "stroke-negative/30" : "stroke-border/20")}
                          strokeWidth={isNegative ? "1.2" : "0.5"}
                        />
                      );
                    })}

                    {/* Scored area polygon background glow */}
                    <polygon
                      points={radarData.points}
                      fill="none"
                      className="stroke-accent/30 blur-[2px]"
                      strokeWidth="4"
                    />

                    {/* Scored area polygon foreground sharp contorno */}
                    <polygon
                      points={radarData.points}
                      fill="url(#radarGlow)"
                      className="stroke-accent"
                      strokeWidth="2"
                    />

                    {/* Data points */}
                    {radarData.pointsList.map((pt, i) => {
                      const trait = radarData.list[i];
                      const isNegative = trait?.direction === "negative";
                      return (
                        <circle
                          key={pt.key}
                          cx={pt.x}
                          cy={pt.y}
                          r={isNegative ? "4.5" : "4"}
                          className={cn(
                            isNegative
                              ? "fill-negative stroke-background shadow-[0_0_10px_rgba(251,113,133,0.6)]"
                              : "fill-accent stroke-background animate-pulse",
                          )}
                          strokeWidth="1.5"
                        />
                      );
                    })}

                    {/* Labels */}
                    {radarData.spokes.map((spoke) => {
                      let textAnchor: "middle" | "start" | "end" = "middle";
                      const cos = Math.cos(spoke.angle);
                      if (cos > 0.1) textAnchor = "start";
                      else if (cos < -0.1) textAnchor = "end";

                      const lines = wrapText(spoke.label, 12);
                      const isNegative = spoke.direction === "negative";
                      const percentageText = `${spoke.percentage}%`;

                      const wrappedLines = [
                        ...lines.map((text, i) => ({
                          id: `${spoke.key}-line-${i}`,
                          text,
                          isFirst: i === 0,
                          isPercentage: false,
                        })),
                        {
                          id: `${spoke.key}-line-percent`,
                          text: percentageText,
                          isFirst: false,
                          isPercentage: true,
                        },
                      ];

                      const startDy = `${-(wrappedLines.length - 1) * 0.6}em`;

                      return (
                        <text
                          key={spoke.key}
                          x={spoke.labelX}
                          y={spoke.labelY + 3}
                          textAnchor={textAnchor}
                          className="font-sans text-[8.5px] font-black uppercase tracking-wider select-none"
                        >
                          {wrappedLines.map((line) => (
                            <tspan
                              key={line.id}
                              x={spoke.labelX}
                              dy={line.isFirst ? startDy : "1.2em"}
                              className={cn(
                                line.isPercentage
                                  ? isNegative
                                    ? "fill-negative font-mono text-[7.5px]"
                                    : "fill-accent font-mono text-[7.5px]"
                                  : isNegative
                                    ? "fill-negative"
                                    : "fill-foreground/90",
                              )}
                            >
                              {isNegative && line.isFirst ? `✖ ${line.text}` : line.text}
                            </tspan>
                          ))}
                        </text>
                      );
                    })}

                    <defs>
                      <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                        <stop
                          offset="0%"
                          stopColor="var(--color-accent, #ff6a3d)"
                          stopOpacity="0.1"
                        />
                        <stop
                          offset="100%"
                          stopColor="var(--color-accent, #ff6a3d)"
                          stopOpacity="0.4"
                        />
                      </radialGradient>
                    </defs>
                  </svg>
                </div>
              </div>
            )}

            {/* Pillars/Clouds Section */}
            <div className="grid gap-6 md:grid-cols-2">
              <div className="grid gap-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-positive border-b border-border/40 pb-1">
                  Loved Pillars
                </h4>
                {renderPillCloud(lovedTraits, "loved")}
              </div>
              <div className="grid gap-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-negative border-b border-border/40 pb-1">
                  Avoided Signals
                </h4>
                {renderPillCloud(avoidedTraits, "avoided")}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChangeSignalPanel({
  id,
  onSelect,
}: {
  id?: string;
  onSelect: (feedback: ProductDecisionFeedback) => void;
}) {
  return (
    <div
      id={id}
      className="grid gap-2.5 rounded-2xl border border-border/60 bg-secondary/50 p-4 animate-in fade-in slide-in-from-top-2 duration-300"
    >
      <SectionLabel className="text-[10px] font-bold text-accent uppercase tracking-wider">
        Change taste signal
      </SectionLabel>
      <Stack direction="row" wrap gap={2}>
        {changeOptions.map(({ feedback, label, Icon }) => (
          <Button
            key={feedback}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelect(feedback)}
            className="text-xs border-border bg-card hover:bg-secondary rounded-xl"
          >
            <Icon className="size-4 mr-1 text-accent" />
            {label}
          </Button>
        ))}
      </Stack>
    </div>
  );
}

function ManageSignalDialog({
  open,
  onClose,
  title,
  isPick,
  onToggleChange,
  onRemove,
  gameId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  isPick: boolean;
  onToggleChange: () => void;
  onRemove: () => void;
  gameId: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      eyebrow="Manage Signal"
      className="max-w-sm"
    >
      <div className="grid gap-2 pt-2">
        {isPick ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onRemove();
              onClose();
            }}
            className="w-full h-12 rounded-xl text-xs font-bold justify-start px-4 text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-4 mr-2.5" />
            Remove Pick
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onToggleChange();
                onClose();
              }}
              className="w-full h-12 rounded-xl text-xs font-bold justify-start px-4"
            >
              <Pencil className="size-4 mr-2.5 text-accent" />
              Change Signal
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                onRemove();
                onClose();
              }}
              className="w-full h-12 rounded-xl text-xs font-bold justify-start px-4 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4 mr-2.5" />
              Delete Signal
            </Button>
          </>
        )}
        <Button
          type="button"
          variant="secondary"
          asChild
          className="w-full h-12 rounded-xl text-xs font-bold justify-start px-4"
        >
          <Link href={`/play/game/${gameId}`} onClick={onClose}>
            <ChevronRight className="size-4 mr-2.5 text-muted-foreground" />
            See Details
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="w-full h-12 rounded-xl text-xs font-bold mt-2"
        >
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}

function ChangeSignalDialog({
  open,
  onClose,
  title,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  onSelect: (feedback: ProductDecisionFeedback) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="How did it land?"
      eyebrow={`Change Signal - ${title}`}
      className="max-w-md"
    >
      <div className="grid gap-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Select a new taste signal to update your recommendations footprint.
        </p>
        <Stack direction="row" wrap gap={3} className="justify-between pt-2">
          {changeOptions.map(({ feedback, label, Icon }) => (
            <Button
              key={feedback}
              type="button"
              variant="outline"
              onClick={() => {
                onSelect(feedback);
              }}
              className="flex-1 flex flex-col items-center justify-center gap-2.5 p-5 h-24 rounded-2xl border border-border/50 bg-secondary/30 hover:bg-accent/10 hover:border-accent/20 text-foreground transition-all duration-300 active:scale-[0.97]"
            >
              <Icon className="size-6 text-accent" />
              <span className="text-[11px] font-black uppercase tracking-wider">{label}</span>
            </Button>
          ))}
        </Stack>
      </div>
    </Dialog>
  );
}

function TasteHistoryRow({
  entry,
  changing,
  onToggleChange,
  onChange,
  onRemove,
}: {
  entry: HistoryOrActivityEntry;
  changing: boolean;
  onToggleChange: () => void;
  onChange: (feedback: ProductDecisionFeedback) => void;
  onRemove: () => void;
}) {
  const { getSeedGame } = usePlayfit();
  const game = getSeedGame(entry.gameId);
  const changePanelId = `change-signal-${entry.gameId}`;
  const [menuOpen, setMenuOpen] = useState(false);

  if (!game) return null;

  const isPick = entry.decision === "picks";

  return (
    <>
      {/* Desktop Card Layout */}
      <div className="hidden md:block rounded-2xl border border-border/60 bg-secondary/40 p-4 transition-all duration-300 hover:bg-secondary hover:border-border">
        <div className="grid grid-cols-[3.25rem_1fr] gap-3.5 md:grid-cols-[3.25rem_1fr_auto] md:items-center">
          <CoverArt
            game={game}
            className="aspect-[2/3] w-12 rounded-sm shadow-md border border-border/40 shrink-0"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={toneVariant(entry)}
                className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
              >
                {decisionLabels[entry.decision]}
              </Badge>
              <span className="text-[10px] text-muted-foreground font-mono">
                {formatDate(entry.updatedAt)}
              </span>
            </div>
            <p className="mt-1.5 truncate text-sm font-extrabold text-foreground">{entry.title}</p>
            {entry.rating != null && entry.rating > 0 ? (
              <div className="mt-1">
                <StarRating value={entry.rating} readOnly />
              </div>
            ) : null}
            <Stack direction="row" wrap gap={2} className="mt-2.5">
              {(entry.traits ?? []).slice(0, 4).map((trait) => (
                <Badge
                  key={trait}
                  variant="outline"
                  className="border-border/60 bg-secondary/50 text-[9px] font-bold py-0 px-2 text-muted-foreground/80"
                >
                  {formatTasteTraitLabel(trait)}
                </Badge>
              ))}
            </Stack>
          </div>
          <Stack
            direction="row"
            wrap
            gap={2}
            className="md:justify-end shrink-0 ml-auto md:ml-0 pt-2 md:pt-0"
          >
            {isPick ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRemove}
                className="h-8 text-xs rounded-xl hover:text-destructive hover:bg-destructive/5"
              >
                <Trash2 className="size-3.5 mr-1" />
                Remove
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  aria-expanded={changing}
                  aria-controls={changePanelId}
                  onClick={onToggleChange}
                  className="h-8 text-xs rounded-xl"
                >
                  <Pencil className="size-3.5 mr-1" />
                  Change
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRemove}
                  className="h-8 text-xs rounded-xl hover:text-destructive hover:bg-destructive/5"
                >
                  <Trash2 className="size-3.5 mr-1" />
                  Delete
                </Button>
              </>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              asChild
              className="h-8 text-xs hover:text-accent rounded-xl"
            >
              <Link href={`/play/game/${entry.gameId}`}>
                Details
                <ChevronRight className="size-3.5 ml-0.5" />
              </Link>
            </Button>
          </Stack>
        </div>
        {changing ? (
          <div className="mt-3">
            <ChangeSignalPanel id={changePanelId} onSelect={onChange} />
          </div>
        ) : null}
      </div>

      {/* Mobile Compact Row Layout */}
      <div className="flex md:hidden items-center justify-between p-3 bg-card border border-border rounded-2xl hover:border-border/80 transition-all gap-3 w-full min-w-0">
        <Link
          href={`/play/game/${entry.gameId}`}
          className="flex items-center gap-3 min-w-0 flex-1"
        >
          <CoverArt
            game={game}
            className="aspect-[2/3] w-12 rounded-lg shadow-sm border border-border/40 shrink-0"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Badge
                variant={toneVariant(entry)}
                className="px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider"
              >
                {decisionLabels[entry.decision]}
              </Badge>
              <span className="text-[9px] text-muted-foreground font-mono">
                {formatDate(entry.updatedAt)}
              </span>
            </div>
            <h3 className="font-display text-base font-black text-foreground truncate mt-1 leading-tight">
              {entry.title}
            </h3>
            {entry.rating != null && entry.rating > 0 && (
              <div className="mt-0.5 scale-75 origin-left animate-in fade-in duration-200">
                <StarRating value={entry.rating} readOnly />
              </div>
            )}
          </div>
        </Link>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => setMenuOpen(true)}
          className="size-10 rounded-full shrink-0 text-muted-foreground hover:text-foreground hover:bg-secondary/40"
          aria-label="Manage signal"
        >
          <MoreVertical className="size-5" />
        </Button>

        <ManageSignalDialog
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          title={entry.title}
          isPick={isPick}
          onToggleChange={onToggleChange}
          onRemove={onRemove}
          gameId={entry.gameId}
        />

        <ChangeSignalDialog
          open={changing}
          onClose={onToggleChange}
          title={game.title}
          onSelect={onChange}
        />
      </div>
    </>
  );
}

export function TasteHistory({
  entries,
  changingId,
  onToggleChange,
  onChange,
  onRemove,
}: {
  entries: HistoryOrActivityEntry[];
  changingId: string | null;
  onToggleChange: (gameId: string) => void;
  onChange: (entry: HistoryOrActivityEntry, feedback: ProductDecisionFeedback) => void;
  onRemove: (entry: HistoryOrActivityEntry) => void;
}) {
  const [activeTab, setActiveTab] = useState<"all" | "active" | "taste">("all");
  const [page, setPage] = useState(1);

  const filteredEntries = useMemo(() => {
    if (activeTab === "active") {
      return entries.filter((entry) => entry.decision === "picks");
    }
    if (activeTab === "taste") {
      return entries.filter((entry) => entry.decision !== "picks");
    }
    return entries;
  }, [entries, activeTab]);

  const itemsPerPage = 5;
  const totalItems = filteredEntries.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  const paginatedEntries = useMemo(() => {
    const startIndex = (page - 1) * itemsPerPage;
    return filteredEntries.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredEntries, page]);

  const allCount = entries.length;
  const activeCount = entries.filter((entry) => entry.decision === "picks").length;
  const tasteCount = entries.filter((entry) => entry.decision !== "picks").length;

  return (
    <Card className="rounded-3xl border border-border bg-card shadow-lg">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-4">
        <div className="grid gap-1">
          <CardTitle className="text-lg font-black text-foreground">Decisions & Activity</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Manage your saved picks and historical preferences.
          </CardDescription>
        </div>
        <div className="flex gap-1 bg-secondary/60 p-1 rounded-2xl border border-border/60 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-none w-full sm:w-auto max-w-full">
          <button
            type="button"
            onClick={() => {
              setActiveTab("all");
              setPage(1);
            }}
            className={cn(
              "h-8 px-3 text-xs rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap flex-1 sm:flex-initial",
              activeTab === "all"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            All <span className="opacity-50 text-[10px] font-mono">({allCount})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("active");
              setPage(1);
            }}
            className={cn(
              "h-8 px-3 text-xs rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap flex-1 sm:flex-initial",
              activeTab === "active"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Picks <span className="opacity-50 text-[10px] font-mono">({activeCount})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("taste");
              setPage(1);
            }}
            className={cn(
              "h-8 px-3 text-xs rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap flex-1 sm:flex-initial",
              activeTab === "taste"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Preferences <span className="opacity-50 text-[10px] font-mono">({tasteCount})</span>
          </button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-6">
        {paginatedEntries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground text-center bg-secondary/60">
            {activeTab === "active"
              ? "No saved picks yet. Save a recommendation when it matches your gaming criteria."
              : activeTab === "taste"
                ? "No preferences yet. Use onboarding or rate how a game landed."
                : "No decisions or activity yet. Set up your taste or save recommendations."}
          </p>
        ) : (
          <div className="grid gap-3">
            {paginatedEntries.map((entry) => (
              <TasteHistoryRow
                key={`${entry.source}:${entry.gameId}`}
                entry={entry}
                changing={changingId === entry.gameId}
                onToggleChange={() => onToggleChange(entry.gameId)}
                onChange={(feedback) => onChange(entry, feedback)}
                onRemove={() => onRemove(entry)}
              />
            ))}
          </div>
        )}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-border/60 pt-4">
            <span className="text-xs text-muted-foreground font-mono">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 text-xs border-border hover:bg-secondary rounded-xl"
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-8 text-xs border-border hover:bg-secondary rounded-xl"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
