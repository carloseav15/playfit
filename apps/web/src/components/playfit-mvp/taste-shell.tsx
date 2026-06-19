"use client";

import { buildTasteModel, formatTasteTraitLabel } from "@playfit/core/domain";
import type {
  ProductDecisionFeedback,
  ProductPlatformOption,
  ProductTasteDecision,
  ProductTasteMapTrait,
  ProductTasteSignalSource,
} from "@playfit/core/types";
import {
  ArrowLeft,
  ChevronRight,
  Gamepad2,
  Heart,
  History,
  Laptop,
  Layers,
  MoreVertical,
  Pencil,
  Play,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Tv,
  Waves,
  XCircle,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Container } from "@/components/ui/container";
import { Dialog } from "@/components/ui/dialog";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack } from "@/components/ui/stack";
import { ensureGamesCached } from "@/lib/game-cache";
import { cn } from "@/lib/utils";
import { CoverArt } from "../playfit/cover-art";
import { useHeader } from "../playfit/header-context";
import { usePlayfit } from "../playfit/playfit-context";
import { StarRating } from "../playfit/star-rating";
import { StatusToast } from "../playfit/status-toast";
import { TasteMapVisualizer } from "./taste-map-visualizer";
import {
  buildHistoryAndActivityEntries,
  getMissingGameIds,
  getSeedGamesById,
  getTasteGameIds,
  type HistoryOrActivityEntry,
} from "./taste-model";
import { useTodayRecommendations } from "./use-today-recommendations";

const decisionLabels: Record<ProductTasteDecision | "playing" | "picks", string> = {
  setup_favorite: "Setup: Loved",
  setup_miss: "Setup: Missed",
  loved: "Loved",
  liked: "Liked",
  mixed: "Mixed",
  dropped: "Dropped",
  not_for_me: "Not for me",
  playing: "Playing",
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
  if (entry.decision === "playing") return "info";
  if (entry.decision === "picks") return "positive";
  if (entry.tone === "positive") return "positive";
  if (entry.tone === "negative") return "negative";
  return "warning";
}

const tastePlatformCurrentIds = new Set([
  "switch_1",
  "switch_2",
  "ps5",
  "xbox_series_xs",
  "pc",
  "macos",
  "linux",
  "cups",
]);

const tastePlatformRetroIds = new Set([
  "atari_2600",
  "dreamcast",
  "ds",
  "game_gear",
  "gamecube",
  "gb",
  "gba",
  "gbc",
  "genesis",
  "n64",
  "neo_geo",
  "nes",
  "ps1",
  "ps2",
  "ps3",
  "psp",
  "saturn",
  "sega_master_system",
  "snes",
  "wii",
  "wii_u",
  "xbox_360",
  "xbox_original",
]);

const tastePlatformPresets: Array<{
  id: string;
  label: string;
  description: string;
  matches: (platform: ProductPlatformOption) => boolean;
  Icon: typeof Gamepad2;
}> = [
  {
    id: "current",
    label: "Current systems",
    description: "Modern consoles and computers.",
    matches: (p) => tastePlatformCurrentIds.has(p.platformId),
    Icon: Gamepad2,
  },
  {
    id: "nintendo",
    label: "Nintendo",
    description: "Switch, handhelds, and classic Nintendo.",
    matches: (p) => p.family === "nintendo",
    Icon: Gamepad2,
  },
  {
    id: "playstation",
    label: "PlayStation",
    description: "Sony home and handheld systems.",
    matches: (p) => p.family === "playstation",
    Icon: Gamepad2,
  },
  {
    id: "xbox",
    label: "Xbox",
    description: "Xbox generations and current consoles.",
    matches: (p) => p.family === "xbox",
    Icon: Gamepad2,
  },
  {
    id: "pc",
    label: "PC",
    description: "Desktop and computer platforms.",
    matches: (p) => p.family === "pc" || p.kind === "computer",
    Icon: Laptop,
  },
  {
    id: "retro",
    label: "Retro",
    description: "Older consoles and handhelds.",
    matches: (p) =>
      tastePlatformRetroIds.has(p.platformId) || ["sega", "atari", "snk"].includes(p.family),
    Icon: Tv,
  },
];

const tastePlatformFamilies = ["nintendo", "playstation", "xbox", "sega", "pc", "other"];
const tastePlatformFamilyLabels: Record<string, string> = {
  nintendo: "Nintendo",
  playstation: "PlayStation",
  xbox: "Xbox",
  sega: "SEGA",
  pc: "PC",
  other: "Other",
};

function formatTastePlatformFamily(family: string) {
  return (
    tastePlatformFamilyLabels[family] ??
    family
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

export function PlatformsTabContent() {
  const { state, seedData, updateState } = usePlayfit();
  const selectedIds = new Set(state.user.onboarding.platforms.map((p) => p.platformId));
  const viewPagerRef = useRef<HTMLDivElement>(null);
  const [activeFamily, setActiveFamily] = useState("nintendo");

  // TabLayout -> ViewPager synchronization
  const handleTabClick = (family: string, index: number) => {
    setActiveFamily(family);
    if (viewPagerRef.current) {
      const width = viewPagerRef.current.clientWidth;
      viewPagerRef.current.scrollTo({
        left: index * width,
        behavior: "smooth",
      });
    }
  };

  // ViewPager -> TabLayout synchronization
  const handleViewPagerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const index = Math.round(container.scrollLeft / container.clientWidth);
    const targetFamily = tastePlatformFamilies[index];
    if (targetFamily && targetFamily !== activeFamily) {
      setActiveFamily(targetFamily);
    }
  };

  const renderPlatformFamilyPane = (family: string, layout: "mobile" | "desktop") => {
    const group = seedData.platforms
      .filter((p) => p.family === family)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (group.length === 0) return null;
    const label = formatTastePlatformFamily(family);
    const consoles = group.filter((p) => p.kind !== "handheld");
    const handhelds = group.filter((p) => p.kind === "handheld");

    return (
      <div
        key={family}
        className={cn(
          "grid gap-3",
          layout === "mobile" ? "w-full shrink-0 snap-center pb-2 px-1" : "pt-3 first:pt-0",
        )}
      >
        {layout === "desktop" && label && (
          <p className="text-xs font-bold uppercase tracking-wide text-accent">{label}</p>
        )}

        {consoles.length > 0 && (
          <div>
            {handhelds.length > 0 && (
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Console / Hybrid
              </p>
            )}
            <div className="grid gap-3 grid-cols-2">
              {consoles.map((platform) => {
                const checked = selectedIds.has(platform.platformId);
                return (
                  <Checkbox
                    key={platform.platformId}
                    id={`${layout}-taste-plat-${platform.platformId}`}
                    checked={checked}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      updateState((next) => {
                        next.user.onboarding.platforms = next.user.onboarding.platforms.filter(
                          (p) => p.platformId !== platform.platformId,
                        );
                        if (isChecked) {
                          next.user.onboarding.platforms.push({
                            platformId: platform.platformId,
                            status: "available",
                          });
                        }
                      });
                    }}
                    label={platform.displayName}
                  />
                );
              })}
            </div>
          </div>
        )}

        {handhelds.length > 0 && (
          <div className="pt-2">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Handheld
            </p>
            <div className="grid gap-3 grid-cols-2">
              {handhelds.map((platform) => {
                const checked = selectedIds.has(platform.platformId);
                return (
                  <Checkbox
                    key={platform.platformId}
                    id={`${layout}-taste-plat-hh-${platform.platformId}`}
                    checked={checked}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      updateState((next) => {
                        next.user.onboarding.platforms = next.user.onboarding.platforms.filter(
                          (p) => p.platformId !== platform.platformId,
                        );
                        if (isChecked) {
                          next.user.onboarding.platforms.push({
                            platformId: platform.platformId,
                            status: "available",
                          });
                        }
                      });
                    }}
                    label={platform.displayName}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="rounded-3xl border border-border bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg font-black text-foreground">Your Platforms</CardTitle>
        <CardDescription className="text-xs text-muted-foreground mt-0.5">
          Recommendations are only shown for games available on your active platforms. Changes save
          automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {/* Quick Groups */}
        <div className="grid gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Quick Groups
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tastePlatformPresets.map((preset) => {
              const presetPlatforms = seedData.platforms.filter(preset.matches);
              const presetIds = presetPlatforms.map((p) => p.platformId);
              const selectedCount = presetIds.filter((id) => selectedIds.has(id)).length;
              const selected = presetIds.length > 0 && selectedCount === presetIds.length;
              const partiallySelected = selectedCount > 0 && !selected;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={presetIds.length === 0}
                  className={cn(
                    "group grid min-h-28 content-between gap-3 rounded-2xl border border-border/60 bg-secondary/60 p-4 text-left transition-all duration-300 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    selected &&
                      "border-accent/40 bg-accent/10 shadow-[0_0_20px_rgba(255,106,61,0.1)]",
                  )}
                  onClick={() => {
                    updateState((next) => {
                      if (selected) {
                        next.user.onboarding.platforms = next.user.onboarding.platforms.filter(
                          (p) => !presetIds.includes(p.platformId),
                        );
                      } else {
                        const cur = new Set(
                          next.user.onboarding.platforms.map((p) => p.platformId),
                        );
                        for (const id of presetIds) {
                          if (!cur.has(id)) {
                            next.user.onboarding.platforms.push({
                              platformId: id,
                              status: "available",
                            });
                          }
                        }
                      }
                    });
                  }}
                >
                  <div className="flex items-start justify-between gap-2.5 w-full">
                    <span className="min-w-0">
                      <strong className="block text-sm font-extrabold text-foreground group-hover:text-accent transition-colors">
                        {preset.label}
                      </strong>
                      <span className="mt-1.5 block text-xs leading-relaxed text-muted-foreground line-clamp-2">
                        {preset.description}
                      </span>
                    </span>
                    <div
                      className={cn(
                        "size-8 shrink-0 rounded-xl grid place-items-center border border-border/60 bg-secondary/60 text-muted-foreground group-hover:text-foreground transition-all duration-300",
                        selected &&
                          "border-accent/30 bg-accent/10 text-accent group-hover:text-accent",
                      )}
                    >
                      <preset.Icon className="size-4" />
                    </div>
                  </div>
                  <span
                    className={cn(
                      "text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/60 transition-colors",
                      selected && "text-accent",
                      partiallySelected && "text-foreground",
                    )}
                  >
                    {selected
                      ? "Selected"
                      : partiallySelected
                        ? `${selectedCount} of ${presetIds.length}`
                        : `${presetIds.length} systems`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/60 bg-secondary/40 p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{state.user.onboarding.platforms.length}</strong>{" "}
            systems selected for Play Next.
          </p>
        </div>

        {/* Mobile Swipe ViewPager Layout */}
        <div className="flex flex-col gap-4 md:hidden">
          {/* TabLayout Header */}
          <div className="flex overflow-x-auto scrollbar-none border-b border-border/60 pb-1.5 gap-4 relative shrink-0">
            {tastePlatformFamilies.map((family, idx) => (
              <button
                key={family}
                type="button"
                onClick={() => handleTabClick(family, idx)}
                className={cn(
                  "relative pb-2 text-[10px] font-bold uppercase tracking-wider transition-colors shrink-0",
                  activeFamily === family ? "text-accent" : "text-muted-foreground",
                )}
              >
                {formatTastePlatformFamily(family)}
                {activeFamily === family && (
                  <motion.div
                    layoutId="activePlatformTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* ViewPager Content Container */}
          <div
            ref={viewPagerRef}
            onScroll={handleViewPagerScroll}
            className="flex w-full overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth"
          >
            {tastePlatformFamilies.map((family) => renderPlatformFamilyPane(family, "mobile"))}
          </div>
        </div>

        {/* Desktop Vertical Accordion/Grid Layout */}
        <div className="hidden md:grid gap-4 divide-y divide-border">
          {tastePlatformFamilies.map((family) => renderPlatformFamilyPane(family, "desktop"))}
        </div>
      </CardContent>
    </Card>
  );
}

function TasteMap({ traits }: { traits: ProductTasteMapTrait[] }) {
  const maxStrength = Math.max(...traits.map((trait) => trait.strength), 1);

  const genres = traits.filter((t) => t.kind === "genre");
  const tags = traits.filter((t) => t.kind === "tag");

  const renderTraitSection = (title: string, sectionTraits: ProductTasteMapTrait[]) => {
    if (sectionTraits.length === 0) return null;
    return (
      <div className="grid gap-3">
        <h3 className="text-xs font-black uppercase tracking-wider text-accent border-b border-border/60 pb-1 mt-1">
          {title}
        </h3>
        <div className="grid gap-3.5">
          {sectionTraits.map((trait) => {
            const negativeWidth = `${(trait.negativeCount / maxStrength) * 100}%`;
            const positiveWidth = `${(trait.positiveCount / maxStrength) * 100}%`;
            return (
              <div
                key={`${trait.kind}:${trait.id}`}
                className="grid gap-2 p-3.5 rounded-2xl bg-secondary/50 border border-border/60 transition-all duration-300 hover:bg-secondary hover:border-border"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm font-extrabold text-foreground">{trait.label}</strong>
                  <Badge
                    variant={
                      trait.direction === "positive"
                        ? "positive"
                        : trait.direction === "negative"
                          ? "negative"
                          : "secondary"
                    }
                    className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5"
                  >
                    {trait.confidence}
                  </Badge>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-4 mt-1">
                  <div
                    className="h-4 overflow-hidden rounded-full bg-secondary/60 relative"
                    role="progressbar"
                    aria-valuenow={trait.negativeCount}
                    aria-valuemin={0}
                    aria-valuemax={maxStrength}
                    aria-label={`${trait.label} steer away: ${trait.negativeCount}`}
                  >
                    <div
                      className="ml-auto h-full rounded-full bg-gradient-to-l from-negative to-negative/60 transition-all duration-500 ease-out"
                      style={{ width: negativeWidth }}
                    />
                  </div>
                  <span className="h-6 w-px bg-border" />
                  <div
                    className="h-4 overflow-hidden rounded-full bg-secondary/60 relative"
                    role="progressbar"
                    aria-valuenow={trait.positiveCount}
                    aria-valuemin={0}
                    aria-valuemax={maxStrength}
                    aria-label={`${trait.label} lean toward: ${trait.positiveCount}`}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-positive to-positive/60 transition-all duration-500 ease-out"
                      style={{ width: positiveWidth }}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-4 text-[10px] font-mono text-muted-foreground">
                  <span className="text-right font-extrabold text-negative/90">
                    {trait.negativeCount}
                  </span>
                  <span className="text-muted-foreground/60 text-center">signals</span>
                  <span className="font-extrabold text-positive/90">{trait.positiveCount}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card className="rounded-3xl border border-border bg-card shadow-lg overflow-hidden">
      <CardHeader>
        <CardTitle className="text-lg font-black text-foreground">Taste Map</CardTitle>
        <CardDescription className="text-xs text-muted-foreground mt-0.5">
          Positive signals come from loved/liked games. Watch-outs come from dropped/not-for-me
          games.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-4 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.15em] text-muted-foreground border-b border-border pb-2">
          <span className="text-right text-negative">Steer away</span>
          <span className="opacity-40 px-1">Neutral</span>
          <span className="text-positive">Lean toward</span>
        </div>
        {traits.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-5 text-sm text-muted-foreground text-center bg-secondary/60">
            Add more taste decisions to draw a useful map.
          </p>
        ) : (
          <div className="grid gap-6">
            {renderTraitSection("Genres", genres)}
            {renderTraitSection("Tags", tags)}
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
  isPlaying,
  isPick,
  onToggleChange,
  onRemove,
  onStart,
  gameId,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  isPlaying: boolean;
  isPick: boolean;
  onToggleChange: () => void;
  onRemove: () => void;
  onStart?: () => void;
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
        {isPlaying ? (
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
              Complete Run
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
              Stop Playing
            </Button>
          </>
        ) : isPick ? (
          <>
            {onStart && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  onStart();
                  onClose();
                }}
                className="w-full h-12 rounded-xl text-xs font-bold justify-start px-4"
              >
                <Play className="size-4 mr-2.5 text-accent" />
                Start Playing
              </Button>
            )}
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
          </>
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
  onStart,
}: {
  entry: HistoryOrActivityEntry;
  changing: boolean;
  onToggleChange: () => void;
  onChange: (feedback: ProductDecisionFeedback) => void;
  onRemove: () => void;
  onStart?: () => void;
}) {
  const { getSeedGame } = usePlayfit();
  const game = getSeedGame(entry.gameId);
  const changePanelId = `change-signal-${entry.gameId}`;
  const [menuOpen, setMenuOpen] = useState(false);

  if (!game) return null;

  const isPlaying = entry.decision === "playing";
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
              {entry.traits.slice(0, 4).map((trait) => (
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
            {isPlaying ? (
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
                  Complete
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onRemove}
                  className="h-8 text-xs rounded-xl hover:text-destructive hover:bg-destructive/5"
                >
                  <Trash2 className="size-3.5 mr-1" />
                  Stop
                </Button>
              </>
            ) : isPick ? (
              <>
                {onStart && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={onStart}
                    className="h-8 text-xs rounded-xl bg-accent text-accent-foreground hover:bg-accent/90"
                  >
                    <Play className="size-3.5 mr-1" />
                    Start
                  </Button>
                )}
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
              </>
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
          isPlaying={isPlaying}
          isPick={isPick}
          onToggleChange={onToggleChange}
          onRemove={onRemove}
          onStart={onStart}
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

function TasteHistory({
  entries,
  changingId,
  onToggleChange,
  onChange,
  onRemove,
  onStart,
}: {
  entries: HistoryOrActivityEntry[];
  changingId: string | null;
  onToggleChange: (gameId: string) => void;
  onChange: (entry: HistoryOrActivityEntry, feedback: ProductDecisionFeedback) => void;
  onRemove: (entry: HistoryOrActivityEntry) => void;
  onStart: (gameId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"all" | "active" | "taste">("all");
  const [page, setPage] = useState(1);

  const filteredEntries = useMemo(() => {
    if (activeTab === "active") {
      return entries.filter((entry) => entry.decision === "playing" || entry.decision === "picks");
    }
    if (activeTab === "taste") {
      return entries.filter((entry) => entry.decision !== "playing" && entry.decision !== "picks");
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
  const activeCount = entries.filter(
    (entry) => entry.decision === "playing" || entry.decision === "picks",
  ).length;
  const tasteCount = entries.filter(
    (entry) => entry.decision !== "playing" && entry.decision !== "picks",
  ).length;

  return (
    <Card className="rounded-3xl border border-border bg-card shadow-lg">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-4">
        <div className="grid gap-1">
          <CardTitle className="text-lg font-black text-foreground">Decisions & Activity</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Manage your active games, saved picks, and historical preferences.
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
            Picks & Play <span className="opacity-50 text-[10px] font-mono">({activeCount})</span>
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
              ? "No active picks or play items yet. Save a recommendation or start playing a game."
              : activeTab === "taste"
                ? "No preferences yet. Start with onboarding or rate how a game landed."
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
                onStart={() => onStart(entry.gameId)}
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

export function TasteShell() {
  const {
    state,
    getSeedGame,
    applyDecisionFeedback,
    removeTasteSignal,
    setPlayStatus,
    setPlayfitPick,
    startPlayfitPick,
  } = usePlayfit();
  const [, setCacheVersion] = useState(0);
  const [hydrating, setHydrating] = useState(false);
  const [hydratedOnce, setHydratedOnce] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<"taste" | "activity">("taste");
  const [mapView, setMapView] = useState<"visual" | "list">("visual");
  const [subView, setSubView] = useState<"menu" | "map" | "list" | "activity">("menu");

  useHeader(
    subView === "map"
      ? { title: "Affinity Map", onBack: () => setSubView("menu") }
      : subView === "list"
        ? { title: "Traits List", onBack: () => setSubView("menu") }
        : subView === "activity"
          ? { title: "Activity", onBack: () => setSubView("menu") }
          : {},
    [subView],
  );
  const profile = state.user.profile;
  const requiredIds = useMemo(() => getTasteGameIds(state), [state]);
  const gamesById = getSeedGamesById(requiredIds, getSeedGame);
  const missingIds = getMissingGameIds(requiredIds, gamesById);
  const missingKey = missingIds.join("|");
  const model = useMemo(
    () => buildTasteModel(state.user.onboarding, state.user.gameStates, gamesById, profile),
    [state.user.onboarding, state.user.gameStates, gamesById, profile],
  );
  const belowCalibration =
    state.user.onboarding.likedGameIds.length < 3 ||
    (state.user.onboarding.dislikedGameIds ?? []).length < 1;

  const profileReady = !!state.user.onboardingCompletedAt && !!profile;
  const { model: recsModel } = useTodayRecommendations({
    enabled: profileReady,
    profile,
    gameStates: state.user.gameStates,
    onboarding: state.user.onboarding,
    errorMessage: "Recommendations could not be loaded for the map.",
    cacheScope: "decision",
  });

  useEffect(() => {
    if (!missingKey) {
      setHydrating(false);
      return;
    }

    let cancelled = false;
    setHydrating(true);
    const idsToFetch = missingKey.split("|").filter(Boolean);
    void ensureGamesCached(idsToFetch).finally(() => {
      if (cancelled) return;
      setCacheVersion((current) => current + 1);
      setHydratedOnce(true);
      setHydrating(false);
    });

    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  const historyAndActivityEntries = useMemo(
    () =>
      buildHistoryAndActivityEntries({
        gameStates: state.user.gameStates,
        historyEntries: model.historyEntries,
        gamesById,
      }),
    [state.user.gameStates, model.historyEntries, gamesById],
  );

  const recs = useMemo(() => {
    if (!recsModel) return [];
    return [...recsModel.nextUp, ...recsModel.resume, ...recsModel.currentRun];
  }, [recsModel]);

  if (!profile) {
    return (
      <div className="min-h-screen text-foreground relative flex items-center justify-center">
        <Container as="main" size="sm" className="py-8">
          <Card className="rounded-3xl border border-border bg-card shadow-lg p-6 text-center">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-2xl font-black">Set up your taste first</CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Select your platforms and a few favorite games so we can build your recommendations.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0 pt-4">
              <Button
                type="button"
                asChild
                className="bg-accent text-accent-foreground font-extrabold hover:bg-accent/90"
              >
                <Link href="/play">Start Play Next</Link>
              </Button>
            </CardContent>
          </Card>
        </Container>
      </div>
    );
  }

  if (hydrating || (missingIds.length > 0 && !hydratedOnce)) {
    return (
      <Container as="main" size="md" className="grid gap-4 py-8">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-6 w-96 rounded-lg" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </Container>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative min-h-screen text-foreground w-full"
    >
      <div className="pointer-events-none absolute left-1/4 top-1/4 size-[400px] rounded-full bg-accent/5 blur-[100px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 size-[350px] rounded-full bg-indigo-500/5 blur-[90px]" />

      <div className="w-full">
        <Container as="main" size="md" className="flex flex-col gap-6 py-6 lg:py-8">
          <div className="hidden md:flex flex-wrap items-center justify-between gap-3 shrink-0">
            <Button
              type="button"
              variant="ghost"
              asChild
              className="text-xs hover:text-foreground hover:bg-secondary"
            >
              <Link href="/play" className="flex items-center">
                <ArrowLeft className="size-4 mr-1.5" />
                Back to Play Next Recommendation
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Badge
                variant="info"
                className="bg-accent/10 text-accent border border-accent/30 text-[10px] font-bold py-1 px-3"
              >
                Based on {model.evidenceCount} preferences
              </Badge>
            </div>
          </div>

          <section className="hidden md:grid relative overflow-hidden gap-4 rounded-3xl border border-border bg-card p-6 shadow-md md:grid-cols-[minmax(0,1.15fr)_minmax(250px,0.85fr)] md:items-end shrink-0">
            <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-accent/10 blur-xl" />
            <div className="grid gap-2 relative z-10">
              <div className="flex items-center gap-2 text-accent">
                <Layers className="size-4" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em]">
                  Gaming profile
                </span>
              </div>
              <h1 className="font-display text-4xl font-black tracking-tight text-foreground mt-1">
                Your Taste
              </h1>
              <p className="max-w-2xl text-xs text-muted-foreground leading-relaxed mt-0.5">
                What Playfit is learning from your active decisions. {model.confidenceLabel}.
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-secondary/50 p-4 relative z-10">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-accent flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" />
                Profile Summary
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {model.positiveCount > model.negativeCount
                  ? "Playfit leans toward your favorites, but still needs more signals to sharpen the edge cases."
                  : "Playfit is still balancing your likes and misses; a few more decisions will make the next pick steadier."}
              </p>
            </div>
          </section>

          {belowCalibration ? (
            <Alert variant="warning" className="shrink-0">
              Add at least 3 liked games and 1 missed game to refine your recommendations.
            </Alert>
          ) : null}

          {missingIds.length > 0 ? (
            <Alert variant="warning" className="shrink-0">
              Some older signals could not be loaded.
            </Alert>
          ) : null}

          {/* Mobile sub-views layout (Dashboard Menu) */}
          <div className="flex flex-col gap-6 md:hidden">
            {subView === "menu" && (
              <div className="flex flex-col gap-4">
                {/* Profile Summary Card */}
                <div className="rounded-2xl border border-border bg-card p-4 relative overflow-hidden">
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-accent flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5" />
                    Profile Summary
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                    {model.positiveCount > model.negativeCount
                      ? "Playfit leans toward your favorites, but still needs more signals to sharpen the edge cases."
                      : "Playfit is still balancing your likes and misses; a few more decisions will make the next pick steadier."}
                  </p>
                </div>

                {/* Stats Summary Cards */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-2xl border border-border bg-card p-3.5 text-center shadow-sm">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Preferences
                    </p>
                    <strong className="mt-1 block font-mono text-xl font-black text-foreground">
                      {model.evidenceCount}
                    </strong>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-3.5 text-center shadow-sm">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-positive">
                      Liked
                    </p>
                    <strong className="mt-1 block font-mono text-xl font-black text-positive">
                      {model.positiveCount}
                    </strong>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-3.5 text-center shadow-sm">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-negative">
                      Avoided
                    </p>
                    <strong className="mt-1 block font-mono text-xl font-black text-negative">
                      {model.negativeCount}
                    </strong>
                  </div>
                </div>

                {/* Menu list */}
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setSubView("map")}
                    className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-2xl hover:border-border/80 transition-all text-left"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="size-10 rounded-xl bg-secondary/60 flex items-center justify-center text-muted-foreground">
                        <Waves className="size-5 text-accent" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-extrabold text-foreground">
                          Interactive Affinity Map
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                          Visual graph of your gaming traits
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground/60" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubView("list")}
                    className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-2xl hover:border-border/80 transition-all text-left"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="size-10 rounded-xl bg-secondary/60 flex items-center justify-center text-muted-foreground">
                        <Layers className="size-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-extrabold text-foreground">
                          Gaming Traits List
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                          Liked and skipped styles list
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground/60" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setSubView("activity")}
                    className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-2xl hover:border-border/80 transition-all text-left"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="size-10 rounded-xl bg-secondary/60 flex items-center justify-center text-muted-foreground">
                        <History className="size-5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-sm font-extrabold text-foreground">
                          Decisions & Activity
                        </span>
                        <span className="text-xs text-muted-foreground mt-0.5">
                          Review {historyAndActivityEntries.length} ratings and active picks
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground/60" />
                  </button>
                </div>
              </div>
            )}

            {subView === "map" && (
              <div className="flex flex-col gap-4">
                <TasteMapVisualizer
                  gamesById={gamesById}
                  gameStates={state.user.gameStates}
                  recommendations={recs}
                />
              </div>
            )}

            {subView === "list" && (
              <div className="flex flex-col gap-4">
                <TasteMap traits={model.mapTraits} />
              </div>
            )}

            {subView === "activity" && (
              <div className="flex flex-col gap-4">
                <TasteHistory
                  entries={historyAndActivityEntries}
                  changingId={changingId}
                  onToggleChange={(gameId) =>
                    setChangingId((current) => (current === gameId ? null : gameId))
                  }
                  onChange={(entry, feedback) => {
                    applyDecisionFeedback(entry.gameId, feedback);
                    setChangingId(null);
                  }}
                  onRemove={(entry) => {
                    if (entry.decision === "playing") {
                      setPlayStatus(entry.gameId, undefined);
                    } else if (entry.decision === "picks") {
                      setPlayfitPick(entry.gameId, false);
                    } else {
                      removeTasteSignal(entry.gameId, entry.source as ProductTasteSignalSource);
                    }
                    setChangingId(null);
                  }}
                  onStart={(gameId) => {
                    startPlayfitPick(gameId);
                  }}
                />
              </div>
            )}
          </div>

          {/* Desktop Layout - Expanded view with tabs */}
          <div className="hidden md:flex flex-col gap-6">
            <div className="flex gap-1 bg-secondary/60 p-1.5 rounded-2xl border border-border/60 shrink-0">
              {(["taste", "activity"] as const).map((tab) => {
                const labels = {
                  taste: "Your Taste",
                  activity: "Activity",
                };
                const counts = {
                  taste: model.mapTraits.length,
                  activity: historyAndActivityEntries.length,
                };
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setActiveMainTab(tab)}
                    className={cn(
                      "flex-1 h-10 px-4 text-sm rounded-xl font-bold transition-all flex items-center justify-center gap-2",
                      activeMainTab === tab
                        ? "bg-card shadow-md text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {labels[tab]}
                    <span className="opacity-50 text-[10px] font-mono">({counts[tab]})</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-6 pb-4">
              {activeMainTab === "taste" && (
                <>
                  <div className="grid grid-cols-3 gap-3.5">
                    <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Preferences
                      </p>
                      <strong className="mt-1 block font-mono text-2xl font-black text-foreground">
                        {model.evidenceCount}
                      </strong>
                    </div>
                    <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-positive">
                        Liked
                      </p>
                      <strong className="mt-1 block font-mono text-2xl font-black text-positive">
                        {model.positiveCount}
                      </strong>
                    </div>
                    <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-negative">
                        Avoided
                      </p>
                      <strong className="mt-1 block font-mono text-2xl font-black text-negative">
                        {model.negativeCount}
                      </strong>
                    </div>
                  </div>

                  <div className="flex gap-2 p-1.5 bg-secondary/50 border border-border/60 rounded-2xl shrink-0">
                    <button
                      type="button"
                      onClick={() => setMapView("visual")}
                      className={cn(
                        "flex-1 h-9 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                        mapView === "visual"
                          ? "bg-card shadow-md text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Visual Map (2D)
                    </button>
                    <button
                      type="button"
                      onClick={() => setMapView("list")}
                      className={cn(
                        "flex-1 h-9 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                        mapView === "list"
                          ? "bg-card shadow-md text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      Traits List
                    </button>
                  </div>

                  {mapView === "visual" ? (
                    <TasteMapVisualizer
                      gamesById={gamesById}
                      gameStates={state.user.gameStates}
                      recommendations={recs}
                    />
                  ) : (
                    <TasteMap traits={model.mapTraits} />
                  )}
                </>
              )}

              {activeMainTab === "activity" && (
                <TasteHistory
                  entries={historyAndActivityEntries}
                  changingId={changingId}
                  onToggleChange={(gameId) =>
                    setChangingId((current) => (current === gameId ? null : gameId))
                  }
                  onChange={(entry, feedback) => {
                    applyDecisionFeedback(entry.gameId, feedback);
                    setChangingId(null);
                  }}
                  onRemove={(entry) => {
                    if (entry.decision === "playing") {
                      setPlayStatus(entry.gameId, undefined);
                    } else if (entry.decision === "picks") {
                      setPlayfitPick(entry.gameId, false);
                    } else {
                      removeTasteSignal(entry.gameId, entry.source as ProductTasteSignalSource);
                    }
                    setChangingId(null);
                  }}
                  onStart={(gameId) => {
                    startPlayfitPick(gameId);
                  }}
                />
              )}
            </div>
          </div>
        </Container>
        <StatusToast />
      </div>
    </motion.div>
  );
}
