"use client";

import { buildAdaptiveProfile } from "@playfit/core/domain";
import type { SeedGame } from "@playfit/core/types";
import { nowIso } from "@playfit/core/utils";
import { X } from "lucide-react";
import { AnimatePresence } from "motion/react";
import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LovedGamesStep, MissedGameStep } from "./onboarding/game-selection-step";
import {
  formatPlatformFamily,
  type PlatformPreset,
  preferredPlatformFamilies,
  type SearchSlot,
  selectedPlatformIdSet,
  withPlatformSelectionGuard,
} from "./onboarding/onboarding-helpers";
import { OnboardingProgress } from "./onboarding/onboarding-progress";
import { OnboardingSearchDialog } from "./onboarding/onboarding-search-dialog";
import { PlatformsStep } from "./onboarding/platforms-step";
import { usePlayfit } from "./playfit-context";
import { SectionHead } from "./section-head";

export function OnboardingSection({ onExit }: { onExit?: () => void }) {
  const {
    seedData,
    state,
    ui,
    setUi,
    updateState,
    flushSave,
    searchGames,
    getSeedGame,
    onboardingSearchError,
    onboardingSearchPending,
  } = usePlayfit();
  const draft = state.user.onboarding;
  const [showPlatformDetails, setShowPlatformDetails] = useState(false);
  const [searchSlot, setSearchSlot] = useState<SearchSlot | null>(null);
  const [replaceGameId, setReplaceGameId] = useState<string | null>(null);
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
  const deferredQuery = useDeferredValue(ui.onboardingQuery.trim());
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
  const platformsUnavailable = seedData.platforms.length === 0;
  const allSelected =
    seedData.platforms.length > 0 && draft.platforms.length === seedData.platforms.length;
  const selectedIds = selectedPlatformIdSet(draft.platforms);
  const hasOnboardingSearch = deferredQuery.trim().length > 0;

  // Onboarding platforms start pre-selected with every known platform (see
  // withDefaultPlatforms in playfit-context.tsx), so users never need to build a selection
  // from zero. These toggles keep a "never leave 0 platforms selected" safety net on top of
  // that default — dropping to 0 would make the recommendation engine treat every known
  // game as not_on_platforms and exclude it from Play Next.
  function togglePlatform(platformId: string, checked: boolean) {
    updateState((next) => {
      const filtered = next.user.onboarding.platforms.filter(
        (entry) => entry.platformId !== platformId,
      );
      const nextPlatforms = checked
        ? [...filtered, { platformId, status: "available" as const }]
        : filtered;
      next.user.onboarding.platforms = withPlatformSelectionGuard(
        next.user.onboarding.platforms,
        nextPlatforms,
      );
    });
  }

  function toggleAllPlatforms() {
    // Deselecting all would leave 0 platforms selected — a no-op by design (see the
    // "never leave 0 platforms selected" note above).
    if (allSelected) return;
    updateState((next) => {
      next.user.onboarding.platforms = seedData.platforms.map((p) => ({
        platformId: p.platformId,
        status: "available" as const,
      }));
    });
  }

  function togglePlatformPreset(preset: PlatformPreset) {
    const presetIds = seedData.platforms
      .filter(preset.matches)
      .map((platform) => platform.platformId);
    if (presetIds.length === 0) return;

    updateState((next) => {
      const nextSelectedIds = selectedPlatformIdSet(next.user.onboarding.platforms);
      const presetSelected = presetIds.every((id) => nextSelectedIds.has(id));

      if (presetSelected) {
        const remaining = next.user.onboarding.platforms.filter(
          (entry) => !presetIds.includes(entry.platformId),
        );
        next.user.onboarding.platforms = withPlatformSelectionGuard(
          next.user.onboarding.platforms,
          remaining,
        );
        return;
      }

      next.user.onboarding.platforms = [
        ...next.user.onboarding.platforms.filter((entry) => !presetIds.includes(entry.platformId)),
        ...presetIds.map((platformId) => ({ platformId, status: "available" as const })),
      ];
    });
  }

  function ensureOnboardingGameState(game: SeedGame) {
    return {
      gameId: game.gameId,
      title: game.title,
      inBacklog: false,
      inWishlist: false,
      inPlayfitPicks: false,
      source: "onboarding" as const,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
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
      next.user.gameStates[game.gameId] ??= ensureOnboardingGameState(game);
    });
  }

  function replaceAnchor(oldGameId: string, newGame: SeedGame) {
    updateState((next) => {
      next.user.onboarding.likedGameIds = next.user.onboarding.likedGameIds.map((id) =>
        id === oldGameId ? newGame.gameId : id,
      );
      next.user.onboarding.dislikedGameIds = next.user.onboarding.dislikedGameIds.filter(
        (id) => id !== newGame.gameId,
      );
      next.user.gameStates[newGame.gameId] ??= ensureOnboardingGameState(newGame);
    });
  }

  function addDislikedAnchor(game: SeedGame) {
    updateState((next) => {
      next.user.onboarding.dislikedGameIds = [game.gameId];
      next.user.onboarding.likedGameIds = next.user.onboarding.likedGameIds.filter(
        (id) => id !== game.gameId,
      );
      next.user.gameStates[game.gameId] ??= ensureOnboardingGameState(game);
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

  function openSearch(slot: SearchSlot, nextReplaceGameId: string | null) {
    setSearchSlot(slot);
    setReplaceGameId(nextReplaceGameId);
  }

  function closeSearch() {
    setSearchSlot(null);
    setReplaceGameId(null);
    setUi((current) => ({ ...current, onboardingQuery: "" }));
  }

  function continueFromPlatforms() {
    updateState((next) => {
      next.user.onboarding.step = "anchors";
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
    flushSave();
    setUi((current) => ({
      ...current,
      activeTab: "today",
      statusMessage: "Profile ready. Your Play Next pick is ready.",
    }));
  }

  const step = draft.step === "platforms" ? 1 : draft.step === "anchors" ? 2 : 3;
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

  return (
    <section className="relative overflow-hidden flex flex-col h-full w-full border-0 rounded-none bg-transparent shadow-none md:border md:rounded-3xl md:border-white/10 md:bg-gradient-to-br md:from-card/70 md:to-background/50 md:p-1 md:backdrop-blur-md md:shadow-2xl">
      <div className="relative p-4 md:p-6 pb-2 shrink-0">
        {onExit ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onExit}
            aria-label="Exit setup"
            className="absolute right-3 top-3 md:right-4 md:top-4"
          >
            <X className="size-5" />
          </Button>
        ) : null}
        <SectionHead eyebrow="Set up your taste" title={stepTitle} copy={stepCopy} />
      </div>
      <Card className="border-0 bg-transparent shadow-none flex flex-col flex-1 min-h-0">
        <CardHeader className="pt-0 px-4 md:px-6 shrink-0">
          <OnboardingProgress draft={draft} step={step} />
        </CardHeader>
        <CardContent className="px-4 pb-4 md:px-6 md:pb-6 pt-0 flex-1 flex flex-col min-h-0 overflow-y-auto">
          <AnimatePresence mode="wait">
            {draft.step === "platforms" ? (
              <PlatformsStep
                allSelected={allSelected}
                draft={draft}
                platformFamilies={platformFamilies}
                platformsUnavailable={platformsUnavailable}
                seedData={seedData}
                selectedIds={selectedIds}
                showPlatformDetails={showPlatformDetails}
                onContinue={continueFromPlatforms}
                onShowPlatformDetailsChange={setShowPlatformDetails}
                onToggleAllPlatforms={toggleAllPlatforms}
                onTogglePlatform={togglePlatform}
                onTogglePlatformPreset={togglePlatformPreset}
              />
            ) : draft.step === "anchors" ? (
              <LovedGamesStep
                draft={draft}
                getSeedGame={getSeedGame}
                onBack={() =>
                  updateState((next) => {
                    next.user.onboarding.step = "platforms";
                  })
                }
                onContinue={() => {
                  updateState((next) => {
                    next.user.onboarding.step = "dislikes";
                  });
                  setUi((current) => ({ ...current, onboardingQuery: "" }));
                }}
                onOpenSearch={openSearch}
                onRemoveAnchor={removeAnchor}
              />
            ) : (
              <MissedGameStep
                draft={draft}
                getSeedGame={getSeedGame}
                onBack={() => {
                  updateState((next) => {
                    next.user.onboarding.step = "anchors";
                  });
                  setUi((current) => ({ ...current, onboardingQuery: "" }));
                }}
                onFinalize={finalize}
                onOpenSearch={openSearch}
                onRemoveDislikedAnchor={removeDislikedAnchor}
              />
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      <OnboardingSearchDialog
        anchorResults={anchorResults}
        draft={draft}
        hasOnboardingSearch={hasOnboardingSearch}
        onboardingQuery={ui.onboardingQuery}
        onboardingSearchError={onboardingSearchError}
        onboardingSearchPending={onboardingSearchPending}
        replaceGameId={replaceGameId}
        searchSlot={searchSlot}
        seedData={seedData}
        onAddAnchor={addAnchor}
        onAddDislikedAnchor={addDislikedAnchor}
        onClose={closeSearch}
        onQueryChange={(query) => setUi((current) => ({ ...current, onboardingQuery: query }))}
        onReplaceAnchor={replaceAnchor}
      />
    </section>
  );
}
