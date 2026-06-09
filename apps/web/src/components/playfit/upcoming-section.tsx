"use client";

import { type RankedSeedGame, scoreSeedGame } from "@playfit/core";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { usePlayfit } from "./playfit-context";
import { buildPlatformsKey, decisionLabel, decisionTone, primaryReason } from "./product-utils";
import { SectionHead } from "./section-head";

export function UpcomingSection() {
  const { seedData, state, ui, setUi, openDossier, toggleFlag } = usePlayfit();
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const platformsKey = useMemo(
    () => buildPlatformsKey(state.user),
    [state.user.onboarding.platforms],
  );
  const preferredPlatformIds = useMemo(
    () => new Set(platformsKey.split(",").filter(Boolean)),
    [platformsKey],
  );
  const preferredPlatforms = useMemo(
    () => seedData.platforms.filter((platform) => preferredPlatformIds.has(platform.platformId)),
    [seedData.platforms, preferredPlatformIds],
  );
  const visiblePlatforms = showAllPlatforms
    ? seedData.platforms
    : (preferredPlatforms.length > 0 ? preferredPlatforms : seedData.platforms).slice(0, 8);
  const entries = useMemo(() => {
    return seedData.allGames
      .filter((game) => game.releaseState === "unreleased")
      .filter((game) => game.sortDate && game.sortDate >= today)
      .filter(
        (game) =>
          ui.upcomingPlatformFilters.size === 0 ||
          game.availablePlatformIds.some((id) => ui.upcomingPlatformFilters.has(id)),
      )
      .map((game) => (state.user.profile ? scoreSeedGame(game, state, state.user.profile) : null))
      .filter((entry): entry is RankedSeedGame => Boolean(entry))
      .sort((left, right) => (left.game.sortDate ?? "").localeCompare(right.game.sortDate ?? ""));
  }, [
    seedData.allGames,
    state.user.profile,
    state.user.gameStates,
    platformsKey,
    ui.upcomingPlatformFilters,
    today,
  ]);

  return (
    <section>
      <SectionHead
        eyebrow="Upcoming"
        title="Release radar"
        copy="Track what is coming to platforms you care about."
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {visiblePlatforms.map((platform) => {
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
        })}
        {seedData.platforms.length > visiblePlatforms.length && (
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
                    aria-pressed={entry.inWishlist}
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
