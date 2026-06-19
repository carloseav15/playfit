"use client";

import { buildAdaptiveProfile, canAdvanceOnboarding } from "@playfit/core/domain";
import type { ProductPlatformOption, SeedGame } from "@playfit/core/types";
import { nowIso } from "@playfit/core/utils";
import { Check, ChevronRight, Gamepad2, Laptop, Tv, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import { FormField, FormLabel } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";
import { CoverArt } from "./cover-art";
import { usePlayfit } from "./playfit-context";
import { formatDisplayGenre, isValidReleaseYear } from "./product-utils";
import { SectionHead } from "./section-head";

const preferredPlatformFamilies = ["nintendo", "playstation", "xbox", "sega", "pc", "other"];
const platformFamilyLabels: Record<string, string> = {
  nintendo: "Nintendo",
  playstation: "PlayStation",
  xbox: "Xbox",
  sega: "SEGA",
  pc: "PC",
  other: "Other",
};

const currentPlatformIds = new Set([
  "switch_1",
  "switch_2",
  "ps5",
  "xbox_series_xs",
  "pc",
  "macos",
  "linux",
  "cups",
]);

const retroPlatformIds = new Set([
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

const platformPresets: Array<{
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
    matches: (platform) => currentPlatformIds.has(platform.platformId),
    Icon: Gamepad2,
  },
  {
    id: "nintendo",
    label: "Nintendo",
    description: "Switch, handhelds, and classic Nintendo.",
    matches: (platform) => platform.family === "nintendo",
    Icon: Gamepad2,
  },
  {
    id: "playstation",
    label: "PlayStation",
    description: "Sony home and handheld systems.",
    matches: (platform) => platform.family === "playstation",
    Icon: Gamepad2,
  },
  {
    id: "xbox",
    label: "Xbox",
    description: "Xbox generations and current consoles.",
    matches: (platform) => platform.family === "xbox",
    Icon: Gamepad2,
  },
  {
    id: "pc",
    label: "PC",
    description: "Desktop and computer platforms.",
    matches: (platform) => platform.family === "pc" || platform.kind === "computer",
    Icon: Laptop,
  },
  {
    id: "retro",
    label: "Retro",
    description: "Older consoles and handhelds.",
    matches: (platform) =>
      retroPlatformIds.has(platform.platformId) ||
      ["sega", "atari", "snk"].includes(platform.family),
    Icon: Tv,
  },
];

const quickSuggestions = ["Elden Ring", "Hades", "Hollow Knight", "Portal 2", "The Witcher 3"];

function formatPlatformFamily(family: string) {
  return (
    platformFamilyLabels[family] ??
    family
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

function selectedPlatformIdSet(platforms: Array<{ platformId: string }>) {
  return new Set(platforms.map((entry) => entry.platformId));
}

export function OnboardingSection() {
  const {
    seedData,
    state,
    ui,
    setUi,
    updateState,
    searchGames,
    getSeedGame,
    onboardingSearchError,
    onboardingSearchPending,
  } = usePlayfit();
  const draft = state.user.onboarding;
  const [platformError, setPlatformError] = useState<string | null>(null);
  const [showPlatformDetails, setShowPlatformDetails] = useState(false);
  const platformFamilies = useMemo(() => {
    const availableFamilies = [
      ...new Set(seedData.platforms.map((platform) => platform.family || "other")),
    ];
    const preferred = preferredPlatformFamilies.filter((family) =>
      availableFamilies.includes(family),
    );
    const remaining = availableFamilies
      .filter((family) => !preferredPlatformFamilies.includes(family))
      .sort((a, b) => formatPlatformFamily(a).localeCompare(formatPlatformFamily(b)));
    return [...preferred, ...remaining];
  }, [seedData.platforms]);
  const deferredQuery = useDeferredValue(ui.onboardingQuery);
  const anchorResults = useMemo(() => {
    const games = searchGames(deferredQuery);
    const seen = new Set<string>();
    return games
      .filter((game) => {
        if (seen.has(game.gameId)) return false;
        seen.add(game.gameId);
        return true;
      })
      .slice(0, 8);
  }, [deferredQuery, searchGames]);
  const canAdvance = canAdvanceOnboarding(draft);
  const platformsUnavailable = seedData.platforms.length === 0;
  const allSelected =
    seedData.platforms.length > 0 && draft.platforms.length === seedData.platforms.length;
  const selectedIds = selectedPlatformIdSet(draft.platforms);
  const hasOnboardingSearch = deferredQuery.trim().length > 0;

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
    setPlatformError(null);
  }

  function togglePlatformPreset(preset: (typeof platformPresets)[number]) {
    const presetIds = seedData.platforms
      .filter(preset.matches)
      .map((platform) => platform.platformId);
    if (presetIds.length === 0) return;

    updateState((next) => {
      const nextSelectedIds = selectedPlatformIdSet(next.user.onboarding.platforms);
      const presetSelected = presetIds.every((id) => nextSelectedIds.has(id));

      if (presetSelected) {
        next.user.onboarding.platforms = next.user.onboarding.platforms.filter(
          (entry) => !presetIds.includes(entry.platformId),
        );
        return;
      }

      next.user.onboarding.platforms = [
        ...next.user.onboarding.platforms.filter((entry) => !presetIds.includes(entry.platformId)),
        ...presetIds.map((platformId) => ({ platformId, status: "available" as const })),
      ];
    });
    setPlatformError(null);
  }

  function addAnchor(game: SeedGame) {
    updateState((next) => {
      if (
        next.user.onboarding.likedGameIds.length >= 3 &&
        !next.user.onboarding.likedGameIds.includes(game.gameId)
      ) {
        return;
      }
      next.user.onboarding.likedGameIds = [
        ...new Set([...next.user.onboarding.likedGameIds, game.gameId]),
      ].slice(0, 3);
      next.user.onboarding.dislikedGameIds = next.user.onboarding.dislikedGameIds.filter(
        (id) => id !== game.gameId,
      );
      next.user.gameStates[game.gameId] ??= {
        gameId: game.gameId,
        title: game.title,
        inBacklog: false,
        inWishlist: false,
        inPlayfitPicks: false,
        source: "onboarding",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
    });
  }

  function addDislikedAnchor(game: SeedGame) {
    updateState((next) => {
      next.user.onboarding.dislikedGameIds = [game.gameId];
      next.user.onboarding.likedGameIds = next.user.onboarding.likedGameIds.filter(
        (id) => id !== game.gameId,
      );
      next.user.gameStates[game.gameId] ??= {
        gameId: game.gameId,
        title: game.title,
        inBacklog: false,
        inWishlist: false,
        inPlayfitPicks: false,
        source: "onboarding",
        createdAt: nowIso(),
        updatedAt: nowIso(),
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

  function removeDislikedAnchor(gameId: string) {
    updateState((next) => {
      next.user.onboarding.dislikedGameIds = next.user.onboarding.dislikedGameIds.filter(
        (id) => id !== gameId,
      );
    });
  }

  function finalize() {
    updateState((next) => {
      const ids = new Set([
        ...next.user.onboarding.likedGameIds,
        ...(next.user.onboarding.dislikedGameIds ?? []),
        ...Object.keys(next.user.gameStates),
      ]);
      const map = new Map<string, SeedGame>();
      for (const id of ids) {
        const game = getSeedGame(id);
        if (game) map.set(id, game);
      }
      next.user.profile = buildAdaptiveProfile(next.user.onboarding, map, next.user.gameStates);
      next.user.onboardingCompletedAt = nowIso();
    });
    setUi((current) => ({
      ...current,
      activeTab: "today",
      statusMessage: "Profile ready. Your Play Next pick is ready.",
    }));
  }

  const step = draft.step === "platforms" ? 1 : draft.step === "anchors" ? 2 : 3;
  const _progressValue = step === 1 ? 33 : step === 2 ? 67 : 100;
  const stepTitle =
    draft.step === "platforms"
      ? "Where do you play?"
      : draft.step === "anchors"
        ? "Pick three games you loved"
        : "Pick one game that wasn't for you";
  const stepCopy =
    draft.step === "platforms"
      ? "We will only recommend games available on your active platforms."
      : draft.step === "anchors"
        ? "Start with games that clicked. We will look for similar games."
        : "Tell us a popular game you didn't enjoy so we know what to avoid.";
  const _stepCountCopy =
    draft.step === "platforms"
      ? `${draft.platforms.length} platforms`
      : draft.step === "anchors"
        ? `${Math.min(draft.likedGameIds.length, 3)} / 3 loved`
        : `${Math.min(draft.dislikedGameIds.length, 1)} / 1 not for me`;

  return (
    <section className="relative overflow-hidden flex flex-col h-full w-full border-0 rounded-none bg-transparent shadow-none md:border md:rounded-3xl md:border-white/10 md:bg-gradient-to-br md:from-card/70 md:to-background/50 md:p-1 md:backdrop-blur-md md:shadow-2xl">
      <div className="p-4 md:p-6 pb-2 shrink-0">
        <SectionHead eyebrow="Set up your taste" title={stepTitle} copy={stepCopy} />
      </div>
      <Card className="border-0 bg-transparent shadow-none flex flex-col flex-1 min-h-0">
        <CardHeader className="pt-0 px-4 md:px-6 shrink-0">
          <div className="grid gap-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 1, label: "Platforms", count: `${draft.platforms.length} selected` },
                {
                  id: 2,
                  label: "Loved Games",
                  count: `${Math.min(draft.likedGameIds.length, 3)}/3`,
                },
                {
                  id: 3,
                  label: "Missed Game",
                  count: `${Math.min(draft.dislikedGameIds.length, 1)}/1`,
                },
              ].map((s) => {
                const isCompleted = step > s.id;
                const isActive = step === s.id;
                return (
                  <div key={s.id} className="grid gap-1.5">
                    <div className="h-1 rounded-full overflow-hidden bg-white/5 relative">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          isCompleted
                            ? "bg-positive"
                            : isActive
                              ? "bg-gradient-to-r from-accent to-pink-500 animate-pulse"
                              : "bg-transparent",
                        )}
                        style={{ width: isCompleted || isActive ? "100%" : "0%" }}
                      />
                    </div>
                    <div className="flex flex-col text-center sm:text-left sm:flex-row sm:justify-between gap-0.5 px-0.5">
                      <span
                        className={cn(
                          "text-[11px] sm:text-xs font-black uppercase tracking-wider transition-colors",
                          isActive
                            ? "text-accent"
                            : isCompleted
                              ? "text-positive"
                              : "text-muted-foreground/40",
                        )}
                      >
                        {s.label}
                      </span>
                      <span className="text-[10px] sm:text-xs font-mono text-muted-foreground/60">
                        {s.count}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 md:px-6 md:pb-6 pt-0 flex-1 flex flex-col min-h-0 overflow-y-auto">
          <AnimatePresence mode="wait">
            {draft.step === "platforms" ? (
              <motion.form
                key="platforms"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="flex flex-col gap-6 flex-1 min-h-0"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (draft.platforms.length === 0) {
                    setPlatformError("Select at least one platform to start.");
                    return;
                  }
                  setPlatformError(null);
                  updateState((next) => {
                    next.user.onboarding.step = "anchors";
                  });
                }}
              >
                <p className="text-sm text-muted-foreground/80">
                  Start broad by selecting quick groups. You can customize individual systems in the
                  panel below if needed.
                </p>
                {platformsUnavailable ? (
                  <Alert variant="error">
                    Platforms could not be loaded. Check the catalog connection and try again.
                  </Alert>
                ) : null}
                <div className="grid gap-3">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Quick Groups
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {platformPresets.map((preset) => {
                      const presetPlatforms = seedData.platforms.filter(preset.matches);
                      const presetIds = presetPlatforms.map((platform) => platform.platformId);
                      const selectedCount = presetIds.filter((id) => selectedIds.has(id)).length;
                      const selected = presetIds.length > 0 && selectedCount === presetIds.length;
                      const partiallySelected = selectedCount > 0 && !selected;

                      return (
                        <button
                          key={preset.id}
                          type="button"
                          aria-pressed={selected}
                          disabled={platformsUnavailable || presetIds.length === 0}
                          className={cn(
                            "group grid min-h-28 content-between gap-3 rounded-2xl border border-white/5 bg-secondary/25 p-4 text-left transition-all duration-300 hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                            selected &&
                              "border-accent/40 bg-accent/10 shadow-[0_0_20px_rgba(255,106,61,0.1)]",
                          )}
                          onClick={() => togglePlatformPreset(preset)}
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
                            {preset.Icon && (
                              <div
                                className={cn(
                                  "size-8 shrink-0 rounded-xl grid place-items-center border border-white/5 bg-white/[0.02] text-muted-foreground group-hover:text-foreground transition-all duration-300",
                                  selected &&
                                    "border-accent/30 bg-accent/10 text-accent group-hover:text-accent",
                                )}
                              >
                                <preset.Icon className="size-4" />
                              </div>
                            )}
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
                <div className="mt-auto sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-white/5 bg-card/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md md:relative md:m-0 md:rounded-2xl md:border md:border-white/5 md:bg-secondary/20 flex flex-wrap items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">{draft.platforms.length}</strong> systems
                    selected for Play Next.
                  </p>
                  <Stack direction="row" wrap gap={2} className="w-full sm:w-auto justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowPlatformDetails(true)}
                      className="text-xs hover:text-foreground"
                    >
                      Customize Platforms
                    </Button>
                    <Button
                      type="submit"
                      disabled={draft.platforms.length === 0}
                      className="bg-accent text-accent-foreground font-extrabold hover:bg-accent/90"
                    >
                      Continue <ChevronRight className="size-4" />
                    </Button>
                  </Stack>
                </div>

                <Dialog
                  open={showPlatformDetails}
                  onClose={() => setShowPlatformDetails(false)}
                  title="Customize Platforms"
                  eyebrow="Platforms"
                  className="max-w-md overflow-hidden"
                >
                  <div className="max-h-[50vh] overflow-y-auto pr-1 grid gap-4">
                    <Checkbox
                      id="select-all-platforms"
                      checked={allSelected}
                      onChange={toggleAllPlatforms}
                      label={allSelected ? "Deselect all platforms" : "Select all platforms"}
                      disabled={platformsUnavailable}
                      className="font-bold sticky top-0 bg-background py-2 z-10"
                    />
                    <div className="grid gap-4 divide-y divide-white/5 pt-2">
                      {platformFamilies.map((family) => {
                        const group = seedData.platforms
                          .filter((p) => p.family === family)
                          .sort((a, b) => a.sortOrder - b.sortOrder);
                        if (group.length === 0) return null;
                        const label = formatPlatformFamily(family);
                        const consoles = group.filter((p) => p.kind !== "handheld");
                        const handhelds = group.filter((p) => p.kind === "handheld");
                        return (
                          <div key={family} className="grid gap-3 pt-3 first:pt-0 first:divide-y-0">
                            {label && (
                              <p className="text-xs font-bold uppercase tracking-wide text-accent">
                                {label}
                              </p>
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
                                    const checked = draft.platforms.some(
                                      (entry) => entry.platformId === platform.platformId,
                                    );
                                    return (
                                      <Checkbox
                                        key={platform.platformId}
                                        id={`platform-${platform.platformId}`}
                                        checked={checked}
                                        onChange={(event) =>
                                          togglePlatform(
                                            platform.platformId,
                                            event.currentTarget.checked,
                                          )
                                        }
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
                                    const checked = draft.platforms.some(
                                      (entry) => entry.platformId === platform.platformId,
                                    );
                                    return (
                                      <Checkbox
                                        key={platform.platformId}
                                        id={`platform-${platform.platformId}`}
                                        checked={checked}
                                        onChange={(event) =>
                                          togglePlatform(
                                            platform.platformId,
                                            event.currentTarget.checked,
                                          )
                                        }
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
                  </div>
                  <div className="mt-6 flex justify-end border-t border-white/5 pt-4">
                    <Button
                      type="button"
                      onClick={() => setShowPlatformDetails(false)}
                      className="bg-accent text-accent-foreground font-extrabold hover:bg-accent/90"
                    >
                      Apply Customization
                    </Button>
                  </div>
                </Dialog>
                {platformError ? <Alert variant="error">{platformError}</Alert> : null}
              </motion.form>
            ) : draft.step === "anchors" ? (
              <motion.div
                key="anchors"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="flex flex-col gap-6 flex-1 min-h-0"
              >
                <FormField>
                  <FormLabel
                    htmlFor="favorite-search"
                    className="font-extrabold text-sm text-foreground"
                  >
                    Search by title or series
                  </FormLabel>
                  <div className="relative">
                    <Input
                      id="favorite-search"
                      type="search"
                      value={ui.onboardingQuery}
                      onChange={(event) =>
                        setUi((current) => ({ ...current, onboardingQuery: event.target.value }))
                      }
                      placeholder="e.g. Zelda, Halo, Elden Ring..."
                      className="pr-10 border-white/10 bg-secondary/30 focus:border-accent"
                    />
                    {onboardingSearchPending && (
                      <div className="absolute right-3 top-3">
                        <Spinner size="sm" />
                      </div>
                    )}
                  </div>
                </FormField>
                {!ui.onboardingQuery.trim() && (
                  <div className="flex flex-wrap gap-2 items-center -mt-2">
                    <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mr-1">
                      Quick Hits:
                    </span>
                    {quickSuggestions.map((gameName) => (
                      <button
                        key={gameName}
                        type="button"
                        onClick={() =>
                          setUi((current) => ({ ...current, onboardingQuery: gameName }))
                        }
                        className="text-[11px] font-extrabold px-3 py-1 rounded-xl border border-white/5 bg-secondary/25 text-muted-foreground hover:text-foreground hover:bg-secondary/50 hover:border-accent/20 transition-all duration-200"
                      >
                        {gameName}
                      </button>
                    ))}
                  </div>
                )}
                {draft.likedGameIds.length > 0 && (
                  <div className="grid gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-accent">
                      Selected Loved Games
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {draft.likedGameIds.map((gameId) => {
                        const game = getSeedGame(gameId);
                        if (!game) return null;
                        return (
                          <div
                            key={gameId}
                            className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-secondary/20 p-2 min-w-0"
                          >
                            <CoverArt
                              game={game}
                              className="aspect-[2/3] w-8 shrink-0 rounded-sm shadow-sm"
                            />
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate text-xs font-extrabold text-foreground leading-tight">
                                {game.title}
                              </h4>
                              <p className="truncate text-[10px] text-muted-foreground mt-0.5">
                                {[
                                  isValidReleaseYear(game.releaseYear) ? game.releaseYear : "",
                                  game.availablePlatformNames &&
                                  game.availablePlatformNames.length > 0
                                    ? game.availablePlatformNames[0]
                                    : "",
                                ]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeAnchor(gameId)}
                              className="size-6 shrink-0 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              aria-label={`Remove ${game.title}`}
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {anchorResults.map((game) => {
                    const selected = draft.likedGameIds.includes(game.gameId);
                    const disabled = !selected && draft.likedGameIds.length >= 3;
                    return (
                      <button
                        key={game.gameId}
                        type="button"
                        aria-pressed={selected}
                        className={cn(
                          "group flex w-full min-w-0 items-center gap-3.5 rounded-2xl border border-white/5 bg-secondary/25 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-200 hover:bg-secondary/50",
                          selected && "border-accent/40 bg-accent/10",
                          disabled && !selected && "opacity-50 cursor-not-allowed",
                        )}
                        onClick={() => {
                          if (selected) {
                            removeAnchor(game.gameId);
                          } else {
                            addAnchor(game);
                          }
                        }}
                        disabled={disabled}
                      >
                        <CoverArt
                          game={game}
                          className="aspect-[2/3] w-12 shrink-0 rounded-sm shadow-md transition-transform group-hover:scale-[1.03]"
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="block text-base font-black truncate text-foreground group-hover:text-accent transition-colors">
                            {game.title}
                          </strong>
                          <span className="block text-xs text-muted-foreground truncate mt-0.5">
                            {[
                              formatDisplayGenre(game.primaryGenre),
                              isValidReleaseYear(game.releaseYear) ? game.releaseYear : "",
                              game.availablePlatformNames && game.availablePlatformNames.length > 0
                                ? game.availablePlatformNames.slice(0, 3).join(", ") +
                                  (game.availablePlatformNames.length > 3 ? "..." : "")
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" • ")}
                          </span>
                        </span>
                        {selected ? (
                          <div className="size-6 shrink-0 grid place-items-center rounded-full bg-positive-bg text-positive border border-positive/30">
                            <Check className="size-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {anchorResults.length === 0 && hasOnboardingSearch ? (
                  onboardingSearchPending ? null : onboardingSearchError ? (
                    <Alert variant="error">{onboardingSearchError}</Alert>
                  ) : seedData.allGames.length === 0 ? (
                    <Alert variant="warning">
                      The game catalog is currently empty. Make sure you run the seeding script (
                      <code>bash scripts/seed-catalog.sh</code>) to import games.
                    </Alert>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2 text-center border border-dashed border-white/5 rounded-2xl bg-secondary/10">
                      No games found matching your search.
                    </p>
                  )
                ) : null}
                <div className="mt-auto sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-white/5 bg-card/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md md:relative md:m-0 md:border-t-0 md:bg-transparent md:p-0 md:pt-2 flex items-center justify-between">
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
                  <Button
                    type="button"
                    disabled={draft.likedGameIds.length < 3}
                    onClick={() => {
                      updateState((next) => {
                        next.user.onboarding.step = "dislikes";
                      });
                      setUi((current) => ({ ...current, onboardingQuery: "" }));
                    }}
                    className="ml-auto bg-accent text-accent-foreground font-extrabold hover:bg-accent/90"
                  >
                    Continue <ChevronRight className="size-4" />
                  </Button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="dislikes"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="flex flex-col gap-6 flex-1 min-h-0"
              >
                <FormField>
                  <FormLabel
                    htmlFor="dislike-search"
                    className="font-extrabold text-sm text-foreground"
                  >
                    Search for a game that missed for you
                  </FormLabel>
                  <div className="relative">
                    <Input
                      id="dislike-search"
                      type="search"
                      value={ui.onboardingQuery}
                      onChange={(event) =>
                        setUi((current) => ({ ...current, onboardingQuery: event.target.value }))
                      }
                      placeholder="e.g. Cyberpunk, FIFA, Dark Souls..."
                      className="pr-10 border-white/10 bg-secondary/30 focus:border-accent"
                    />
                    {onboardingSearchPending && (
                      <div className="absolute right-3 top-3">
                        <Spinner size="sm" />
                      </div>
                    )}
                  </div>
                </FormField>
                {!ui.onboardingQuery.trim() && (
                  <div className="flex flex-wrap gap-2 items-center -mt-2">
                    <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mr-1">
                      Quick Hits:
                    </span>
                    {quickSuggestions.map((gameName) => (
                      <button
                        key={gameName}
                        type="button"
                        onClick={() =>
                          setUi((current) => ({ ...current, onboardingQuery: gameName }))
                        }
                        className="text-[11px] font-extrabold px-3 py-1 rounded-xl border border-white/5 bg-secondary/25 text-muted-foreground hover:text-foreground hover:bg-secondary/50 hover:border-negative/20 transition-all duration-200"
                      >
                        {gameName}
                      </button>
                    ))}
                  </div>
                )}
                {draft.dislikedGameIds.length > 0 && (
                  <div className="grid gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-negative">
                      Selected Missed Game
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {draft.dislikedGameIds.map((gameId) => {
                        const game = getSeedGame(gameId);
                        if (!game) return null;
                        return (
                          <div
                            key={gameId}
                            className="flex items-center gap-2.5 rounded-xl border border-white/5 bg-secondary/20 p-2 min-w-0"
                          >
                            <CoverArt
                              game={game}
                              className="aspect-[2/3] w-8 shrink-0 rounded-sm shadow-sm"
                            />
                            <div className="min-w-0 flex-1">
                              <h4 className="truncate text-xs font-extrabold text-foreground leading-tight">
                                {game.title}
                              </h4>
                              <p className="truncate text-[10px] text-muted-foreground mt-0.5">
                                {[
                                  isValidReleaseYear(game.releaseYear) ? game.releaseYear : "",
                                  game.availablePlatformNames &&
                                  game.availablePlatformNames.length > 0
                                    ? game.availablePlatformNames[0]
                                    : "",
                                ]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => removeDislikedAnchor(gameId)}
                              className="size-6 shrink-0 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              aria-label={`Remove ${game.title}`}
                            >
                              <X className="size-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {anchorResults.map((game) => {
                    const selected = draft.dislikedGameIds.includes(game.gameId);
                    const loved = draft.likedGameIds.includes(game.gameId);
                    return (
                      <button
                        key={game.gameId}
                        type="button"
                        aria-pressed={selected}
                        className={cn(
                          "group flex w-full min-w-0 items-center gap-3.5 rounded-2xl border border-white/5 bg-secondary/25 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-200 hover:bg-secondary/50",
                          selected && "border-negative/40 bg-negative/10",
                          loved && "opacity-40 cursor-not-allowed bg-muted",
                        )}
                        onClick={() => {
                          if (selected) {
                            removeDislikedAnchor(game.gameId);
                          } else {
                            addDislikedAnchor(game);
                          }
                        }}
                        disabled={loved}
                      >
                        <CoverArt
                          game={game}
                          className="aspect-[2/3] w-12 shrink-0 rounded-sm shadow-md transition-transform group-hover:scale-[1.03]"
                        />
                        <span className="min-w-0 flex-1">
                          <strong className="block text-base font-black truncate text-foreground group-hover:text-negative transition-colors">
                            {game.title}
                          </strong>
                          {loved ? (
                            <span className="block text-xs text-muted-foreground truncate mt-0.5">
                              Selected as loved
                            </span>
                          ) : (
                            <span className="block text-xs text-muted-foreground truncate mt-0.5">
                              {[
                                formatDisplayGenre(game.primaryGenre),
                                isValidReleaseYear(game.releaseYear) ? game.releaseYear : "",
                                game.availablePlatformNames &&
                                game.availablePlatformNames.length > 0
                                  ? game.availablePlatformNames.slice(0, 3).join(", ") +
                                    (game.availablePlatformNames.length > 3 ? "..." : "")
                                  : "",
                              ]
                                .filter(Boolean)
                                .join(" • ")}
                            </span>
                          )}
                        </span>
                        {selected ? (
                          <div className="size-6 shrink-0 grid place-items-center rounded-full bg-negative-bg text-negative border border-negative/30">
                            <Check className="size-3.5 stroke-[3]" />
                          </div>
                        ) : (
                          <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {anchorResults.length === 0 && hasOnboardingSearch ? (
                  onboardingSearchPending ? null : onboardingSearchError ? (
                    <Alert variant="error">{onboardingSearchError}</Alert>
                  ) : seedData.allGames.length === 0 ? (
                    <Alert variant="warning">
                      The game catalog is currently empty. Make sure you run the seeding script (
                      <code>bash scripts/seed-catalog.sh</code>) to import games.
                    </Alert>
                  ) : (
                    <p className="text-sm text-muted-foreground py-2 text-center border border-dashed border-white/5 rounded-2xl bg-secondary/10">
                      No games found matching your search.
                    </p>
                  )
                ) : null}
                <div className="mt-auto sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-white/5 bg-card/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md md:relative md:m-0 md:border-t-0 md:bg-transparent md:p-0 md:pt-2 flex items-center justify-between">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      updateState((next) => {
                        next.user.onboarding.step = "anchors";
                      });
                      setUi((current) => ({ ...current, onboardingQuery: "" }));
                    }}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    disabled={!canAdvance}
                    onClick={finalize}
                    className="ml-auto bg-gradient-to-r from-accent to-indigo-600 font-extrabold text-white shadow-[0_0_15px_rgba(255,106,61,0.25)] hover:shadow-[0_0_20px_rgba(255,106,61,0.35)]"
                  >
                    Find Play Next
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </section>
  );
}
