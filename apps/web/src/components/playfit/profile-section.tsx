"use client";

import {
  buildTagPreferenceAnalysis,
  type ProductTagPreferenceAnalysis,
  type ProductTagPreferenceEntry,
} from "@playfit/core/domain";
import type {
  ProductGameState,
  ProductProfile,
  ProductRating,
  SeedGame,
} from "@playfit/core/types";
import { ChevronRight, LogOut, RefreshCcw, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { SectionLabel } from "@/components/ui/section-label";
import { Separator } from "@/components/ui/separator";
import { Stack } from "@/components/ui/stack";
import { CoverArt } from "./cover-art";
import { Metric } from "./metric";
import { usePlayfit } from "./playfit-context";
import { SectionHead } from "./section-head";
import { StarRating } from "./star-rating";

type RatingBucket = 1 | 2 | 3 | 4 | 5;

const ratingBuckets: RatingBucket[] = [1, 2, 3, 4, 5];

function getRatingBucket(rating: ProductRating): RatingBucket {
  const clamped = Math.min(5, Math.max(1, Math.round(rating)));
  if (clamped < 1 || clamped > 5) return 1;
  return clamped as RatingBucket;
}

function getProfileAnalytics(gameStates: Record<string, ProductGameState>) {
  const entries = Object.values(gameStates);
  const rated = entries.filter((entry) => entry.rating != null && entry.rating > 0);
  const ratingDistribution = {} as Record<RatingBucket, number>;

  for (const bucket of ratingBuckets) {
    ratingDistribution[bucket] = 0;
  }

  for (const entry of rated) {
    ratingDistribution[getRatingBucket(entry.rating as ProductRating)] += 1;
  }

  return {
    totalGames: entries.length,
    rated,
    playing: entries.filter((entry) => entry.status === "playing").length,
    finished: entries.filter((entry) => entry.status === "beaten" || entry.status === "completed")
      .length,
    ratingDistribution,
  };
}

function formatTagLabel(tag: string) {
  return tag
    .split("_")
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function formatTagEvidence(
  entry: ProductTagPreferenceEntry,
  dominantSide: "positive" | "negative",
) {
  const secondary = dominantSide === "positive" ? entry.negativeCount : entry.positiveCount;
  const primary =
    dominantSide === "positive" ? `+${entry.positiveCount}` : `-${entry.negativeCount}`;

  if (secondary === 0) {
    return `${formatTagLabel(entry.tag)} ${primary}`;
  }

  const secondaryLabel =
    dominantSide === "positive" ? `-${entry.negativeCount}` : `+${entry.positiveCount}`;
  return `${formatTagLabel(entry.tag)} ${primary} / ${secondaryLabel}`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatDislikeReasonEvidence(entry: ProductTagPreferenceEntry) {
  return `${formatTagLabel(entry.tag)} ${formatPercent(entry.negativeRate)} low / ${formatPercent(
    entry.positiveRate,
  )} high`;
}

function getVisibleProfileSignals(
  profile: ProductProfile,
  tagEvidence: ProductTagPreferenceAnalysis,
) {
  const likedTags = new Set(tagEvidence.higherRatedTags.map((entry) => entry.tag));
  const cautionTags = new Set(
    Object.entries(profile.dislikedTags)
      .filter(([tag, count]) => count > (profile.likedTags[tag] ?? 0))
      .map(([tag]) => tag),
  );

  return profile.signals.filter((signal) => {
    if (signal.id.startsWith("tag-fit-")) {
      return likedTags.has(signal.id.replace("tag-fit-", ""));
    }

    if (signal.id.startsWith("tag-risk-")) {
      return cautionTags.has(signal.id.replace("tag-risk-", ""));
    }

    return true;
  });
}

function profileEvidenceLabel(ratedCount: number) {
  if (ratedCount >= 6) return "strong signal";
  if (ratedCount >= 3) return "building signal";
  return "first look";
}

function ProfileSignalList({
  title,
  signals,
  emptyCopy,
  variant,
}: {
  title: string;
  signals: ProductProfile["signals"];
  emptyCopy: string;
  variant: "positive" | "negative";
}) {
  return (
    <div className="grid gap-3">
      <SectionLabel>{title}</SectionLabel>
      {signals.length === 0 ? (
        <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
          {emptyCopy}
        </p>
      ) : (
        signals.map((signal) => (
          <div key={signal.id} className="rounded-md border border-border bg-secondary p-3">
            <Badge variant={variant}>{signal.label}</Badge>
            <p className="mt-2 text-sm text-muted-foreground">{signal.reason}</p>
          </div>
        ))
      )}
    </div>
  );
}

function TagEvidenceChips({
  entries,
  variant,
  dominantSide,
  emptyCopy,
}: {
  entries: ProductTagPreferenceEntry[];
  variant: "positive" | "warning" | "negative";
  dominantSide: "positive" | "negative";
  emptyCopy: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyCopy}</p>;
  }

  return (
    <Stack direction="row" wrap gap={2}>
      {entries.map((entry) => (
        <Badge key={entry.tag} variant={variant}>
          {formatTagEvidence(entry, dominantSide)}
        </Badge>
      ))}
    </Stack>
  );
}

function DislikeReasonChips({
  entries,
  variant,
  emptyCopy,
}: {
  entries: ProductTagPreferenceEntry[];
  variant: "warning" | "negative";
  emptyCopy: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyCopy}</p>;
  }

  return (
    <Stack direction="row" wrap gap={2}>
      {entries.map((entry) => (
        <Badge key={entry.tag} variant={variant}>
          {formatDislikeReasonEvidence(entry)}
        </Badge>
      ))}
    </Stack>
  );
}

export function ProfileSection() {
  const {
    state,
    setUi,
    isSaving,
    refreshAdaptiveProfile,
    resetLocalState,
    signOut,
    openDossier,
    getSeedGame,
  } = usePlayfit();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const profile = state.user.profile;

  const {
    analytics,
    maxRatingBucketCount,
    tagEvidence,
    positiveSignals,
    negativeSignals,
    evidenceLabel,
    latestRatings,
  } = useMemo(() => {
    if (!profile) {
      return {
        analytics: {
          totalGames: 0,
          rated: [],
          playing: 0,
          finished: 0,
          ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        },
        maxRatingBucketCount: 1,
        tagEvidence: {
          higherRatedTags: [],
          lowerRatedTags: [],
          uniqueLowerRatedTags: [],
          overrepresentedLowerRatedTags: [],
          badGameCount: 0,
        },
        positiveSignals: [],
        negativeSignals: [],
        evidenceLabel: "low",
        latestRatings: [],
      };
    }
    const a = getProfileAnalytics(state.user.gameStates);
    const gameIds = [
      ...new Set([
        ...state.user.onboarding.likedGameIds,
        ...(state.user.onboarding.dislikedGameIds ?? []),
        ...Object.keys(state.user.gameStates),
      ]),
    ];
    const gamesById = new Map<string, SeedGame>();
    for (const id of gameIds) {
      const game = getSeedGame(id);
      if (game) gamesById.set(id, game);
    }
    const te = buildTagPreferenceAnalysis(state.user.onboarding, gamesById, state.user.gameStates);
    const vs = getVisibleProfileSignals(profile, te);
    const ps = vs.filter((signal) => signal.tone === "positive").slice(0, 3);
    const ns = vs.filter((signal) => signal.tone === "negative").slice(0, 3);
    const el = profileEvidenceLabel(profile.ratedCount ?? a.rated.length);
    const lr = [...a.rated]
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
      .map((entry) => ({ entry, game: getSeedGame(entry.gameId) }))
      .filter((item): item is { entry: ProductGameState; game: SeedGame } => Boolean(item.game))
      .slice(0, 5);
    return {
      analytics: a,
      maxRatingBucketCount: Math.max(...Object.values(a.ratingDistribution), 1),
      tagEvidence: te,
      positiveSignals: ps,
      negativeSignals: ns,
      evidenceLabel: el,
      latestRatings: lr,
    };
  }, [state.user.gameStates, state.user.onboarding, getSeedGame, profile]);

  if (!profile) {
    return (
      <section>
        <SectionHead
          eyebrow="Profile"
          title="No profile yet"
          copy="Finish setup so Playfit can build a first read from your platforms and favorites."
        />
        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            onClick={() => setUi((current) => ({ ...current, activeTab: "onboarding" }))}
          >
            Go to setup
          </Button>
          <Button type="button" variant="outline" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section>
      <SectionHead eyebrow="Profile" title="Taste signals" copy={profile.summary} />
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric label="Games" value={analytics.totalGames} />
        <Metric label="Rated" value={analytics.rated.length} />
        <Metric label="Playing" value={analytics.playing} />
        <Metric label="Finished" value={analytics.finished} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_0.85fr]">
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>What Playfit knows so far</CardTitle>
              <CardDescription>
                Current confidence: {evidenceLabel}. Evidence stays separate from hypotheses.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <ProfileSignalList
                  title="Match signals"
                  signals={positiveSignals}
                  emptyCopy="More high ratings will surface stronger positive signals."
                  variant="positive"
                />
                <ProfileSignalList
                  title="Watch-outs"
                  signals={negativeSignals}
                  emptyCopy="No tag is net-negative after comparing it with your positive evidence."
                  variant="negative"
                />
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <SectionLabel className="mb-2">Positive evidence</SectionLabel>
                  <TagEvidenceChips
                    entries={tagEvidence.higherRatedTags}
                    variant="positive"
                    dominantSide="positive"
                    emptyCopy="No clear higher-rated tags yet."
                  />
                </div>
                <div>
                  <SectionLabel className="mb-2">Lower-rated evidence</SectionLabel>
                  <TagEvidenceChips
                    entries={tagEvidence.lowerRatedTags}
                    variant="warning"
                    dominantSide="negative"
                    emptyCopy="No tags from lower ratings yet."
                  />
                </div>
              </div>
              <Separator />
              <div className="grid gap-3">
                <div>
                  <SectionLabel className="mb-2">Possible friction</SectionLabel>
                  {tagEvidence.badGameCount < 2 ? (
                    <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                      Not enough lower ratings to isolate dislike reasons yet.
                    </p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <SectionLabel className="mb-2">Unique to lower ratings</SectionLabel>
                        <DislikeReasonChips
                          entries={tagEvidence.uniqueLowerRatedTags}
                          variant="negative"
                          emptyCopy="No tags are exclusive to lower ratings yet."
                        />
                      </div>
                      <div>
                        <SectionLabel className="mb-2">
                          Overrepresented in lower ratings
                        </SectionLabel>
                        <DislikeReasonChips
                          entries={tagEvidence.overrepresentedLowerRatedTags}
                          variant="warning"
                          emptyCopy="No shared tags are clearly overrepresented yet."
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="grid content-start gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Ratings</CardTitle>
              <CardDescription>Distribution and the most recently updated scores.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <SectionLabel>Distribution</SectionLabel>
                    <p className="text-sm text-muted-foreground">
                      Scores grouped from 1 to 5 stars.
                    </p>
                  </div>
                  <Badge variant="secondary">{analytics.rated.length} total</Badge>
                </div>
                {analytics.rated.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Rate games to see your score distribution.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {ratingBuckets.map((bucket) => {
                      const count = analytics.ratingDistribution[bucket];
                      const width = count > 0 ? `${(count / maxRatingBucketCount) * 100}%` : "0%";
                      return (
                        <div
                          key={bucket}
                          className="grid grid-cols-[2rem_1fr_2rem] items-center gap-3 text-sm"
                        >
                          <span className="font-mono text-xs text-muted-foreground">{bucket}</span>
                          <div
                            role="img"
                            className="h-2 overflow-hidden rounded-full bg-secondary"
                            aria-label={`${count} ratings near ${bucket} stars`}
                          >
                            <div className="h-full rounded-full bg-accent" style={{ width }} />
                          </div>
                          <span className="text-right font-mono text-xs text-muted-foreground">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <Separator />
              <div className="grid gap-3">
                <div>
                  <SectionLabel>Latest ratings</SectionLabel>
                  <p className="text-sm text-muted-foreground">Most recently updated scores.</p>
                </div>
                {latestRatings.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    Rate a game to start this list.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {latestRatings.map(({ entry, game }) => (
                      <button
                        key={entry.gameId}
                        type="button"
                        aria-label={`Open ${game.title} dossier`}
                        className="grid grid-cols-[2.75rem_1fr_auto] items-center gap-3 rounded-md border border-border bg-secondary p-2 text-left transition-all duration-150 hover:bg-secondary/70 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => openDossier(entry.gameId)}
                      >
                        <CoverArt game={game} className="aspect-[2/3] w-11" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{game.title}</p>
                          {entry.rating != null && entry.rating > 0 ? (
                            <StarRating value={entry.rating} readOnly />
                          ) : null}
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Profile tools</CardTitle>
              <CardDescription>Recalculate after new ratings or library changes.</CardDescription>
            </CardHeader>
            <CardContent>
              <Stack direction="row" wrap gap={2}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSaving}
                  onClick={refreshAdaptiveProfile}
                >
                  <RefreshCcw className={`size-4 ${isSaving ? "animate-spin" : ""}`} /> Refresh
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setShowResetConfirm(true)}
                >
                  <RotateCcw className="size-4" /> Reset
                </Button>
                <Button type="button" variant="outline" onClick={signOut}>
                  <LogOut className="size-4" /> Sign out
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        title="Reset your data?"
      >
        <p className="text-sm text-muted-foreground">
          This will erase your profile, ratings, and all saved data. This action cannot be undone.
        </p>
        <div className="mt-4 flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setShowResetConfirm(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              resetLocalState();
              setShowResetConfirm(false);
            }}
          >
            Reset everything
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
