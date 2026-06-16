"use client";

import { buildTasteModel, formatTasteTraitLabel } from "@playfit/core/domain";
import type {
  ProductDecisionFeedback,
  ProductState,
  ProductTasteDecision,
  ProductTasteHistoryEntry,
  ProductTasteMapTrait,
  SeedGame,
} from "@playfit/core/types";
import {
  ArrowLeft,
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
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { SectionLabel } from "@/components/ui/section-label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Stack } from "@/components/ui/stack";
import { ensureGamesCached } from "@/lib/game-cache";
import { CoverArt } from "../playfit/cover-art";
import { usePlayfit } from "../playfit/playfit-context";
import { StarRating } from "../playfit/star-rating";
import { StatusToast } from "../playfit/status-toast";

const decisionLabels: Record<ProductTasteDecision, string> = {
  setup_favorite: "Setup favorite",
  setup_miss: "Setup miss",
  loved: "Loved",
  liked: "Liked",
  mixed: "Mixed",
  dropped: "Dropped",
  not_for_me: "Not for me",
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

function toneVariant(entry: ProductTasteHistoryEntry) {
  if (entry.tone === "positive") return "positive";
  if (entry.tone === "negative") return "negative";
  return "warning";
}

function TasteMap({ traits }: { traits: ProductTasteMapTrait[] }) {
  const maxStrength = Math.max(...traits.map((trait) => trait.strength), 1);

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle>Taste Map</CardTitle>
        <CardDescription>
          Positive signals come from loved/liked games. Watch-outs come from dropped/not-for-me
          games.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
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
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                    <div className="h-3 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="ml-auto h-full rounded-full bg-negative"
                        style={{ width: negativeWidth }}
                      />
                    </div>
                    <span className="h-5 w-px bg-border" />
                    <div className="h-3 overflow-hidden rounded-full bg-secondary">
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
  onSelect,
}: {
  onSelect: (feedback: ProductDecisionFeedback) => void;
}) {
  return (
    <div className="grid gap-2 rounded-md border border-border bg-secondary p-3">
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
}: {
  entry: ProductTasteHistoryEntry;
  changing: boolean;
  onToggleChange: () => void;
  onChange: (feedback: ProductDecisionFeedback) => void;
  onRemove: () => void;
}) {
  const { getSeedGame } = usePlayfit();
  const game = getSeedGame(entry.gameId);

  if (!game) return null;

  return (
    <div className="grid gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
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
          <Button type="button" variant="secondary" size="sm" onClick={onToggleChange}>
            <Pencil className="size-4" />
            Change
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onRemove}>
            <Trash2 className="size-4" />
            Remove signal
          </Button>
          <Button type="button" variant="ghost" size="sm" asChild>
            <Link href={`/play/game/${entry.gameId}`}>
              Open dossier
              <ChevronRight className="size-4" />
            </Link>
          </Button>
        </Stack>
      </div>
      {changing ? <ChangeSignalPanel onSelect={onChange} /> : null}
    </div>
  );
}

function TasteHistory({
  entries,
  changingId,
  onToggleChange,
  onChange,
  onRemove,
}: {
  entries: ProductTasteHistoryEntry[];
  changingId: string | null;
  onToggleChange: (gameId: string) => void;
  onChange: (entry: ProductTasteHistoryEntry, feedback: ProductDecisionFeedback) => void;
  onRemove: (entry: ProductTasteHistoryEntry) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Taste History</CardTitle>
        <CardDescription>Only decisions Playfit uses as taste evidence.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {entries.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
            No taste signals yet. Start with onboarding or mark how a recommendation landed.
          </p>
        ) : (
          entries.map((entry) => (
            <TasteHistoryRow
              key={`${entry.source}:${entry.gameId}`}
              entry={entry}
              changing={changingId === entry.gameId}
              onToggleChange={() => onToggleChange(entry.gameId)}
              onChange={(feedback) => onChange(entry, feedback)}
              onRemove={() => onRemove(entry)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

export function TasteShell() {
  const { state, getSeedGame, applyDecisionFeedback, removeTasteSignal } = usePlayfit();
  const [, setCacheVersion] = useState(0);
  const [hydrating, setHydrating] = useState(false);
  const [hydratedOnce, setHydratedOnce] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
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
        <section className="grid gap-3 rounded-3xl border border-border bg-card/80 p-6 shadow-sm">
          <h1 className="font-display text-4xl font-extrabold leading-tight">Your Taste</h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
            What Playfit is learning from your decisions. {model.confidenceLabel}.
          </p>
        </section>
        {belowCalibration ? (
          <Alert variant="warning">
            Taste is below calibration strength. You can still use Playfit, but adding 3 liked games
            and 1 miss will make recommendations steadier.
          </Alert>
        ) : null}
        {missingIds.length > 0 ? (
          <Alert variant="warning">Some older signals could not be loaded.</Alert>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4 text-center shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Signals
            </p>
            <strong className="mt-1 block font-mono text-2xl">{model.evidenceCount}</strong>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Lean toward
            </p>
            <strong className="mt-1 block font-mono text-2xl">{model.positiveCount}</strong>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Steer away
            </p>
            <strong className="mt-1 block font-mono text-2xl">{model.negativeCount}</strong>
          </div>
        </div>
        <TasteMap traits={model.mapTraits} />
        <Separator />
        <TasteHistory
          entries={model.historyEntries}
          changingId={changingId}
          onToggleChange={(gameId) =>
            setChangingId((current) => (current === gameId ? null : gameId))
          }
          onChange={(entry, feedback) => {
            applyDecisionFeedback(entry.gameId, feedback);
            setChangingId(null);
          }}
          onRemove={(entry) => {
            removeTasteSignal(entry.gameId, entry.source);
            setChangingId(null);
          }}
        />
      </Container>
      <StatusToast />
    </div>
  );
}
