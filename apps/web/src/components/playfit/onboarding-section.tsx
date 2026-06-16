"use client";

import { buildAdaptiveProfile, canAdvanceOnboarding } from "@playfit/core/domain";
import type { ProductPlatformOption, SeedGame } from "@playfit/core/types";
import { nowIso } from "@playfit/core/utils";
import { Check, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField, FormLabel } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Stack } from "@/components/ui/stack";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/utils";
import { usePlayfit } from "./playfit-context";
import { formatGameDescriptor } from "./product-utils";
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
}> = [
  {
    id: "current",
    label: "Current systems",
    description: "Modern consoles and computers.",
    matches: (platform) => currentPlatformIds.has(platform.platformId),
  },
  {
    id: "nintendo",
    label: "Nintendo",
    description: "Switch, handhelds, and classic Nintendo.",
    matches: (platform) => platform.family === "nintendo",
  },
  {
    id: "playstation",
    label: "PlayStation",
    description: "Sony home and handheld systems.",
    matches: (platform) => platform.family === "playstation",
  },
  {
    id: "xbox",
    label: "Xbox",
    description: "Xbox generations and current consoles.",
    matches: (platform) => platform.family === "xbox",
  },
  {
    id: "pc",
    label: "PC",
    description: "Desktop and computer platforms.",
    matches: (platform) => platform.family === "pc" || platform.kind === "computer",
  },
  {
    id: "retro",
    label: "Retro",
    description: "Older consoles and handhelds.",
    matches: (platform) =>
      retroPlatformIds.has(platform.platformId) ||
      ["sega", "atari", "snk"].includes(platform.family),
  },
];

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
  const progressValue = step === 1 ? 33 : step === 2 ? 67 : 100;
  const stepTitle =
    draft.step === "platforms"
      ? "Where can Playfit look?"
      : draft.step === "anchors"
        ? "Pick three games you loved"
        : "Pick one game that was not for you";
  const stepCopy =
    draft.step === "platforms"
      ? "Your platforms keep recommendations grounded in what you can actually play."
      : draft.step === "anchors"
        ? "Start with games that clicked. Playfit will look for nearby signals."
        : "A single miss helps Playfit avoid the wrong fit instead of only chasing favorites.";
  const stepCountCopy =
    draft.step === "platforms"
      ? `${draft.platforms.length} platforms`
      : draft.step === "anchors"
        ? `${Math.min(draft.likedGameIds.length, 3)} / 3 loved`
        : `${Math.min(draft.dislikedGameIds.length, 1)} / 1 not for me`;

  return (
    <section>
      <SectionHead eyebrow="Tune your taste" title={stepTitle} copy={stepCopy} />
      <Card>
        <CardHeader>
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Step {step} of 3
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {stepCountCopy}
              </span>
            </div>
            <ProgressBar value={progressValue} label={`Step ${step} of 3`} />
          </div>
        </CardHeader>
        <CardContent>
          <AnimatePresence mode="wait">
            {draft.step === "platforms" ? (
              <motion.form
                key="platforms"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="grid gap-4"
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
                <p className="text-sm text-muted-foreground">
                  Start broad. You can tune individual systems only if the preset does not match
                  what you own.
                </p>
                {platformsUnavailable ? (
                  <Alert variant="error">
                    Platforms could not be loaded. Check the catalog connection and try again.
                  </Alert>
                ) : null}
                <div className="grid gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    Quick groups
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
                            "grid min-h-24 content-between gap-3 rounded-xl border border-border bg-secondary p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 hover:bg-secondary/70",
                            selected &&
                              "border-[color-mix(in_srgb,var(--accent),transparent_35%)] bg-[color-mix(in_srgb,var(--accent),transparent_86%)]",
                          )}
                          onClick={() => togglePlatformPreset(preset)}
                        >
                          <span>
                            <strong className="block text-sm">{preset.label}</strong>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {preset.description}
                            </span>
                          </span>
                          <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
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
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/70 p-3">
                  <p className="text-sm text-muted-foreground">
                    <strong className="text-foreground">{draft.platforms.length}</strong> systems
                    selected for Play Next.
                  </p>
                  <Stack direction="row" wrap gap={2}>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setShowPlatformDetails((current) => !current)}
                    >
                      {showPlatformDetails ? "Hide details" : "Customize systems"}
                    </Button>
                    <Button type="submit" disabled={draft.platforms.length === 0}>
                      Continue <ChevronRight className="size-4" />
                    </Button>
                  </Stack>
                </div>
                {showPlatformDetails ? (
                  <div className="grid gap-4 rounded-xl border border-border bg-card/60 p-4">
                    <Checkbox
                      id="select-all-platforms"
                      checked={allSelected}
                      onChange={toggleAllPlatforms}
                      label={allSelected ? "Deselect all platforms" : "Select all platforms"}
                      disabled={platformsUnavailable}
                    />
                    {platformFamilies.map((family) => {
                      const group = seedData.platforms
                        .filter((p) => p.family === family)
                        .sort((a, b) => a.sortOrder - b.sortOrder);
                      if (group.length === 0) return null;
                      const label = formatPlatformFamily(family);
                      const consoles = group.filter((p) => p.kind !== "handheld");
                      const handhelds = group.filter((p) => p.kind === "handheld");
                      return (
                        <div key={family} className="grid gap-2">
                          {label && (
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
                ) : null}
                {platformError ? <Alert variant="error">{platformError}</Alert> : null}
              </motion.form>
            ) : draft.step === "anchors" ? (
              <motion.div
                key="anchors"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="grid gap-5"
              >
                <FormField>
                  <FormLabel htmlFor="favorite-search">Search by title or series</FormLabel>
                  <Input
                    id="favorite-search"
                    type="search"
                    value={ui.onboardingQuery}
                    onChange={(event) =>
                      setUi((current) => ({ ...current, onboardingQuery: event.target.value }))
                    }
                    placeholder="Search a favorite game"
                  />
                </FormField>
                {draft.likedGameIds.length > 0 && (
                  <Stack direction="row" wrap gap={2}>
                    {draft.likedGameIds.map((gameId) => {
                      const game = getSeedGame(gameId);
                      if (!game) return null;
                      return (
                        <Tag key={gameId} onRemove={() => removeAnchor(gameId)}>
                          {game.title}
                        </Tag>
                      );
                    })}
                  </Stack>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {anchorResults.map((game) => {
                    const selected = draft.likedGameIds.includes(game.gameId);
                    const disabled = selected || draft.likedGameIds.length >= 3;
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
                        disabled={disabled}
                      >
                        <span>
                          <strong>{game.title}</strong>
                          <span className="block text-sm text-muted-foreground">
                            {formatGameDescriptor(game)}
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
                {anchorResults.length === 0 && hasOnboardingSearch ? (
                  onboardingSearchPending ? (
                    <Alert variant="info" aria-live="polite">
                      Searching Playfit catalog...
                    </Alert>
                  ) : onboardingSearchError ? (
                    <Alert variant="error">{onboardingSearchError}</Alert>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No games found. Try a different title.
                    </p>
                  )
                ) : null}
                <Stack direction="row" wrap gap={3}>
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
                  >
                    Continue <ChevronRight className="size-4" />
                  </Button>
                </Stack>
              </motion.div>
            ) : (
              <motion.div
                key="dislikes"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="grid gap-5"
              >
                <FormField>
                  <FormLabel htmlFor="dislike-search">
                    Search for a game that missed for you
                  </FormLabel>
                  <Input
                    id="dislike-search"
                    type="search"
                    value={ui.onboardingQuery}
                    onChange={(event) =>
                      setUi((current) => ({ ...current, onboardingQuery: event.target.value }))
                    }
                    placeholder="Search a game that was not for you"
                  />
                </FormField>
                {draft.dislikedGameIds.length > 0 && (
                  <Stack direction="row" wrap gap={2}>
                    {draft.dislikedGameIds.map((gameId) => {
                      const game = getSeedGame(gameId);
                      if (!game) return null;
                      return (
                        <Tag
                          key={gameId}
                          variant="default"
                          onRemove={() => removeDislikedAnchor(gameId)}
                        >
                          {game.title}
                        </Tag>
                      );
                    })}
                  </Stack>
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
                          "flex items-center justify-between gap-3 rounded-md border border-border bg-secondary p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected && "border-[color-mix(in_srgb,var(--negative),transparent_40%)]",
                        )}
                        onClick={() => addDislikedAnchor(game)}
                        disabled={selected}
                      >
                        <span>
                          <strong>{game.title}</strong>
                          <span className="block text-sm text-muted-foreground">
                            {loved ? "Moves out of loved picks" : formatGameDescriptor(game)}
                          </span>
                        </span>
                        {selected ? (
                          <Check className="size-4 text-negative" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {anchorResults.length === 0 && hasOnboardingSearch ? (
                  onboardingSearchPending ? (
                    <Alert variant="info" aria-live="polite">
                      Searching Playfit catalog...
                    </Alert>
                  ) : onboardingSearchError ? (
                    <Alert variant="error">{onboardingSearchError}</Alert>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No games found. Try a different title.
                    </p>
                  )
                ) : null}
                <Stack direction="row" wrap gap={3}>
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
                  <Button type="button" disabled={!canAdvance} onClick={finalize}>
                    Find Play Next
                  </Button>
                </Stack>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </section>
  );
}
