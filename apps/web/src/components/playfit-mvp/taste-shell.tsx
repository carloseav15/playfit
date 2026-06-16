"use client";

import { buildTasteModel, formatTasteTraitLabel } from "@playfit/core/domain";
import type {
  ProductDecisionFeedback,
  ProductGameState,
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
  Heart,
  Pencil,
  Play,
  ThumbsDown,
  ThumbsUp,
  Trash2,
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
import { Dialog } from "@/components/ui/dialog";
import { SectionLabel } from "@/components/ui/section-label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack } from "@/components/ui/stack";
import { Tab, TabGroup } from "@/components/ui/tabs";
import { ensureGamesCached } from "@/lib/game-cache";
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

function TasteMap({ traits }: { traits: ProductTasteMapTrait[] }) {
  const maxStrength = Math.max(...traits.map((trait) => trait.strength), 1);

  return (
    <Card className="rounded-3xl shadow-sm">
      <CardHeader>
        <CardTitle>Taste Map</CardTitle>
        <CardDescription>
          Positive signals come from loved/liked games. Watch-outs come from dropped/not-for-me
          games.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="hidden sm:grid sm:grid-cols-[1fr_auto_1fr] gap-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          <span className="text-right">Steer away from</span>
          <span>Neutral</span>
          <span>Lean toward</span>
        </div>
        {traits.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            Add more taste decisions to draw a useful map.
          </p>
        ) : (
          <div className="grid gap-3">
            {traits.map((trait) => {
              const negativeWidth = `${(trait.negativeCount / maxStrength) * 100}%`;
              const positiveWidth = `${(trait.positiveCount / maxStrength) * 100}%`;
              return (
                <div key={`${trait.kind}:${trait.id}`} className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <strong className="text-sm">{trait.label}</strong>
                      <Badge variant="outline">{trait.kind}</Badge>
                    </div>
                    <Badge
                      variant={
                        trait.direction === "positive"
                          ? "positive"
                          : trait.direction === "negative"
                            ? "negative"
                            : "secondary"
                      }
                    >
                      {trait.confidence}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3">
                    <div
                      className="h-3 overflow-hidden rounded-full bg-secondary"
                      role="progressbar"
                      aria-valuenow={trait.negativeCount}
                      aria-valuemin={0}
                      aria-valuemax={maxStrength}
                      aria-label={`${trait.label} steer away: ${trait.negativeCount}`}
                    >
                      <div
                        className="ml-auto h-full rounded-full bg-negative"
                        style={{ width: negativeWidth }}
                      />
                    </div>
                    <span className="h-5 w-px bg-border" />
                    <div
                      className="h-3 overflow-hidden rounded-full bg-secondary"
                      role="progressbar"
                      aria-valuenow={trait.positiveCount}
                      aria-valuemin={0}
                      aria-valuemax={maxStrength}
                      aria-label={`${trait.label} lean toward: ${trait.positiveCount}`}
                    >
                      <div
                        className="h-full rounded-full bg-positive"
                        style={{ width: positiveWidth }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] gap-3 text-xs text-muted-foreground">
                    <span className="text-right">{trait.negativeCount}</span>
                    <span>signals</span>
                    <span>{trait.positiveCount}</span>
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
    <div id={id} className="grid gap-2 rounded-2xl border border-border bg-secondary p-4">
      <SectionLabel>Change signal</SectionLabel>
      <Stack direction="row" wrap gap={2}>
        {changeOptions.map(({ feedback, label, Icon }) => (
          <Button
            key={feedback}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelect(feedback)}
          >
            <Icon className="size-4" />
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
    <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="grid grid-cols-[3.25rem_1fr] gap-3 md:grid-cols-[3.25rem_1fr_auto] md:items-center">
        <CoverArt game={game} className="aspect-[2/3] w-12" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={toneVariant(entry)}>{decisionLabels[entry.decision]}</Badge>
            <span className="text-xs text-muted-foreground">{formatDate(entry.updatedAt)}</span>
          </div>
          <p className="mt-1 truncate text-sm font-bold">{entry.title}</p>
          {entry.rating != null && entry.rating > 0 ? (
            <div className="mt-1">
              <StarRating value={entry.rating} readOnly />
            </div>
          ) : null}
          <Stack direction="row" wrap gap={1} className="mt-2">
            {entry.traits.slice(0, 4).map((trait) => (
              <Badge key={trait} variant="outline">
                {formatTasteTraitLabel(trait)}
              </Badge>
            ))}
          </Stack>
        </div>
        <Stack direction="row" wrap gap={2} className="md:justify-end">
          {isPlaying ? (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-expanded={changing}
                aria-controls={changePanelId}
                onClick={onToggleChange}
              >
                <Pencil className="size-4" />
                Complete
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onRemove}>
                <Trash2 className="size-4" />
                Stop playing
              </Button>
            </>
          ) : isPick ? (
            <>
              {onStart && (
                <Button type="button" size="sm" onClick={onStart}>
                  <Play className="size-4" />
                  Started
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={onRemove}>
                <Trash2 className="size-4" />
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
              >
                <Pencil className="size-4" />
                Change
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onRemove}>
                <Trash2 className="size-4" />
                Remove signal
              </Button>
            </>
          )}
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href={`/play/game/${entry.gameId}`}>
              Open dossier
              <ChevronRight className="size-4" />
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
    <Card>
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="grid gap-1.5">
          <CardTitle>Decisions & Activity</CardTitle>
          <CardDescription>
            Manage your active games, saved picks, and historical taste signals.
          </CardDescription>
        </div>
        <TabGroup>
          <Tab
            variant={activeTab === "all" ? "default" : "ghost"}
            count={allCount}
            onClick={() => {
              setActiveTab("all");
              setPage(1);
            }}
          >
            All
          </Tab>
          <Tab
            variant={activeTab === "active" ? "default" : "ghost"}
            count={activeCount}
            onClick={() => {
              setActiveTab("active");
              setPage(1);
            }}
          >
            Active
          </Tab>
          <Tab
            variant={activeTab === "taste" ? "default" : "ghost"}
            count={tasteCount}
            onClick={() => {
              setActiveTab("taste");
              setPage(1);
            }}
          >
            Taste Signals
          </Tab>
        </TabGroup>
      </CardHeader>
      <CardContent className="grid gap-3">
        {paginatedEntries.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            {activeTab === "active"
              ? "No active games or saved picks yet. Save a recommendation or mark a game as started."
              : activeTab === "taste"
                ? "No taste signals yet. Start with onboarding or rate how a recommendation landed."
                : "No decisions or activity yet. Start with onboarding or save recommendations."}
          </p>
        ) : (
          paginatedEntries.map((entry) => (
            <TasteHistoryRow
              key={`${entry.source}:${entry.gameId}`}
              entry={entry}
              changing={changingId === entry.gameId}
              onToggleChange={() => onToggleChange(entry.gameId)}
              onChange={(feedback) => onChange(entry, feedback)}
              onRemove={() => onRemove(entry)}
              onStart={() => onStart(entry.gameId)}
            />
          ))
        )}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
    seedData,
    updateState,
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
  const [editPlatformsOpen, setEditPlatformsOpen] = useState(false);
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
      <div className="min-h-screen bg-background text-foreground">
        <Container as="main" size="sm" className="grid min-h-screen place-items-center py-8">
          <Card>
            <CardHeader>
              <CardTitle>Tune your taste first</CardTitle>
              <CardDescription>
                Pick your platforms and a few games so Playfit can show your taste map.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" asChild>
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
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-96" />
        <Skeleton className="h-72 w-full" />
      </Container>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_right,rgba(94,128,255,0.08),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_38%)] text-foreground">
        <Container as="main" size="md" className="grid gap-6 py-6 md:py-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button type="button" variant="ghost" asChild>
              <Link href="/play">
                <ArrowLeft className="size-4" />
                Back to Play Next
              </Link>
            </Button>
            <Badge variant="info">Based on {model.evidenceCount} taste signals</Badge>
          </div>
          <section className="grid gap-4 rounded-3xl border border-border bg-card/80 p-6 shadow-sm md:grid-cols-[minmax(0,1.15fr)_minmax(240px,0.85fr)] md:items-end">
            <div className="grid gap-2">
              <h1 className="font-display text-4xl font-extrabold leading-tight">Your Taste</h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                What Playfit is learning from your decisions. {model.confidenceLabel}.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-secondary p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Summary
              </p>
              <p className="mt-2 text-sm leading-6 text-foreground">
                {model.positiveCount > model.negativeCount
                  ? "Playfit leans toward your favorites, but still needs more signals to sharpen the edge cases."
                  : "Playfit is still balancing your likes and misses; a few more decisions will make the next pick steadier."}
              </p>
            </div>
          </section>
          {belowCalibration ? (
            <Alert variant="warning">
              Taste is below calibration strength. You can still use Playfit, but adding 3 liked
              games and 1 miss will make recommendations steadier.
            </Alert>
          ) : null}
          {missingIds.length > 0 ? (
            <Alert variant="warning">Some older signals could not be loaded.</Alert>
          ) : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Signals
              </p>
              <strong className="mt-1 block font-mono text-2xl">{model.evidenceCount}</strong>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Lean toward
              </p>
              <strong className="mt-1 block font-mono text-2xl">{model.positiveCount}</strong>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Steer away
              </p>
              <strong className="mt-1 block font-mono text-2xl">{model.negativeCount}</strong>
            </div>
          </div>
          <Card className="rounded-3xl shadow-sm">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid gap-1.5">
                <CardTitle>Your Platforms</CardTitle>
                <CardDescription>
                  Recommendations are only shown for games available on your active platforms.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setEditPlatformsOpen(true)}
              >
                Edit Platforms
              </Button>
            </CardHeader>
            <CardContent>
              {state.user.onboarding.platforms.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No platforms selected. Recommendations are currently disabled.
                </p>
              ) : (
                <Stack direction="row" wrap gap={2}>
                  {state.user.onboarding.platforms.map((sel) => {
                    const plat = seedData.platforms.find((p) => p.platformId === sel.platformId);
                    return (
                      <Badge key={sel.platformId} variant="outline">
                        {plat?.displayName ?? sel.platformId}
                      </Badge>
                    );
                  })}
                </Stack>
              )}
            </CardContent>
          </Card>
          <TasteMap traits={model.mapTraits} />
          <Separator />
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
        </Container>
        <Dialog
          open={editPlatformsOpen}
          onClose={() => setEditPlatformsOpen(false)}
          title="Edit Platforms"
          eyebrow="Calibration Settings"
        >
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              Toggle platforms to filter recommendation results. Changes are saved automatically.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 max-h-[50vh] overflow-y-auto pr-1">
              {seedData.platforms.map((platform) => {
                const isChecked = state.user.onboarding.platforms.some(
                  (p) => p.platformId === platform.platformId,
                );
                return (
                  <Checkbox
                    key={platform.platformId}
                    id={`edit-plat-${platform.platformId}`}
                    label={platform.displayName}
                    checked={isChecked}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      updateState((next) => {
                        next.user.onboarding.platforms = next.user.onboarding.platforms.filter(
                          (p) => p.platformId !== platform.platformId,
                        );
                        if (checked) {
                          next.user.onboarding.platforms.push({
                            platformId: platform.platformId,
                            status: "available",
                          });
                        }
                      });
                    }}
                  />
                );
              })}
            </div>
            <div className="flex justify-end pt-2">
              <Button type="button" onClick={() => setEditPlatformsOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Dialog>
        <StatusToast />
      </div>
    </motion.div>
  );
}
