"use client";

import { scoreSeedGame } from "@playfit/core/domain";
import type { RankedSeedGame, SeedGame } from "@playfit/core/types";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Stack } from "@/components/ui/stack";
import { ToggleButton, ToggleGroup } from "@/components/ui/toggle-group";
import { usePlayfit } from "./playfit-context";
import { buildPlatformsKey, decisionLabel, decisionTone, primaryReason } from "./product-utils";
import { SectionHead } from "./section-head";

export function UpcomingSection() {
  const { seedData, state, ui, setUi, openDossier, toggleFlag } = usePlayfit();
  const [showAllPlatforms, setShowAllPlatforms] = useState(false);
  const [upcomingGames, setUpcomingGames] = useState<SeedGame[]>([]);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);
  const platformsKey = useMemo(() => buildPlatformsKey(state.user), [state.user]);
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

  useEffect(() => {
    let cancelled = false;
    async function fetchUpcoming() {
      try {
        const res = await fetch("/api/games?page=1&pageSize=100");
        if (!res.ok) return;
        const data = (await res.json()) as { games: SeedGame[] };
        if (!cancelled) {
          setUpcomingGames(
            data.games.filter(
              (g) => g.releaseState === "unreleased" && g.sortDate && g.sortDate >= today,
            ),
          );
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void fetchUpcoming();
    return () => {
      cancelled = true;
    };
  }, [today]);

  const entries = useMemo(() => {
    return upcomingGames
      .filter(
        (game) =>
          ui.upcomingPlatformFilters.size === 0 ||
          game.availablePlatformIds.some((id) => ui.upcomingPlatformFilters.has(id)),
      )
      .map((game) => (state.user.profile ? scoreSeedGame(game, state, state.user.profile) : null))
      .filter((entry): entry is RankedSeedGame => Boolean(entry))
      .sort((left, right) => (left.game.sortDate ?? "").localeCompare(right.game.sortDate ?? ""));
  }, [upcomingGames, state, ui.upcomingPlatformFilters]);

  if (loading) {
    return (
      <section>
        <SectionHead
          eyebrow="Upcoming"
          title="Release radar"
          copy="Track what is coming to platforms you care about."
        />
        <p className="text-sm text-muted-foreground">Loading upcoming releases...</p>
      </section>
    );
  }

  return (
    <section>
      <SectionHead
        eyebrow="Upcoming"
        title="Release radar"
        copy="Track what is coming to platforms you care about."
      />
      <ToggleGroup className="mb-5">
        {visiblePlatforms.map((platform) => {
          const active = ui.upcomingPlatformFilters.has(platform.platformId);
          return (
            <ToggleButton
              key={platform.platformId}
              active={active}
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
            </ToggleButton>
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
      </ToggleGroup>
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
                  <Stack direction="row" wrap gap={2}>
                    <Badge variant={decisionTone(entry)}>{decisionLabel(entry)}</Badge>
                    <Badge variant="secondary">
                      {entry.game.releaseLabel ?? entry.game.sortDate}
                    </Badge>
                  </Stack>
                  <CardTitle className="mt-3">{entry.game.title}</CardTitle>
                  <CardDescription>{primaryReason(entry)}</CardDescription>
                </div>
                <Stack direction="row" wrap gap={2} align="start">
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
                </Stack>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
