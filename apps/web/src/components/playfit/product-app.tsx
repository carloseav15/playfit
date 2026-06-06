"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  buildTagPreferenceAnalysis,
  buildTodayModel,
  canAdvanceOnboarding,
  type ProductGameState,
  type ProductProfile,
  type ProductRating,
  type ProductTagPreferenceAnalysis,
  type ProductTagPreferenceEntry,
  type RankedSeedGame,
  type SeedGame,
  scoreSeedGame,
} from "@playfit/core";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Gamepad2,
  Library,
  LogOut,
  Radar,
  RefreshCcw,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  ThumbsDown,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CoverArt } from "./cover-art";
import { Metric } from "./metric";
import { type ProductTab, usePlayfit } from "./playfit-context";
import {
  confidenceLabel,
  decisionLabel,
  decisionTone,
  formatGenre,
  primaryReason,
  statusOptions,
  statusPriority,
} from "./product-utils";
import { SectionHead } from "./section-head";
import { StarRating } from "./star-rating";
import { StatusToast } from "./status-toast";

const tabItems: Array<{ tab: ProductTab; label: string; icon: typeof Gamepad2 }> = [
  { tab: "today", label: "Today", icon: CalendarDays },
  { tab: "library", label: "My Games", icon: Library },
  { tab: "finder", label: "Search", icon: Search },
  { tab: "upcoming", label: "Upcoming", icon: Radar },
  { tab: "profile", label: "Profile", icon: Settings2 },
  { tab: "onboarding", label: "Setup", icon: Sparkles },
];

const onboardingSchema = z.object({
  platforms: z.array(z.string()).min(1, "Select at least one platform to start."),
});

type RatingBucket = 1 | 2 | 3 | 4 | 5;

const ratingBuckets: RatingBucket[] = [1, 2, 3, 4, 5];

function getRatingBucket(rating: ProductRating): RatingBucket {
  return Math.min(5, Math.max(1, Math.round(rating))) as RatingBucket;
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
  return tag.replace(/_/g, " ");
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
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
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
    <div className="flex flex-wrap gap-2">
      {entries.map((entry) => (
        <Badge key={entry.tag} variant={variant}>
          {formatTagEvidence(entry, dominantSide)}
        </Badge>
      ))}
    </div>
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
    <div className="flex flex-wrap gap-2">
      {entries.map((entry) => (
        <Badge key={entry.tag} variant={variant}>
          {formatDislikeReasonEvidence(entry)}
        </Badge>
      ))}
    </div>
  );
}

// biome-ignore lint/correctness/noUnusedVariables: retained for recommendation card reuse.
function RankedCard({
  title,
  entry,
  actionLabel = "Open dossier",
  showDismiss,
}: {
  title: string;
  entry: RankedSeedGame | null;
  actionLabel?: string;
  showDismiss?: boolean;
}) {
  const { openDossier, excludeGame } = usePlayfit();

  if (!entry) {
    return (
      <Card className="min-h-56 border-dashed">
        <CardHeader>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {title}
          </p>
          <CardTitle>Not enough data yet</CardTitle>
          <CardDescription>
            Keep adding games and ratings — the picks get better with every one.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <motion.div whileHover={{ y: -2 }} transition={{ duration: 0.18 }}>
      <Card className="h-full overflow-hidden bg-card/84">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {title}
              </p>
              <CardTitle>{entry.game.title}</CardTitle>
            </div>
            <Badge variant={decisionTone(entry)}>{decisionLabel(entry)}</Badge>
          </div>
          <CardDescription>{primaryReason(entry)}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <Metric label="Fit" value={entry.affinityScore} />
            <Metric label="Friction" value={entry.riskScore} />
            <Metric label="Signal" value={confidenceLabel(entry.confidence)} />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              className="flex-1"
              onClick={() => openDossier(entry.game.gameId)}
            >
              {actionLabel} <ChevronRight className="size-4" />
            </Button>
            {showDismiss && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-negative"
                onClick={() => excludeGame(entry.game.gameId)}
                aria-label={`Not for me: ${entry.game.title}`}
                title="Not for me"
              >
                <ThumbsDown className="size-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function NavButton({
  tab,
  label,
  icon: Icon,
}: {
  tab: ProductTab;
  label: string;
  icon: typeof Gamepad2;
}) {
  const { ui, setUi } = usePlayfit();
  const active = ui.activeTab === tab;

  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-3 text-left text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        active &&
          "border border-[color-mix(in_srgb,var(--accent),transparent_62%)] bg-[color-mix(in_srgb,var(--accent),transparent_88%)] text-foreground",
      )}
      aria-current={active ? "page" : undefined}
      onClick={() =>
        setUi((current) => ({
          ...current,
          activeTab: tab,

          profileMode: "overview",
        }))
      }
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </button>
  );
}

function SaveIndicator() {
  const { isSaving } = usePlayfit();
  if (!isSaving) return null;
  return <span className="inline-block size-1.5 animate-pulse rounded-full bg-positive" />;
}

function ProductShell() {
  const { state, ui } = usePlayfit();
  const showSetup = !state.user.onboardingCompletedAt;
  const visibleTabs = tabItems.filter((t) => showSetup || t.tab !== "onboarding");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen md:grid-cols-[240px_1fr]">
        <aside className="sticky top-0 hidden h-screen border-r border-border bg-card/72 p-5 backdrop-blur-xl md:grid md:grid-rows-[auto_1fr_auto]">
          <div className="flex items-center gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Playfit
              </p>
              <strong className="font-display text-xl">Find your next game</strong>
            </div>
            <SaveIndicator />
          </div>
          <nav className="mt-8 grid content-start gap-2" aria-label="Main navigation">
            {visibleTabs.map((item) => (
              <NavButton key={item.tab} {...item} />
            ))}
          </nav>
          <p className="text-sm text-muted-foreground">Find your next game.</p>
        </aside>

        <div className="min-w-0 pb-20 md:pb-0">
          <header className="border-b border-border bg-background/90 p-4 backdrop-blur-xl md:hidden">
            <div className="flex items-center gap-2">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Playfit
                </p>
                <strong className="font-display text-xl">Find your next game</strong>
              </div>
              <SaveIndicator />
            </div>
          </header>
          <main className="mx-auto grid w-[min(1180px,calc(100%-2rem))] gap-6 py-6 md:py-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={ui.activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                <ActiveSection />
              </motion.div>
            </AnimatePresence>
          </main>
          <nav
            className={`fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-background/95 p-2 backdrop-blur-xl md:hidden ${showSetup ? "grid-cols-6" : "grid-cols-5"}`}
            aria-label="Main navigation"
          >
            {visibleTabs.map(({ tab, label, icon: Icon }) => (
              <MobileNavButton key={tab} tab={tab} label={label} icon={Icon} />
            ))}
          </nav>
        </div>
      </div>
      <StatusToast />
    </div>
  );
}

function MobileNavButton({
  tab,
  label,
  icon: Icon,
}: {
  tab: ProductTab;
  label: string;
  icon: typeof Gamepad2;
}) {
  const { ui, setUi } = usePlayfit();
  const active = ui.activeTab === tab;
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "grid place-items-center gap-1 rounded-md p-2 text-[0.68rem] font-bold text-muted-foreground cursor-pointer",
        active && "bg-secondary text-foreground",
      )}
      aria-current={active ? "page" : undefined}
      onClick={() => setUi((current) => ({ ...current, activeTab: tab }))}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function ActiveSection() {
  const { state, ui, setUi } = usePlayfit();
  if (ui.activeTab === "onboarding") {
    if (state.user.onboardingCompletedAt) {
      setUi((current) => ({
        ...current,
        activeTab: "today",

        profileMode: "overview",
      }));
      return null;
    }
    return <OnboardingSection />;
  }
  if (ui.activeTab === "library") return <LibrarySection />;
  if (ui.activeTab === "finder") return <FinderSection />;
  if (ui.activeTab === "profile") return <ProfileSection />;
  if (ui.activeTab === "upcoming") return <UpcomingSection />;
  return <TodaySection />;
}

function OnboardingSection() {
  const { seedData, state, ui, setUi, updateState, searchGames, buildProfileFromCurrentData } =
    usePlayfit();
  const draft = state.user.onboarding;
  const platformForm = useForm<{ platforms: string[] }>({
    resolver: zodResolver(onboardingSchema),
    values: { platforms: draft.platforms.map((entry) => entry.platformId) },
  });
  const anchorResults = searchGames(ui.onboardingQuery).slice(0, 8);
  const canAdvance = canAdvanceOnboarding(draft);
  const allSelected = draft.platforms.length === seedData.platforms.length;

  function togglePlatform(platformId: string, checked: boolean) {
    updateState((next) => {
      next.user.onboarding.platforms = next.user.onboarding.platforms.filter(
        (entry) => entry.platformId !== platformId,
      );
      if (checked) {
        next.user.onboarding.platforms.push({ platformId, status: "available" });
      }
    });
  }

  function toggleAllPlatforms() {
    updateState((next) => {
      if (allSelected) {
        next.user.onboarding.platforms = [];
      } else {
        next.user.onboarding.platforms = seedData.platforms.map((p) => ({
          platformId: p.platformId,
          status: "available" as const,
        }));
      }
    });
    platformForm.setValue(
      "platforms",
      allSelected ? [] : seedData.platforms.map((p) => p.platformId),
      { shouldDirty: true },
    );
  }

  function addAnchor(game: SeedGame) {
    updateState((next) => {
      next.user.onboarding.likedGameIds = [
        ...new Set([...next.user.onboarding.likedGameIds, game.gameId]),
      ];
      next.user.gameStates[game.gameId] ??= {
        gameId: game.gameId,
        title: game.title,
        inBacklog: false,
        inWishlist: false,
        source: "onboarding",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function removeAnchor(gameId: string) {
    updateState((next) => {
      next.user.onboarding.likedGameIds = next.user.onboarding.likedGameIds.filter(
        (id) => id !== gameId,
      );
    });
  }

  function finalize() {
    updateState((next) => {
      next.user.profile = buildProfileFromCurrentData();
      next.user.onboardingCompletedAt = new Date().toISOString();
    });
    setUi((current) => ({
      ...current,
      activeTab: "today",
      statusMessage: "You're all set. Here are your first picks.",
    }));
  }

  return (
    <section>
      <SectionHead
        eyebrow="Setup"
        title={draft.step === "platforms" ? "What are you gaming on?" : "Pick three games you love"}
        copy={
          draft.step === "platforms"
            ? "Pick the platforms you can use right now."
            : "Choose games you already know you like so Playfit can learn your taste."
        }
      />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <Badge variant={draft.step === "platforms" ? "info" : "secondary"}>1 Platforms</Badge>
            <Badge variant={draft.step === "anchors" ? "info" : "secondary"}>
              {draft.likedGameIds.length} / 3 Anchors
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {draft.step === "platforms" ? (
            <form
              className="grid gap-4"
              onSubmit={platformForm.handleSubmit(() => {
                updateState((next) => {
                  next.user.onboarding.step = "anchors";
                });
              })}
            >
              <p className="text-sm text-muted-foreground">
                Select the platforms you own so Playfit can recommend games you can actually play.
              </p>
              <button
                type="button"
                aria-pressed={allSelected}
                onClick={toggleAllPlatforms}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border bg-secondary px-4 text-left transition-colors hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="grid size-4 place-items-center rounded-[3px] border border-border bg-transparent">
                  {allSelected && <Check className="size-3 text-positive" />}
                </span>
                <span className="flex-1 text-sm font-bold">
                  {allSelected ? "Deselect all platforms" : "Select all platforms"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {draft.platforms.length} / {seedData.platforms.length}
                </span>
              </button>
              {(["nintendo", "playstation", "xbox", "sega", "pc", "other"] as const).map(
                (family) => {
                  const group = seedData.platforms
                    .filter((p) => p.family === family)
                    .sort((a, b) => a.sortOrder - b.sortOrder);
                  if (group.length === 0) return null;
                  const label = {
                    nintendo: "Nintendo",
                    playstation: "PlayStation",
                    xbox: "Xbox",
                    sega: "SEGA",
                    pc: "PC",
                    other: "Other",
                  }[family];
                  const consoles = group.filter((p) => p.kind !== "handheld");
                  const handhelds = group.filter((p) => p.kind === "handheld");
                  return (
                    <div key={family} className="grid gap-2">
                      {label !== "Other" && (
                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {label}
                        </p>
                      )}
                      {consoles.length > 0 && (
                        <div>
                          {handhelds.length > 0 && (
                            <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                              Console / Hybrid
                            </p>
                          )}
                          <div className="grid gap-2 md:grid-cols-2">
                            {consoles.map((platform) => {
                              const checked = draft.platforms.some(
                                (entry) => entry.platformId === platform.platformId,
                              );
                              return (
                                <label
                                  key={platform.platformId}
                                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border bg-secondary px-4 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:outline-none hover:bg-secondary/60"
                                >
                                  <input
                                    type="checkbox"
                                    value={platform.platformId}
                                    {...platformForm.register("platforms")}
                                    checked={checked}
                                    onChange={(event) =>
                                      togglePlatform(
                                        platform.platformId,
                                        event.currentTarget.checked,
                                      )
                                    }
                                  />
                                  <strong className="text-sm">{platform.displayName}</strong>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {handhelds.length > 0 && (
                        <div>
                          <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Handheld
                          </p>
                          <div className="grid gap-2 md:grid-cols-2">
                            {handhelds.map((platform) => {
                              const checked = draft.platforms.some(
                                (entry) => entry.platformId === platform.platformId,
                              );
                              return (
                                <label
                                  key={platform.platformId}
                                  className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border bg-secondary px-4 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:outline-none hover:bg-secondary/60"
                                >
                                  <input
                                    type="checkbox"
                                    value={platform.platformId}
                                    {...platformForm.register("platforms")}
                                    checked={checked}
                                    onChange={(event) =>
                                      togglePlatform(
                                        platform.platformId,
                                        event.currentTarget.checked,
                                      )
                                    }
                                  />
                                  <strong className="text-sm">{platform.displayName}</strong>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                },
              )}
              {platformForm.formState.errors.platforms ? (
                <p className="text-sm text-negative">
                  {platformForm.formState.errors.platforms.message}
                </p>
              ) : null}
              <Button type="submit" className="w-fit" disabled={draft.platforms.length === 0}>
                Continue <ChevronRight className="size-4" />
              </Button>
            </form>
          ) : (
            <div className="grid gap-5">
              <div className="grid gap-2">
                <label
                  className="text-sm font-bold text-muted-foreground"
                  htmlFor="favorite-search"
                >
                  Search by title, series, or genre
                </label>
                <Input
                  id="favorite-search"
                  type="search"
                  value={ui.onboardingQuery}
                  onChange={(event) =>
                    setUi((current) => ({ ...current, onboardingQuery: event.target.value }))
                  }
                  placeholder="Type a game title"
                />
              </div>
              {draft.likedGameIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {draft.likedGameIds.map((gameId) => {
                    const game = seedData.gamesById.get(gameId);
                    if (!game) return null;
                    return (
                      <span
                        key={gameId}
                        className="inline-flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-xs font-bold text-accent-foreground"
                      >
                        {game.title}
                        <button
                          type="button"
                          onClick={() => removeAnchor(gameId)}
                          className="rounded-sm opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`Remove ${game.title}`}
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {anchorResults.map((game) => {
                  const selected = draft.likedGameIds.includes(game.gameId);
                  return (
                    <button
                      key={game.gameId}
                      type="button"
                      aria-pressed={selected}
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-md border border-border bg-secondary p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected && "border-[color-mix(in_srgb,var(--accent),transparent_40%)]",
                      )}
                      onClick={() => addAnchor(game)}
                      disabled={selected}
                    >
                      <span>
                        <strong>{game.title}</strong>
                        <span className="block text-sm text-muted-foreground">
                          {game.series || formatGenre(game.primaryGenre)}
                        </span>
                      </span>
                      {selected ? (
                        <Check className="size-4 text-positive" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() =>
                    updateState((next) => {
                      next.user.onboarding.step = "platforms";
                    })
                  }
                >
                  Back
                </Button>
                <Button type="button" disabled={!canAdvance} onClick={finalize}>
                  Create my profile
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function TodaySkeleton() {
  return (
    <section>
      <SectionHead
        eyebrow="Today"
        title="Today's picks"
        copy="What you're playing, what's next, and what to pick back up."
      />
      <div className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="min-h-56">
            <CardHeader>
              <Skeleton className="mb-2 h-3 w-16" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-56" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
              <Skeleton className="mt-4 h-9 w-full" />
            </CardContent>
          </Card>
          <Card className="min-h-56">
            <CardHeader>
              <Skeleton className="mb-2 h-3 w-16" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-56" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
              <Skeleton className="mt-4 h-9 w-full" />
            </CardContent>
          </Card>
          <Card className="min-h-56">
            <CardHeader>
              <Skeleton className="mb-2 h-3 w-16" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-56" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
              <Skeleton className="mt-4 h-9 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function CarouselCard({
  entry,
  rank,
  statusLabel,
}: {
  entry: RankedSeedGame;
  rank?: number;
  statusLabel?: string;
}) {
  const { openDossier } = usePlayfit();

  const barColor =
    entry.affinityScore >= 78
      ? "var(--positive)"
      : entry.affinityScore >= 62
        ? "var(--warning)"
        : "var(--muted-foreground)";

  return (
    <motion.button
      type="button"
      whileHover={{ scale: 1.04 }}
      transition={{ duration: 0.18 }}
      onClick={() => openDossier(entry.game.gameId)}
      className="w-36 shrink-0 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative">
        <CoverArt game={entry.game} className="aspect-[2/3]" />
        {rank != null && (
          <span className="absolute left-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-background/80 text-xs font-bold backdrop-blur-sm">
            {rank}
          </span>
        )}
        <span
          className={cn(
            "absolute right-1.5 top-1.5 rounded-md px-1.5 py-0.5 text-xs font-bold backdrop-blur-sm",
            entry.affinityScore >= 78
              ? "bg-positive/80"
              : entry.affinityScore >= 62
                ? "bg-warning/80"
                : "bg-muted/80",
          )}
        >
          {entry.affinityScore}
        </span>
      </div>
      <div className="mt-1.5 grid gap-1">
        <p className="truncate text-sm font-medium leading-tight">{entry.game.title}</p>
        <div className="h-1 w-full rounded-full bg-muted-foreground/20">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${entry.affinityScore}%`, backgroundColor: barColor }}
          />
        </div>
        {statusLabel && <p className="text-xs text-muted-foreground">{statusLabel}</p>}
      </div>
    </motion.button>
  );
}

function TodaySection() {
  const { seedData, state, setUi } = usePlayfit();
  const model = useMemo(() => {
    if (!state.user.profile) return null;
    return buildTodayModel(seedData.catalogGames, state, state.user.profile, seedData.gamesById);
  }, [
    seedData.catalogGames,
    state.user.profile,
    state.user.gameStates,
    state.user.onboarding.platforms,
  ]);

  if (!model) return <TodaySkeleton />;

  if (!state.user.onboardingCompletedAt) {
    return (
      <section>
        <SectionHead
          eyebrow="Today"
          title="Complete setup first"
          copy="Playfit needs platforms and a few games you love before it can make useful recommendations."
        />
        <Button
          type="button"
          onClick={() => setUi((current) => ({ ...current, activeTab: "onboarding" }))}
        >
          Go to setup
        </Button>
      </section>
    );
  }

  const hasAnyContent =
    model.currentRun.length > 0 || model.nextUp.length > 0 || model.resume.length > 0;

  if (!hasAnyContent) {
    return (
      <section>
        <SectionHead
          eyebrow="Today"
          title="Nothing to show yet"
          copy="Add games to your library and mark what you're playing — Playfit will surface your best picks here."
        />
        <Button
          type="button"
          onClick={() => setUi((current) => ({ ...current, activeTab: "finder" }))}
        >
          Browse games
        </Button>
      </section>
    );
  }

  return (
    <section>
      <SectionHead
        eyebrow="Today"
        title="Top picks for you"
        copy="Your best matches right now, ranked by fit."
      />
      <div className="grid gap-8">
        {model.nextUp.length > 0 && (
          <div className="grid gap-3">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <Sparkles className="size-3.5" />
              Top Picks
            </p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {model.nextUp.map((entry, i) => (
                <CarouselCard key={entry.game.gameId} entry={entry} rank={i + 1} />
              ))}
            </div>
          </div>
        )}
        {model.currentRun.length > 0 && (
          <div className="grid gap-3">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <Gamepad2 className="size-3.5" />
              Current Run
            </p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {model.currentRun.map((entry) => (
                <CarouselCard key={entry.game.gameId} entry={entry} statusLabel="Playing" />
              ))}
            </div>
          </div>
        )}
        {model.resume.length > 0 && (
          <div className="grid gap-3">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              <RotateCcw className="size-3.5" />
              Resume
            </p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {model.resume.map((entry) => (
                <CarouselCard key={entry.game.gameId} entry={entry} statusLabel="On hold" />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function FinderSection() {
  const { seedData, state, ui, setUi, openDossier, searchGames } = usePlayfit();
  const hasQuery = ui.finderQuery.trim().length > 0;
  const results = useMemo(() => {
    if (!hasQuery) return [];
    return searchGames(ui.finderQuery);
  }, [ui.finderQuery, hasQuery, searchGames]);

  return (
    <section>
      <SectionHead
        eyebrow="Search"
        title="Browse the catalog"
        copy="See how well a game fits before adding it to your library."
      />
      <Input
        type="search"
        aria-label="Search the catalog"
        value={ui.finderQuery}
        onChange={(event) => setUi((current) => ({ ...current, finderQuery: event.target.value }))}
        placeholder="Search a game..."
        className="mb-5 max-w-xl"
      />
      <div className="grid gap-3" role="status" aria-live="polite">
        {!hasQuery ? (
          <Card>
            <CardHeader>
              <CardTitle>Search the catalog</CardTitle>
              <CardDescription>
                Start typing a game title to see how well it fits your taste.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : results.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No results found</CardTitle>
              <CardDescription>Try a different search term.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          results.map((game) => {
            const ranked = state.user.profile
              ? scoreSeedGame(game, state, state.user.profile, seedData.gamesById)
              : null;
            return (
              <button
                key={game.gameId}
                type="button"
                className="grid grid-cols-[56px_1fr_auto] items-center gap-4 rounded-md border border-border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => openDossier(game.gameId)}
              >
                <CoverArt game={game} className="aspect-[2/3]" />
                <span>
                  <strong>{game.title}</strong>
                  <span className="block text-sm text-muted-foreground">
                    {game.series || formatGenre(game.primaryGenre)}
                  </span>
                </span>
                {ranked ? (
                  <Badge variant={decisionTone(ranked)}>{decisionLabel(ranked)}</Badge>
                ) : (
                  <Badge variant="secondary">Setup needed</Badge>
                )}
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function LibrarySection() {
  const { state, seedData, ui, setUi, openDossier } = usePlayfit();

  const allEntries = Object.values(state.user.gameStates).sort((a, b) => {
    switch (ui.librarySort) {
      case "rating-desc": {
        const ra = a.rating ?? -1;
        const rb = b.rating ?? -1;
        return rb - ra;
      }
      case "rating-asc": {
        const ra = a.rating ?? -1;
        const rb = b.rating ?? -1;
        return ra - rb;
      }
      case "status":
        return statusPriority(a.status) - statusPriority(b.status);
      default:
        return a.title.localeCompare(b.title);
    }
  });
  const entries = allEntries.filter((entry) =>
    entry.title.toLowerCase().includes(ui.libraryQuery.toLowerCase()),
  );

  const tabs: { key: typeof ui.libraryTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "backlog", label: "Backlog" },
    { key: "wishlist", label: "Wishlist" },
  ];

  const tabCounts = {
    all: allEntries.length,
    backlog: allEntries.filter((e) => e.inBacklog).length,
    wishlist: allEntries.filter((e) => e.inWishlist).length,
  };

  const filtered =
    ui.libraryTab === "all"
      ? entries
      : entries.filter((e) => (ui.libraryTab === "backlog" ? e.inBacklog : e.inWishlist));

  const sortOptions: { value: typeof ui.librarySort; label: string }[] = [
    { value: "title", label: "A-Z" },
    { value: "rating-desc", label: "Rating (best first)" },
    { value: "rating-asc", label: "Rating (worst first)" },
    { value: "status", label: "Status (most complete)" },
  ];

  return (
    <section>
      <SectionHead
        eyebrow="Library"
        title="My Games"
        copy="Track what you're playing, what's next, and what you thought of it."
      />
      <div className="mb-5 flex items-center gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            type="button"
            size="sm"
            variant={ui.libraryTab === tab.key ? "default" : "secondary"}
            aria-pressed={ui.libraryTab === tab.key}
            onClick={() => setUi((current) => ({ ...current, libraryTab: tab.key }))}
          >
            {tab.label}
            <span className="ml-1.5 text-xs opacity-70">({tabCounts[tab.key]})</span>
          </Button>
        ))}
      </div>
      <div className="mb-5 flex items-center gap-3">
        <Input
          type="search"
          aria-label="Search your games"
          value={ui.libraryQuery}
          onChange={(event) =>
            setUi((current) => ({ ...current, libraryQuery: event.target.value }))
          }
          placeholder="Search your games..."
          className="max-w-xl"
        />
        <Select
          value={ui.librarySort}
          onChange={(event) =>
            setUi((current) => ({
              ...current,
              librarySort: event.target.value as typeof ui.librarySort,
            }))
          }
          className="w-48 shrink-0"
          aria-label="Sort by"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>
      <div
        className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8"
        role="status"
        aria-live="polite"
      >
        {filtered.length === 0 ? (
          <Card className="col-span-full">
            <CardHeader>
              <CardTitle>
                {ui.libraryTab === "backlog"
                  ? "No games in backlog"
                  : ui.libraryTab === "wishlist"
                    ? "No games on wishlist"
                    : "No games yet"}
              </CardTitle>
              <CardDescription>
                {allEntries.length === 0
                  ? "Add games you love during setup, or save them from Search."
                  : "Try a different filter or search term."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          filtered
            .map((entry) => ({ entry, game: seedData.gamesById.get(entry.gameId) }))
            .filter((item): item is { entry: (typeof filtered)[number]; game: SeedGame } =>
              Boolean(item.game),
            )
            .map(({ entry, game }) => (
              <motion.button
                whileHover={{ y: -2 }}
                transition={{ duration: 0.18 }}
                key={entry.gameId}
                type="button"
                className="overflow-hidden rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => openDossier(entry.gameId)}
              >
                <CoverArt game={game} className="aspect-[2/3] w-full" />
                <div className="flex min-h-[18px] items-center justify-center px-1.5 pt-1">
                  {entry.rating != null && entry.rating > 0 ? (
                    <StarRating value={entry.rating} readOnly />
                  ) : null}
                </div>
                <div className="px-1.5 pb-1">
                  <p className="truncate text-[11px] font-medium leading-tight text-muted-foreground">
                    {game.title}
                  </p>
                  {entry.status &&
                    (() => {
                      const opt = statusOptions.find((s) => s.value === entry.status);
                      return opt ? (
                        <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
                          {opt.label}
                        </p>
                      ) : null;
                    })()}
                </div>
              </motion.button>
            ))
        )}
      </div>
    </section>
  );
}

function ProfileSection() {
  const {
    state,
    seedData,
    isSaving,
    refreshAdaptiveProfile,
    resetLocalState,
    signOut,
    openDossier,
  } = usePlayfit();
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const profile = state.user.profile;

  if (!profile) {
    return (
      <section>
        <SectionHead
          eyebrow="Profile"
          title="No profile yet"
          copy="Finish setup so Playfit can learn your taste."
        />
        <div className="mt-4 flex gap-2">
          <Button type="button" variant="outline" onClick={signOut}>
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </section>
    );
  }

  const analytics = getProfileAnalytics(state.user.gameStates);
  const maxRatingBucketCount = Math.max(...Object.values(analytics.ratingDistribution), 1);
  const tagEvidence = buildTagPreferenceAnalysis(
    state.user.onboarding,
    seedData.gamesById,
    state.user.gameStates,
  );
  const visibleSignals = getVisibleProfileSignals(profile, tagEvidence);
  const positiveSignals = visibleSignals.filter((signal) => signal.tone === "positive").slice(0, 3);
  const negativeSignals = visibleSignals.filter((signal) => signal.tone === "negative").slice(0, 3);
  const latestRatings = [...analytics.rated]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map((entry) => ({ entry, game: seedData.gamesById.get(entry.gameId) }))
    .filter((item): item is { entry: ProductGameState; game: SeedGame } => Boolean(item.game))
    .slice(0, 5);

  return (
    <section>
      <SectionHead eyebrow="Profile" title="Your taste" copy={profile.summary} />
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
              <CardTitle>Taste profile</CardTitle>
              <CardDescription>
                Positive drivers, net watch-outs, and the tags behind lower ratings.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-4 md:grid-cols-2">
                <ProfileSignalList
                  title="Top drivers"
                  signals={positiveSignals}
                  emptyCopy="More high ratings will surface stronger positive signals."
                  variant="positive"
                />
                <ProfileSignalList
                  title="Net watch-outs"
                  signals={negativeSignals}
                  emptyCopy="No tag is net-negative after comparing it with your positive evidence."
                  variant="negative"
                />
              </div>
              <Separator />
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Higher-rated tags
                  </p>
                  <TagEvidenceChips
                    entries={tagEvidence.higherRatedTags}
                    variant="positive"
                    dominantSide="positive"
                    emptyCopy="No clear higher-rated tags yet."
                  />
                </div>
                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Lower-rated evidence
                  </p>
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
                  <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Likely dislike reasons
                  </p>
                  {tagEvidence.badGameCount < 2 ? (
                    <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                      Not enough lower ratings to isolate dislike reasons yet.
                    </p>
                  ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Unique to lower ratings
                        </p>
                        <DislikeReasonChips
                          entries={tagEvidence.uniqueLowerRatedTags}
                          variant="negative"
                          emptyCopy="No tags are exclusive to lower ratings yet."
                        />
                      </div>
                      <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Overrepresented in lower ratings
                        </p>
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
                    <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Distribution
                    </p>
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
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Latest ratings
                  </p>
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
                        className="grid grid-cols-[2.75rem_1fr_auto] items-center gap-3 rounded-md border border-border bg-secondary p-2 text-left transition-colors hover:bg-secondary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              <CardDescription>Refresh the evidence after editing your library.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
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
              </div>
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

function UpcomingSection() {
  const { seedData, state, ui, setUi, openDossier, toggleFlag } = usePlayfit();
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const entries = useMemo(() => {
    return seedData.allGames
      .filter((game) => game.releaseState === "unreleased")
      .filter((game) => game.sortDate && game.sortDate >= tomorrow)
      .filter(
        (game) =>
          ui.upcomingPlatformFilters.size === 0 ||
          game.availablePlatformIds.some((id) => ui.upcomingPlatformFilters.has(id)),
      )
      .map((game) =>
        state.user.profile
          ? scoreSeedGame(game, state, state.user.profile, seedData.gamesById)
          : null,
      )
      .filter((entry): entry is RankedSeedGame => Boolean(entry))
      .sort((left, right) => (left.game.sortDate ?? "").localeCompare(right.game.sortDate ?? ""));
  }, [
    seedData.allGames,
    state.user.profile,
    state.user.gameStates,
    state.user.onboarding.platforms,
    ui.upcomingPlatformFilters,
    tomorrow,
  ]);

  return (
    <section>
      <SectionHead
        eyebrow="Upcoming"
        title="Release radar"
        copy="Track upcoming games and see how well they fit you."
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {(showAllPlatforms ? seedData.platforms : seedData.platforms.slice(0, 8)).map(
          (platform) => {
            const active = ui.upcomingPlatformFilters.has(platform.platformId);
            return (
              <Button
                key={platform.platformId}
                type="button"
                size="sm"
                variant={active ? "default" : "secondary"}
                aria-pressed={active}
                className="transition-colors"
                onClick={() =>
                  setUi((current) => {
                    const next = new Set(current.upcomingPlatformFilters);
                    if (next.has(platform.platformId)) next.delete(platform.platformId);
                    else next.add(platform.platformId);
                    return { ...current, upcomingPlatformFilters: next };
                  })
                }
              >
                {platform.displayName}
              </Button>
            );
          },
        )}
        {seedData.platforms.length > 8 && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setShowAllPlatforms((v) => !v)}
          >
            {showAllPlatforms ? "Show fewer" : `Show all (${seedData.platforms.length})`}
          </Button>
        )}
      </div>
      {entries.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No upcoming games found</CardTitle>
            <CardDescription>
              Try adjusting your platform filters or check back later for new releases.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {entries.slice(0, 18).map((entry) => (
            <Card key={entry.game.gameId}>
              <CardHeader className="grid gap-3 md:grid-cols-[1fr_auto]">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={decisionTone(entry)}>{decisionLabel(entry)}</Badge>
                    <Badge variant="secondary">
                      {entry.game.releaseLabel ?? entry.game.sortDate}
                    </Badge>
                  </div>
                  <CardTitle className="mt-3">{entry.game.title}</CardTitle>
                  <CardDescription>{primaryReason(entry)}</CardDescription>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => toggleFlag(entry.game.gameId, "inWishlist")}
                  >
                    {entry.inWishlist ? "Watching" : "Watch"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => openDossier(entry.game.gameId)}
                  >
                    See why
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

export function ProductApp() {
  return <ProductShell />;
}
