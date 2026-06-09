"use client";

import { buildAdaptiveProfile, canAdvanceOnboarding, nowIso, type SeedGame } from "@playfit/core";
import { Check, ChevronRight, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePlayfit } from "./playfit-context";
import { formatGameDescriptor } from "./product-utils";
import { SectionHead } from "./section-head";

export function OnboardingSection() {
  const { seedData, state, ui, setUi, updateState, searchGames } = usePlayfit();
  const draft = state.user.onboarding;
  const [platformError, setPlatformError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(ui.onboardingQuery);
  const anchorResults = useMemo(
    () => searchGames(deferredQuery).slice(0, 8),
    [deferredQuery, searchGames],
  );
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
    setPlatformError(null);
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

  function finalize() {
    updateState((next) => {
      next.user.profile = buildAdaptiveProfile(
        next.user.onboarding,
        seedData.gamesById,
        next.user.gameStates,
      );
      next.user.onboardingCompletedAt = nowIso();
    });
    setUi((current) => ({
      ...current,
      activeTab: "today",
      statusMessage: "Profile ready. Your first reads are below.",
    }));
  }

  return (
    <section>
      <SectionHead
        eyebrow="Setup"
        title={
          draft.step === "platforms" ? "Where can Playfit look?" : "Start with three favorites"
        }
        copy={
          draft.step === "platforms"
            ? "Your platforms are your playground. Playfit keeps recommendations grounded in what you can actually play."
            : "Start with games you already love. Every rating after this will sharpen the signal."
        }
      />
      <Card>
        <CardHeader>
          <div className="grid gap-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                Step {draft.step === "platforms" ? 1 : 2} of 2
              </span>
              <span className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                {draft.step === "platforms"
                  ? `${draft.platforms.length} platforms`
                  : `${draft.likedGameIds.length} / 3 anchors`}
              </span>
            </div>
            <div
              className="relative h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={draft.step === "platforms" ? 50 : 100}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Step ${draft.step === "platforms" ? 1 : 2} of 2`}
            >
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-accent"
                initial={{ width: "0%" }}
                animate={{
                  width: draft.step === "platforms" ? "50%" : "100%",
                }}
                transition={{ type: "spring", stiffness: 200, damping: 25 }}
              />
            </div>
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
                  Tell Playfit what you can play on. Every read will stay grounded in systems you
                  actually own.
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
                {platformError ? <p className="text-sm text-negative">{platformError}</p> : null}
                <Button type="submit" className="w-fit" disabled={draft.platforms.length === 0}>
                  Continue <ChevronRight className="size-4" />
                </Button>
              </motion.form>
            ) : (
              <motion.div
                key="anchors"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="grid gap-5"
              >
                <div className="grid gap-2">
                  <label
                    className="text-sm font-bold text-muted-foreground"
                    htmlFor="favorite-search"
                  >
                    Search by title or series
                  </label>
                  <Input
                    id="favorite-search"
                    type="search"
                    value={ui.onboardingQuery}
                    onChange={(event) =>
                      setUi((current) => ({ ...current, onboardingQuery: event.target.value }))
                    }
                    placeholder="Search a favorite game"
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
                {anchorResults.length === 0 && deferredQuery.trim().length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    No games found. Try a different title.
                  </p>
                )}
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
                    Build my first reads
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
