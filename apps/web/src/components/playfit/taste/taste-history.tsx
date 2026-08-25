"use client";

import type { ProductDecisionFeedback, ProductTasteDecision } from "@playfit/core/types";
import {
  ChevronRight,
  Heart,
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
import { cn } from "@/lib/utils";
import { CoverArt } from "../cover-art";
import { usePlayfitState } from "../playfit-context";
import { StarRating } from "../star-rating";
import type { HistoryOrActivityEntry } from "../taste-model";

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
  return new Intl.DateTimeFormat("en-US", {
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

export function TasteHistory({
  entries,
  changingId,
  onToggleChange,
  onChange,
  onRemove,
  traitFilter,
  onClearTraitFilter,
}: {
  entries: HistoryOrActivityEntry[];
  changingId: string | null;
  onToggleChange: (gameId: string) => void;
  onChange: (entry: HistoryOrActivityEntry, feedback: ProductDecisionFeedback) => void;
  onRemove: (entry: HistoryOrActivityEntry) => void;
  // Arrived here from a "See games behind this trait" tap in the Taste DNA view --
  // narrows the list to the entries that actually contributed to that trait.
  traitFilter?: { id: string; label: string } | null;
  onClearTraitFilter?: () => void;
}) {
  const { getSeedGame } = usePlayfitState();
  const [activeTab, setActiveTab] = useState<"all" | "active" | "taste">("all");
  const [page, setPage] = useState(1);

  const filteredEntries = useMemo(() => {
    let next = entries;
    if (activeTab === "active") {
      next = next.filter((entry) => entry.decision === "picks");
    } else if (activeTab === "taste") {
      next = next.filter((entry) => entry.decision !== "picks");
    }
    if (traitFilter) {
      next = next.filter((entry) => entry.traits.includes(traitFilter.id));
    }
    return next;
  }, [entries, activeTab, traitFilter]);

  const itemsPerPage = 5;
  const totalItems = filteredEntries.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [totalPages, page]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: traitFilter isn't read in the body -- its identity changing is the reset trigger itself (a fresh filter should always land on page 1).
  useEffect(() => {
    setPage(1);
  }, [traitFilter]);

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
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer",
              activeTab === "all"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.02]",
            )}
          >
            All{" "}
            <Badge className="rounded-lg ml-0.5" variant="secondary">
              {allCount}
            </Badge>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("active");
              setPage(1);
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer",
              activeTab === "active"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.02]",
            )}
          >
            Saved Picks{" "}
            <Badge className="rounded-lg ml-0.5" variant="secondary">
              {activeCount}
            </Badge>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab("taste");
              setPage(1);
            }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all border-0 cursor-pointer",
              activeTab === "taste"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.02]",
            )}
          >
            Calibration{" "}
            <Badge className="rounded-lg ml-0.5" variant="secondary">
              {tasteCount}
            </Badge>
          </button>
        </div>
      </CardHeader>
      {traitFilter && (
        <div className="flex items-center justify-between gap-3 border-b border-border/60 bg-accent/5 px-4 py-2.5 sm:px-6">
          <span className="text-xs font-bold text-muted-foreground">
            Filtered by <span className="text-foreground">"{traitFilter.label}"</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearTraitFilter}
            className="h-7 px-2.5 text-xs font-bold"
          >
            Clear
          </Button>
        </div>
      )}
      <CardContent className="p-0">
        <div className="divide-y divide-border/60">
          {paginatedEntries.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <p className="text-sm font-bold text-muted-foreground/60">No entries in this view.</p>
            </div>
          ) : (
            paginatedEntries.map((entry) => {
              const game = getSeedGame(entry.gameId);
              if (!game) return null;
              const label =
                decisionLabels[entry.decision as keyof typeof decisionLabels] ?? entry.decision;
              const dateLabel = formatDate(entry.updatedAt);
              const variant = toneVariant(entry);
              const changing = changingId === entry.gameId;

              return (
                <div
                  key={`${entry.gameId}-${entry.decision}`}
                  className="flex items-center gap-3 p-4 sm:p-5 hover:bg-white/[0.01] transition-colors w-full min-w-0"
                >
                  <Link
                    href={`/game/${entry.gameId}`}
                    className="flex items-center gap-3 min-w-0 flex-1 hover:no-underline"
                  >
                    <div className="relative aspect-[3/4] w-12 rounded-lg border border-white/5 overflow-hidden shrink-0 shadow-md">
                      <CoverArt game={game} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1 grid gap-1.5">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <h4 className="text-sm font-extrabold text-foreground truncate max-w-[200px] sm:max-w-xs leading-none">
                          {entry.title}
                        </h4>
                        <span className="text-[10px] font-mono text-muted-foreground/50">
                          {dateLabel}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={variant}
                          className="rounded-lg text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider"
                        >
                          {label}
                        </Badge>
                        {entry.rating !== undefined && (
                          <div className="shrink-0 scale-75 origin-left">
                            <StarRating value={entry.rating} readOnly />
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                  <div className="relative shrink-0 flex items-center gap-1.5">
                    {entry.decision !== "picks" &&
                    entry.decision !== "setup_favorite" &&
                    entry.decision !== "setup_miss" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => onToggleChange(entry.gameId)}
                        className={cn(
                          "size-8 rounded-xl border border-white/5 bg-secondary/15 hover:bg-secondary/40 text-muted-foreground hover:text-foreground",
                          changing && "bg-secondary/40 border-accent/25 text-accent",
                        )}
                        aria-label="Change decision"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => onRemove(entry)}
                      className="size-8 rounded-xl border border-white/5 bg-secondary/15 hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                      aria-label="Delete entry"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                    <Dialog
                      open={changing}
                      onClose={() => onToggleChange(entry.gameId)}
                      title={`Update "${entry.title}"`}
                      eyebrow="Calibration"
                      className="max-w-xs"
                    >
                      <div className="grid gap-3">
                        <p className="text-xs text-muted-foreground">
                          Adjust your gameplay experience to update your taste DNA instantly:
                        </p>
                        <div className="grid gap-2">
                          {changeOptions.map((opt) => (
                            <button
                              key={opt.feedback}
                              type="button"
                              onClick={() => onChange(entry, opt.feedback)}
                              className="group flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-white/5 bg-secondary/20 hover:bg-accent/10 hover:border-accent/30 text-left transition-all duration-300 cursor-pointer"
                            >
                              <span className="flex items-center gap-2.5">
                                <opt.Icon className="size-4 text-muted-foreground group-hover:text-accent transition-colors" />
                                <span className="text-xs font-bold text-foreground group-hover:text-accent transition-colors">
                                  {opt.label}
                                </span>
                              </span>
                              <ChevronRight className="size-3.5 text-muted-foreground/40 group-hover:text-accent/60 group-hover:translate-x-0.5 transition-all" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </Dialog>
                  </div>
                </div>
              );
            })
          )}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/60 px-4 py-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
              className="text-xs rounded-xl"
            >
              Previous
            </Button>
            <span className="text-xs font-mono text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page === totalPages}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs rounded-xl"
            >
              Next
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
