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
  Play,
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

export function TasteMap({ traits }: { traits: ProductTasteMapTrait[] }) {
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

export function TasteHistory({
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
