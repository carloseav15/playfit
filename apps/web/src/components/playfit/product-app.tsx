"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  applyProfileOverrides,
  buildFinderIndex,
  buildTodayModel,
  canAdvanceOnboarding,
  HIGH_FRICTION_THRESHOLD,
  PROMISING_FIT_THRESHOLD,
  type ProductPlayStatus,
  type ProductProfile,
  type ProductRating,
  type RankedSeedGame,
  type SeedGame,
  STRONG_FIT_THRESHOLD,
  scoreSeedGame,
  searchSeedGames,
} from "@playfit/core";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  type Gamepad2,
  Library,
  Radar,
  RefreshCcw,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import { PlayfitProvider, type ProductTab, usePlayfit } from "./playfit-context";

const tabItems: Array<{ tab: ProductTab; label: string; icon: typeof Gamepad2 }> = [
  { tab: "today", label: "Today", icon: CalendarDays },
  { tab: "library", label: "My Games", icon: Library },
  { tab: "finder", label: "Search", icon: Search },
  { tab: "upcoming", label: "Upcoming", icon: Radar },
  { tab: "profile", label: "Profile", icon: Settings2 },
  { tab: "onboarding", label: "Setup", icon: Sparkles },
];

const statusOptions: Array<{ value: ProductPlayStatus | ""; label: string }> = [
  { value: "", label: "No status" },
  { value: "playing", label: "Playing" },
  { value: "on_hold", label: "On hold" },
  { value: "shelved", label: "Shelved" },
  { value: "beaten", label: "Finished story" },
  { value: "completed", label: "Completed 100%" },
  { value: "abandoned", label: "Abandoned" },
];

const onboardingSchema = z.object({
  platforms: z.array(z.string()).min(1, "Pick at least one platform."),
});

function formatGenre(value: string) {
  return value.replaceAll("_", " ");
}

function confidenceLabel(value: RankedSeedGame["confidence"]) {
  if (value === "high") return "Strong signal";
  if (value === "medium") return "Good signal";
  return "Early signal";
}

function decisionTone(entry: RankedSeedGame): "positive" | "warning" | "negative" | "accent" {
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD) return "negative";
  if (entry.affinityScore >= STRONG_FIT_THRESHOLD && entry.riskScore <= 35) return "positive";
  if (entry.affinityScore >= PROMISING_FIT_THRESHOLD) return "accent";
  return "warning";
}

function decisionLabel(entry: RankedSeedGame) {
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD) return "High friction";
  if (entry.affinityScore >= STRONG_FIT_THRESHOLD) return "Strong fit";
  if (entry.affinityScore >= PROMISING_FIT_THRESHOLD) return "Promising fit";
  return "Early read";
}

function primaryReason(entry: RankedSeedGame) {
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD && entry.cautionReasons[0]) {
    return entry.cautionReasons[0];
  }
  return entry.fitReasons[0] ?? "Playfit needs more signal before making a confident call.";
}

function CoverArt({ game, className }: { game: SeedGame; className?: string }) {
  const src = game.coverPath || game.externalCoverUrl;
  return (
    <div className={cn("overflow-hidden rounded-md border border-border bg-muted", className)}>
      {src ? (
        // biome-ignore lint/performance/noImgElement: cover art can be local or external CSV data.
        <img src={src} alt={`${game.title} cover art`} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full min-h-32 place-items-center p-4 text-center text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">
          {game.title.slice(0, 2)}
        </div>
      )}
    </div>
  );
}

function RankedCard({
  title,
  entry,
  actionLabel = "Open dossier",
}: {
  title: string;
  entry: RankedSeedGame | null;
  actionLabel?: string;
}) {
  const { openDossier } = usePlayfit();

  if (!entry) {
    return (
      <Card className="min-h-56 border-dashed">
        <CardHeader>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
            {title}
          </p>
          <CardTitle>Not enough signal yet</CardTitle>
          <CardDescription>
            Add platforms, anchors, ratings, or library states to sharpen this surface.
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
              <p className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
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
          <Button type="button" variant="secondary" onClick={() => openDossier(entry.game.gameId)}>
            {actionLabel} <ChevronRight className="size-4" />
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-secondary p-3">
      <span className="block text-muted-foreground">{label}</span>
      <strong className="block truncate font-mono text-sm">{value}</strong>
    </div>
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
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-md px-3 text-left text-sm font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        active &&
          "border border-[color-mix(in_srgb,var(--accent),transparent_62%)] bg-[color-mix(in_srgb,var(--accent),transparent_88%)] text-foreground",
      )}
      aria-current={active ? "page" : undefined}
      onClick={() =>
        setUi((current) => ({
          ...current,
          activeTab: tab,
          dossierGameId: null,
          profileMode: "overview",
        }))
      }
    >
      <Icon className="size-4" />
      <span>{label}</span>
    </button>
  );
}

function ProductShell() {
  const { ui } = usePlayfit();

  return (
    <div className="theme-app min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen md:grid-cols-[240px_1fr]">
        <aside className="sticky top-0 hidden h-screen border-r border-border bg-card/72 p-5 backdrop-blur-xl md:grid md:grid-rows-[auto_1fr_auto]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
              Playfit
            </p>
            <strong className="font-display text-xl">Find your next game</strong>
          </div>
          <nav className="mt-8 grid content-start gap-2" aria-label="Main navigation">
            {tabItems.map((item) => (
              <NavButton key={item.tab} {...item} />
            ))}
          </nav>
          <p className="text-sm text-muted-foreground">Local-first recommendation engine.</p>
        </aside>

        <div className="min-w-0 pb-20 md:pb-0">
          <header className="border-b border-border bg-background/90 p-4 backdrop-blur-xl md:hidden">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
              Playfit
            </p>
            <strong className="font-display text-xl">Find your next game</strong>
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
          <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-border bg-background/95 p-2 backdrop-blur-xl md:hidden">
            {tabItems.map(({ tab, label, icon: Icon }) => (
              <MobileNavButton key={tab} tab={tab} label={label} icon={Icon} />
            ))}
          </nav>
        </div>
      </div>
      <DossierOverlay />
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
      className={cn(
        "grid place-items-center gap-1 rounded-md p-2 text-[0.68rem] font-bold text-muted-foreground",
        active && "bg-secondary text-foreground",
      )}
      onClick={() => setUi((current) => ({ ...current, activeTab: tab, dossierGameId: null }))}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function ActiveSection() {
  const { ui } = usePlayfit();
  if (ui.activeTab === "onboarding") return <OnboardingSection />;
  if (ui.activeTab === "library") return <LibrarySection />;
  if (ui.activeTab === "finder") return <FinderSection />;
  if (ui.activeTab === "profile") return <ProfileSection />;
  if (ui.activeTab === "upcoming") return <UpcomingSection />;
  return <TodaySection />;
}

function SectionHead({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="mb-6 grid gap-2">
      <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--ink)]">{eyebrow}</p>
      <h1 className="font-display text-4xl font-black tracking-tight md:text-5xl">{title}</h1>
      <p className="max-w-2xl text-muted-foreground">{copy}</p>
    </div>
  );
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
        title={draft.step === "platforms" ? "What are you gaming on?" : "Pick three anchor games"}
        copy={
          draft.step === "platforms"
            ? "Pick the platforms you can use right now."
            : "Choose games you already know you like so Playfit can create a first profile."
        }
      />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2">
            <Badge variant={draft.step === "platforms" ? "accent" : "secondary"}>1 Platforms</Badge>
            <Badge variant={draft.step === "anchors" ? "accent" : "secondary"}>2 Anchors</Badge>
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
              <div className="grid gap-3 md:grid-cols-2">
                {seedData.platforms.slice(0, 10).map((platform) => {
                  const checked = draft.platforms.some(
                    (entry) => entry.platformId === platform.platformId,
                  );
                  return (
                    <label
                      key={platform.platformId}
                      className="flex min-h-14 items-center gap-3 rounded-md border border-border bg-secondary px-4"
                    >
                      <input
                        type="checkbox"
                        value={platform.platformId}
                        {...platformForm.register("platforms")}
                        checked={checked}
                        onChange={(event) =>
                          togglePlatform(platform.platformId, event.currentTarget.checked)
                        }
                      />
                      <span>
                        <strong>{platform.displayName}</strong>
                        <span className="ml-2 text-muted-foreground" aria-hidden="true">
                          {platform.family}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {platformForm.formState.errors.platforms ? (
                <p className="text-sm text-rose-300">
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
                <label className="text-sm font-bold text-muted-foreground" htmlFor="anchor-search">
                  Search by title, series, or genre
                </label>
                <Input
                  id="anchor-search"
                  type="search"
                  value={ui.onboardingQuery}
                  onChange={(event) =>
                    setUi((current) => ({ ...current, onboardingQuery: event.target.value }))
                  }
                  placeholder="Type a game title"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {anchorResults.map((game) => {
                  const selected = draft.likedGameIds.includes(game.gameId);
                  return (
                    <button
                      key={game.gameId}
                      type="button"
                      className={cn(
                        "flex items-center justify-between gap-3 rounded-md border border-border bg-secondary p-3 text-left",
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
                        <Check className="size-4 text-emerald-300" />
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
                  Build my profile
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function TodaySection() {
  const { seedData, state, setUi } = usePlayfit();
  const model = useMemo(
    () => buildTodayModel(seedData.catalogGames, state, state.user.profile, seedData.gamesById),
    [seedData, state],
  );

  if (!state.user.onboardingCompletedAt) {
    return (
      <section>
        <SectionHead
          eyebrow="Today"
          title="Start with setup first"
          copy="Playfit needs platforms and a few anchor games before it can make a useful recommendation."
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

  return (
    <section>
      <SectionHead
        eyebrow="Today"
        title="Your play decision board"
        copy="Current run, next up, resume, and avoid signals are separated so the recommendation stays legible."
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <RankedCard title="Current run" entry={model.currentRun} />
        <RankedCard title="Next up" entry={model.nextUp} />
        <RankedCard title="Resume" entry={model.resume} />
        <RankedCard title="Avoid for now" entry={model.avoid} />
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <RankedCard title="Wishlist fit" entry={model.wishlistFit} />
        <RankedCard title="Worth tracking" entry={model.worthTracking} />
        <RankedCard title="Playable alternative" entry={model.playableAlternative} />
      </div>
    </section>
  );
}

function FinderSection() {
  const { seedData, state, ui, setUi, openDossier } = usePlayfit();
  const results = useMemo(() => {
    return searchSeedGames(seedData.allGames, ui.finderQuery, buildFinderIndex(seedData.allGames));
  }, [seedData.allGames, ui.finderQuery]);

  return (
    <section>
      <SectionHead
        eyebrow="Finder"
        title="Search the catalog"
        copy="See predicted affinity and risk even before a game is in My Games."
      />
      <Input
        type="search"
        value={ui.finderQuery}
        onChange={(event) => setUi((current) => ({ ...current, finderQuery: event.target.value }))}
        placeholder="Search a game..."
        className="mb-5 max-w-xl"
      />
      <div className="grid gap-3">
        {results.map((game) => {
          const ranked = state.user.profile
            ? scoreSeedGame(game, state, state.user.profile, seedData.gamesById)
            : null;
          return (
            <button
              key={game.gameId}
              type="button"
              className="grid grid-cols-[56px_1fr_auto] items-center gap-4 rounded-md border border-border bg-card p-3 text-left"
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
        })}
      </div>
    </section>
  );
}

function LibrarySection() {
  const { state, seedData, ui, setUi, openDossier } = usePlayfit();
  const entries = Object.values(state.user.gameStates)
    .filter((entry) => entry.title.toLowerCase().includes(ui.libraryQuery.toLowerCase()))
    .sort((left, right) => left.title.localeCompare(right.title));

  return (
    <section>
      <SectionHead
        eyebrow="Library"
        title="My Games"
        copy="Track status, backlog, wishlist, and ratings as explicit taste evidence."
      />
      <Input
        type="search"
        value={ui.libraryQuery}
        onChange={(event) => setUi((current) => ({ ...current, libraryQuery: event.target.value }))}
        placeholder="Search your games..."
        className="mb-5 max-w-xl"
      />
      <div className="grid gap-3">
        {entries.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>No games yet</CardTitle>
              <CardDescription>Add anchors or save games from Finder.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          entries.map((entry) => {
            const game = seedData.gamesById.get(entry.gameId);
            return (
              <button
                key={entry.gameId}
                type="button"
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-card p-4 text-left"
                onClick={() => openDossier(entry.gameId)}
              >
                <span>
                  <strong>{entry.title}</strong>
                  <span className="block text-sm text-muted-foreground">
                    {entry.status ?? "No status"} ·{" "}
                    {entry.rating ? `${entry.rating} stars` : "No rating"}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {entry.inBacklog ? <Badge variant="accent">Backlog</Badge> : null}
                  {entry.inWishlist ? <Badge variant="warning">Wishlist</Badge> : null}
                  {game ? <ChevronRight className="size-4" /> : null}
                </span>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}

function ProfileSection() {
  const { state, updateState, refreshAdaptiveProfile, resetLocalState } = usePlayfit();
  const profile = state.user.profile;

  if (!profile) {
    return (
      <section>
        <SectionHead
          eyebrow="Profile"
          title="No profile yet"
          copy="Finish onboarding to create a first taste profile."
        />
      </section>
    );
  }

  const rated = Object.values(state.user.gameStates).filter((entry) => entry.rating != null);

  function togglePriority(key: keyof ProductProfile["priorities"]) {
    updateState((next) => {
      if (!next.user.profile) return;
      const current = next.user.profile.priorities[key];
      const value = current === "high" ? "low" : "high";
      next.user.profile.priorities[key] = value;
      next.user.profileOverrides.priorities = {
        ...next.user.profileOverrides.priorities,
        [key]: value,
      };
      next.user.profile = applyProfileOverrides(next.user.profile, next.user.profileOverrides);
    });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state.user, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `playfit-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  return (
    <section>
      <SectionHead eyebrow="Profile" title="Taste profile" copy={profile.summary} />
      <div className="grid gap-4 lg:grid-cols-[1fr_0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Signals</CardTitle>
            <CardDescription>
              {rated.length} rated games are informing this profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {profile.signals.map((signal) => (
              <div key={signal.id} className="rounded-md border border-border bg-secondary p-3">
                <Badge variant={signal.tone === "positive" ? "positive" : "negative"}>
                  {signal.label}
                </Badge>
                <p className="mt-2 text-sm text-muted-foreground">{signal.reason}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Preferences</CardTitle>
            <CardDescription>
              Edit high-level priorities without changing the underlying game history.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {Object.entries(profile.priorities).map(([key, value]) => (
              <Button
                key={key}
                type="button"
                variant={value === "high" ? "default" : "secondary"}
                onClick={() => togglePriority(key as keyof ProductProfile["priorities"])}
                className="justify-between"
              >
                {key} <Badge variant="secondary">{value}</Badge>
              </Button>
            ))}
            <Separator />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" onClick={refreshAdaptiveProfile}>
                <RefreshCcw className="size-4" /> Refresh
              </Button>
              <Button type="button" variant="secondary" onClick={exportData}>
                <Download className="size-4" /> Export JSON
              </Button>
              <Button type="button" variant="destructive" onClick={resetLocalState}>
                <RotateCcw className="size-4" /> Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function UpcomingSection() {
  const { seedData, state, ui, setUi, openDossier, toggleFlag } = usePlayfit();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() - 1);
  const entries = seedData.allGames
    .filter((game) => game.releaseState === "unreleased")
    .filter((game) => game.sortDate && game.sortDate >= tomorrow.toISOString().slice(0, 10))
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

  return (
    <section>
      <SectionHead
        eyebrow="Upcoming"
        title="Release radar"
        copy="Track future releases with platform and fit context."
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {seedData.platforms.slice(0, 8).map((platform) => {
          const active = ui.upcomingPlatformFilters.has(platform.platformId);
          return (
            <Button
              key={platform.platformId}
              type="button"
              size="sm"
              variant={active ? "default" : "secondary"}
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
        })}
      </div>
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
    </section>
  );
}

function DossierOverlay() {
  const { ui, seedData, state, closeDossier, toggleFlag, setPlayStatus, setRating } = usePlayfit();
  const game = ui.dossierGameId ? seedData.gamesById.get(ui.dossierGameId) : null;
  const entry =
    game && state.user.profile
      ? scoreSeedGame(game, state, state.user.profile, seedData.gamesById)
      : null;
  const gameState = game ? state.user.gameStates[game.gameId] : null;

  return (
    <AnimatePresence>
      {game ? (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/72 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeDossier}
        >
          <motion.article
            className="max-h-[92vh] w-[min(980px,100%)] overflow-auto rounded-lg border border-border bg-background shadow-2xl"
            initial={{ y: 20, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 20, scale: 0.98 }}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/94 p-4 backdrop-blur-xl">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
                  Game dossier
                </p>
                <h2 className="font-display text-2xl font-black">{game.title}</h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={closeDossier}
                aria-label="Close dossier"
              >
                <X className="size-5" />
              </Button>
            </header>
            <div className="grid gap-5 p-4 lg:grid-cols-[260px_1fr]">
              <CoverArt game={game} className="aspect-[2/3]" />
              <div className="grid gap-5">
                {entry ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <Metric label="Fit" value={entry.affinityScore} />
                      <Metric label="Friction" value={entry.riskScore} />
                      <Metric label="Signal" value={confidenceLabel(entry.confidence)} />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      <ReasonPanel title="Why it fits" reasons={entry.fitReasons} tone="positive" />
                      <ReasonPanel
                        title="Watch out for"
                        reasons={
                          entry.cautionReasons.length
                            ? entry.cautionReasons
                            : ["Nothing major stands out yet."]
                        }
                        tone="warning"
                      />
                    </div>
                  </>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>Setup needed</CardTitle>
                      <CardDescription>
                        Finish onboarding before Playfit can rank this game.
                      </CardDescription>
                    </CardHeader>
                  </Card>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>My state</CardTitle>
                    <CardDescription>
                      Status and ratings update your profile over time.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <select
                      className="h-11 rounded-md border border-border bg-input px-3 text-sm"
                      value={gameState?.status ?? ""}
                      onChange={(event) =>
                        setPlayStatus(
                          game.gameId,
                          (event.target.value || undefined) as ProductPlayStatus | undefined,
                        )
                      }
                    >
                      {statusOptions.map((option) => (
                        <option key={option.value || "empty"} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <Button
                          key={value}
                          type="button"
                          variant={(gameState?.rating ?? 0) >= value ? "default" : "secondary"}
                          size="icon"
                          onClick={() => setRating(game.gameId, value as ProductRating)}
                          aria-label={`${value} stars`}
                        >
                          <Star className="size-4" />
                        </Button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant={gameState?.inBacklog ? "default" : "secondary"}
                        onClick={() => toggleFlag(game.gameId, "inBacklog")}
                      >
                        Backlog
                      </Button>
                      <Button
                        type="button"
                        variant={gameState?.inWishlist ? "default" : "secondary"}
                        onClick={() => toggleFlag(game.gameId, "inWishlist")}
                      >
                        Wishlist
                      </Button>
                      <Button
                        type="button"
                        variant={gameState?.storyCompleted ? "default" : "secondary"}
                        onClick={() => toggleFlag(game.gameId, "storyCompleted")}
                      >
                        Story completed
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </motion.article>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function ReasonPanel({
  title,
  reasons,
  tone,
}: {
  title: string;
  reasons: string[];
  tone: "positive" | "warning";
}) {
  return (
    <div className="rounded-md border border-border bg-secondary p-4">
      <Badge variant={tone}>{title}</Badge>
      <ul className="mt-3 grid gap-2 text-sm text-muted-foreground">
        {reasons.map((reason) => (
          <li key={reason}>• {reason}</li>
        ))}
      </ul>
    </div>
  );
}

function StatusToast() {
  const { ui, setUi } = usePlayfit();
  if (!ui.statusMessage) return null;
  return (
    <button
      type="button"
      className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border border-border bg-card px-4 py-2 text-sm font-bold shadow-xl md:bottom-6"
      onClick={() => setUi((current) => ({ ...current, statusMessage: null }))}
    >
      {ui.statusMessage}
    </button>
  );
}

export function ProductApp() {
  return (
    <PlayfitProvider>
      <ProductShell />
    </PlayfitProvider>
  );
}
