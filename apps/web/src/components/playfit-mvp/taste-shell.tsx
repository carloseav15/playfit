"use client";

import { buildTasteModel, formatTasteTraitLabel } from "@playfit/core/domain";
import type {
  ProductDecisionFeedback,
  ProductGameState,
  ProductPlatformOption,
  ProductRating,
  ProductState,
  ProductTasteDecision,
  ProductTasteMapTrait,
  ProductTasteSignalSource,
  SeedGame,
} from "@playfit/core/types";
import {
  ArrowLeft,
  ChevronRight,
  Gamepad2,
  Heart,
  Laptop,
  Layers,
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
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Container } from "@/components/ui/container";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack } from "@/components/ui/stack";
import { ensureGamesCached } from "@/lib/game-cache";
import { cn } from "@/lib/utils";
import { CoverArt } from "../playfit/cover-art";
import { usePlayfit } from "../playfit/playfit-context";
import { StarRating } from "../playfit/star-rating";
import { StatusToast } from "../playfit/status-toast";

interface HistoryOrActivityEntry {
  gameId: string;
  title: string;
  decision: ProductTasteDecision | "playing" | "picks";
  source: ProductTasteSignalSource | "active_state";
  tone?: "positive" | "negative" | "mixed";
  rating?: ProductRating;
  status?: ProductGameState["status"];
  updatedAt?: string;
  traits: string[];
}

const decisionLabels: Record<ProductTasteDecision | "playing" | "picks", string> = {
  setup_favorite: "Setup favorite",
  setup_miss: "Setup miss",
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

function getTasteGameIds(state: ProductState) {
  return [
    ...new Set([
      ...state.user.onboarding.likedGameIds,
      ...(state.user.onboarding.dislikedGameIds ?? []),
      ...Object.keys(state.user.gameStates),
    ]),
  ];
}

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

function PlatformsTabContent() {
  const { state, seedData, updateState } = usePlayfit();
  const selectedIds = new Set(state.user.onboarding.platforms.map((p) => p.platformId));

  return (
    <Card className="rounded-3xl border border-white/5 bg-card/45 backdrop-blur-sm shadow-xl">
      <CardHeader>
        <CardTitle className="text-lg font-black text-foreground">Your Platforms</CardTitle>
        <CardDescription className="text-xs text-muted-foreground mt-0.5">
          Recommendations are only shown for games available on your active platforms. Changes save
          automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
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
                    "group grid min-h-28 content-between gap-3 rounded-2xl border border-white/5 bg-secondary/25 p-4 text-left transition-all duration-300 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
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
                        "size-8 shrink-0 rounded-xl grid place-items-center border border-white/5 bg-white/[0.02] text-muted-foreground group-hover:text-foreground transition-all duration-300",
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

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/5 bg-secondary/20 p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{state.user.onboarding.platforms.length}</strong>{" "}
            systems selected for Play Next.
          </p>
        </div>

        <div className="grid gap-4 divide-y divide-white/5">
          {tastePlatformFamilies.map((family) => {
            const group = seedData.platforms
              .filter((p) => p.family === family)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            if (group.length === 0) return null;
            const label = formatTastePlatformFamily(family);
            const consoles = group.filter((p) => p.kind !== "handheld");
            const handhelds = group.filter((p) => p.kind === "handheld");
            return (
              <div key={family} className="grid gap-3 pt-3 first:pt-0">
                {label && (
                  <p className="text-xs font-bold uppercase tracking-wide text-accent">{label}</p>
                )}
                {consoles.length > 0 && (
                  <div>
                    {handhelds.length > 0 && (
                      <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Console / Hybrid
                      </p>
                    )}
                    <div className="grid gap-3 md:grid-cols-2">
                      {consoles.map((platform) => {
                        const checked = selectedIds.has(platform.platformId);
                        return (
                          <Checkbox
                            key={platform.platformId}
                            id={`taste-plat-${platform.platformId}`}
                            checked={checked}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              updateState((next) => {
                                next.user.onboarding.platforms =
                                  next.user.onboarding.platforms.filter(
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
                    <div className="grid gap-3 md:grid-cols-2">
                      {handhelds.map((platform) => {
                        const checked = selectedIds.has(platform.platformId);
                        return (
                          <Checkbox
                            key={platform.platformId}
                            id={`taste-plat-hh-${platform.platformId}`}
                            checked={checked}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              updateState((next) => {
                                next.user.onboarding.platforms =
                                  next.user.onboarding.platforms.filter(
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
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function TasteMap({ traits }: { traits: ProductTasteMapTrait[] }) {
  const maxStrength = Math.max(...traits.map((trait) => trait.strength), 1);

  return (
    <Card className="rounded-3xl border border-white/5 bg-card/45 backdrop-blur-sm shadow-xl overflow-hidden">
      <CardHeader>
        <CardTitle className="text-lg font-black text-foreground">Taste Map</CardTitle>
        <CardDescription className="text-xs text-muted-foreground mt-0.5">
          Positive signals come from loved/liked games. Watch-outs come from dropped/not-for-me
          games.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="hidden sm:grid sm:grid-cols-[1fr_auto_1fr] gap-4 text-[10px] font-black uppercase tracking-[0.15em] text-muted-foreground border-b border-white/5 pb-2">
          <span className="text-right text-negative">Steer away from</span>
          <span className="opacity-40">Neutral</span>
          <span className="text-positive">Lean toward</span>
        </div>
        {traits.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-muted-foreground text-center bg-secondary/10">
            Add more taste decisions to draw a useful map.
          </p>
        ) : (
          <div className="grid gap-5">
            {traits.map((trait) => {
              const negativeWidth = `${(trait.negativeCount / maxStrength) * 100}%`;
              const positiveWidth = `${(trait.positiveCount / maxStrength) * 100}%`;
              return (
                <div
                  key={`${trait.kind}:${trait.id}`}
                  className="grid gap-2 p-3 rounded-2xl bg-secondary/15 border border-white/5 transition-all duration-300 hover:bg-secondary/25 hover:border-white/10"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <strong className="text-sm font-extrabold text-foreground">
                        {trait.label}
                      </strong>
                      <Badge
                        variant="outline"
                        className="border-accent/20 bg-accent/5 text-[10px] font-bold text-accent py-0 px-2"
                      >
                        {trait.kind}
                      </Badge>
                    </div>
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
                      className="h-2.5 overflow-hidden rounded-full bg-secondary/60 relative"
                      role="progressbar"
                      aria-valuenow={trait.negativeCount}
                      aria-valuemin={0}
                      aria-valuemax={maxStrength}
                      aria-label={`${trait.label} steer away: ${trait.negativeCount}`}
                    >
                      <div
                        className="ml-auto h-full rounded-full bg-gradient-to-l from-negative to-negative/60"
                        style={{ width: negativeWidth }}
                      />
                    </div>
                    <span className="h-5 w-px bg-white/10" />
                    <div
                      className="h-2.5 overflow-hidden rounded-full bg-secondary/60 relative"
                      role="progressbar"
                      aria-valuenow={trait.positiveCount}
                      aria-valuemin={0}
                      aria-valuemax={maxStrength}
                      aria-label={`${trait.label} lean toward: ${trait.positiveCount}`}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-positive to-positive/60"
                        style={{ width: positiveWidth }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-4 text-[10px] font-mono text-muted-foreground/80">
                    <span className="text-right font-extrabold">{trait.negativeCount}</span>
                    <span className="opacity-40">signals</span>
                    <span className="font-extrabold">{trait.positiveCount}</span>
                  </div>
                </div>
              );
            })}
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
      className="grid gap-2.5 rounded-2xl border border-white/5 bg-secondary/30 p-4 animate-in fade-in slide-in-from-top-2 duration-300"
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
            className="text-xs border-white/10 bg-card hover:bg-secondary rounded-xl"
          >
            <Icon className="size-4 mr-1 text-accent" />
            {label}
          </Button>
        ))}
      </Stack>
    </div>
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

  if (!game) return null;

  const isPlaying = entry.decision === "playing";
  const isPick = entry.decision === "picks";

  return (
    <div className="grid gap-3.5 rounded-2xl border border-white/5 bg-secondary/20 p-4 transition-all duration-300 hover:bg-secondary/35">
      <div className="grid grid-cols-[3.25rem_1fr] gap-3.5 md:grid-cols-[3.25rem_1fr_auto] md:items-center">
        <CoverArt
          game={game}
          className="aspect-[2/3] w-12 rounded-lg shadow-md border border-white/5 shrink-0"
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
                className="border-white/5 bg-white/[0.03] text-[9px] font-bold py-0 px-2 text-muted-foreground/80"
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
              Dossier
              <ChevronRight className="size-3.5 ml-0.5" />
            </Link>
          </Button>
        </Stack>
      </div>
      {changing ? <ChangeSignalPanel id={changePanelId} onSelect={onChange} /> : null}
    </div>
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
    <Card className="rounded-3xl border border-white/5 bg-card/45 backdrop-blur-sm shadow-xl">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-white/5 pb-4">
        <div className="grid gap-1">
          <CardTitle className="text-lg font-black text-foreground">Decisions & Activity</CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Manage your active games, saved picks, and historical taste signals.
          </CardDescription>
        </div>
        <div className="flex gap-1 bg-secondary/40 p-1 rounded-2xl border border-white/5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActiveTab("all");
              setPage(1);
            }}
            className={cn(
              "h-8 px-3 text-xs rounded-xl font-bold transition-all flex items-center gap-1.5",
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
              "h-8 px-3 text-xs rounded-xl font-bold transition-all flex items-center gap-1.5",
              activeTab === "active"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Active <span className="opacity-50 text-[10px] font-mono">({activeCount})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("taste");
              setPage(1);
            }}
            className={cn(
              "h-8 px-3 text-xs rounded-xl font-bold transition-all flex items-center gap-1.5",
              activeTab === "taste"
                ? "bg-card shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Signals <span className="opacity-50 text-[10px] font-mono">({tasteCount})</span>
          </button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-6">
        {paginatedEntries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-white/10 p-5 text-sm text-muted-foreground text-center bg-secondary/10">
            {activeTab === "active"
              ? "No active games or saved picks yet. Save a recommendation or mark a game as started."
              : activeTab === "taste"
                ? "No taste signals yet. Start with onboarding or rate how a recommendation landed."
                : "No decisions or activity yet. Start with onboarding or save recommendations."}
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
          <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-4">
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
                className="h-8 text-xs border-white/5 hover:bg-secondary rounded-xl"
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="h-8 text-xs border-white/5 hover:bg-secondary rounded-xl"
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
  const [activeMainTab, setActiveMainTab] = useState<"taste" | "activity" | "platforms">("taste");
  const profile = state.user.profile;
  const requiredIds = useMemo(() => getTasteGameIds(state), [state]);
  const gamesById = new Map<string, SeedGame>();
  for (const gameId of requiredIds) {
    const game = getSeedGame(gameId);
    if (game) gamesById.set(gameId, game);
  }
  const missingIds = requiredIds.filter((gameId) => !gamesById.has(gameId));
  const missingKey = missingIds.join("|");
  const model = useMemo(
    () => buildTasteModel(state.user.onboarding, state.user.gameStates, gamesById, profile),
    [state.user.onboarding, state.user.gameStates, gamesById, profile],
  );
  const belowCalibration =
    state.user.onboarding.likedGameIds.length < 3 ||
    (state.user.onboarding.dislikedGameIds ?? []).length < 1;

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

  const historyAndActivityEntries = useMemo(() => {
    const activeEntries: HistoryOrActivityEntry[] = [];
    for (const record of Object.values(state.user.gameStates)) {
      if (record.status === "playing") {
        const game = getSeedGame(record.gameId);
        if (game) {
          activeEntries.push({
            gameId: record.gameId,
            title: game.title,
            decision: "playing",
            source: "active_state",
            rating: record.rating,
            status: record.status,
            updatedAt: record.updatedAt,
            traits: [game.genreId ?? game.primaryGenre, ...game.tags].filter(Boolean).slice(0, 4),
          });
        }
      } else if (
        record.inPlayfitPicks &&
        record.status !== "completed" &&
        record.status !== "beaten" &&
        record.status !== "abandoned" &&
        !record.excluded
      ) {
        const game = getSeedGame(record.gameId);
        if (game) {
          activeEntries.push({
            gameId: record.gameId,
            title: game.title,
            decision: "picks",
            source: "active_state",
            rating: record.rating,
            status: record.status,
            updatedAt: record.updatedAt,
            traits: [game.genreId ?? game.primaryGenre, ...game.tags].filter(Boolean).slice(0, 4),
          });
        }
      }
    }

    const historyMapped: HistoryOrActivityEntry[] = model.historyEntries.map((entry) => ({
      gameId: entry.gameId,
      title: entry.title,
      decision: entry.decision,
      source: entry.source,
      tone: entry.tone,
      rating: entry.rating,
      status: entry.status,
      updatedAt: entry.updatedAt,
      traits: entry.traits,
    }));

    const combined = [...activeEntries];
    const activeIds = new Set(activeEntries.map((e) => e.gameId));
    for (const h of historyMapped) {
      if (!activeIds.has(h.gameId)) {
        combined.push(h);
      }
    }

    return combined.sort((a, b) => {
      const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bTime - aTime || a.title.localeCompare(b.title);
    });
  }, [state.user.gameStates, model.historyEntries, getSeedGame]);

  if (!profile) {
    return (
      <div className="min-h-screen text-foreground relative flex items-center justify-center">
        <Container as="main" size="sm" className="py-8">
          <Card className="rounded-3xl border border-white/5 bg-card/65 backdrop-blur-md shadow-2xl p-6 text-center">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-2xl font-black">Tune your taste first</CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Pick your platforms and a few games so Playfit can explain your taste map.
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
      className="lg:h-screen lg:overflow-hidden relative"
    >
      {/* Background glow effects */}
      <div className="pointer-events-none absolute left-1/4 top-1/4 size-[400px] rounded-full bg-accent/5 blur-[100px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 size-[350px] rounded-full bg-indigo-500/5 blur-[90px]" />

      <div className="min-h-screen text-foreground lg:h-full lg:min-h-0 lg:overflow-hidden">
        <Container
          as="main"
          size="md"
          className="flex flex-col gap-6 py-6 lg:h-full lg:max-h-full lg:py-8 lg:overflow-hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
            <Button
              type="button"
              variant="ghost"
              asChild
              className="text-xs hover:text-foreground hover:bg-white/5"
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
                Based on {model.evidenceCount} taste signals
              </Badge>
            </div>
          </div>

          <section className="relative overflow-hidden grid gap-4 rounded-3xl border border-white/10 bg-gradient-to-br from-card/85 to-card/60 p-6 shadow-xl backdrop-blur-md md:grid-cols-[minmax(0,1.15fr)_minmax(250px,0.85fr)] md:items-end shrink-0">
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
            <div className="rounded-2xl border border-white/5 bg-secondary/30 p-4 relative z-10">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-accent flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" />
                Dossier Summary
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
              Taste is below calibration strength. You can still use Playfit, but adding 3 liked
              games and 1 miss will make recommendations steadier.
            </Alert>
          ) : null}

          {missingIds.length > 0 ? (
            <Alert variant="warning" className="shrink-0">
              Some older signals could not be loaded.
            </Alert>
          ) : null}

          {/* Main Tab Bar */}
          <div className="flex gap-1 bg-secondary/40 p-1.5 rounded-2xl border border-white/5 shrink-0">
            {(["taste", "activity", "platforms"] as const).map((tab) => {
              const labels = {
                taste: "Your Taste",
                activity: "Activity",
                platforms: "Platforms",
              };
              const counts = {
                taste: model.mapTraits.length,
                activity: historyAndActivityEntries.length,
                platforms: state.user.onboarding.platforms.length,
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

          {/* Tab Content */}
          <div className="flex flex-col gap-6 lg:flex-1 lg:overflow-y-auto lg:pr-2 pb-4">
            {activeMainTab === "taste" && (
              <>
                <div className="grid grid-cols-3 gap-3.5">
                  <div className="rounded-2xl border border-white/5 bg-card/45 backdrop-blur-sm p-4 text-center shadow-md">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Total Signals
                    </p>
                    <strong className="mt-1 block font-mono text-2xl font-black text-foreground">
                      {model.evidenceCount}
                    </strong>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-card/45 backdrop-blur-sm p-4 text-center shadow-md">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-positive">
                      Lean Toward
                    </p>
                    <strong className="mt-1 block font-mono text-2xl font-black text-positive">
                      {model.positiveCount}
                    </strong>
                  </div>
                  <div className="rounded-2xl border border-white/5 bg-card/45 backdrop-blur-sm p-4 text-center shadow-md">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-negative">
                      Steer Away
                    </p>
                    <strong className="mt-1 block font-mono text-2xl font-black text-negative">
                      {model.negativeCount}
                    </strong>
                  </div>
                </div>
                <TasteMap traits={model.mapTraits} />
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

            {activeMainTab === "platforms" && <PlatformsTabContent />}
          </div>
        </Container>
        <StatusToast />
      </div>
    </motion.div>
  );
}
