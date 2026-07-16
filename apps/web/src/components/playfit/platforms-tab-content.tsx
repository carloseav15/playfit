"use client";

import { Check, Gamepad2, Search } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { usePlayfitState } from "../playfit/playfit-context";
import { withPlatformSelectionGuard } from "./onboarding/onboarding-helpers";
import {
  desktopFamilyIcons,
  formatTastePlatformFamily,
  platformKindLabels,
  tastePlatformFamilies,
  tastePlatformPresets,
} from "./platforms-tab-catalog";

export function PlatformsTabContent() {
  const { state, seedData, updateState } = usePlayfitState();
  const selectedIds = new Set(state.user.onboarding.platforms.map((p) => p.platformId));
  const viewPagerRef = useRef<HTMLDivElement>(null);
  const [activeFamily, setActiveFamily] = useState("nintendo");
  const [desktopFamily, setDesktopFamily] = useState("all");
  const [desktopSearch, setDesktopSearch] = useState("");

  function selectDesktopFamily(family: string) {
    setDesktopFamily(family);
    setDesktopSearch("");
  }

  // Settings platforms start pre-selected with every platform for a fresh profile (see
  // withDefaultPlatforms in playfit-context.tsx). Deselecting down to 0 is blocked as a
  // safety net: with no platforms selected, the recommendation engine treats every known
  // game as not_on_platforms and excludes it from Play Next entirely.
  function togglePlatform(platformId: string) {
    updateState((next) => {
      const isSelected = next.user.onboarding.platforms.some((p) => p.platformId === platformId);
      const filtered = next.user.onboarding.platforms.filter((p) => p.platformId !== platformId);
      const nextPlatforms = isSelected
        ? filtered
        : [...filtered, { platformId, status: "available" as const }];
      next.user.onboarding.platforms = withPlatformSelectionGuard(
        next.user.onboarding.platforms,
        nextPlatforms,
      );
    });
  }

  const desktopFamilyGroups = tastePlatformFamilies
    .map((family) => ({
      id: family,
      label: formatTastePlatformFamily(family),
      Icon: desktopFamilyIcons[family] ?? Gamepad2,
      platforms: seedData.platforms
        .filter((p) => p.family === family)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    }))
    .filter((group) => group.platforms.length > 0);
  const desktopAllPlatforms = desktopFamilyGroups.flatMap((group) => group.platforms);
  const activeDesktopGroup = desktopFamilyGroups.find((group) => group.id === desktopFamily);
  const desktopBasePlatforms =
    desktopFamily === "all" ? desktopAllPlatforms : (activeDesktopGroup?.platforms ?? []);
  const desktopQuery = desktopSearch.trim().toLowerCase();
  const desktopVisiblePlatforms = desktopQuery
    ? desktopBasePlatforms.filter((p) => p.displayName.toLowerCase().includes(desktopQuery))
    : desktopBasePlatforms;

  function selectAllInActiveFamily() {
    if (!activeDesktopGroup) return;
    updateState((next) => {
      const existingIds = new Set(next.user.onboarding.platforms.map((p) => p.platformId));
      for (const platform of activeDesktopGroup.platforms) {
        if (!existingIds.has(platform.platformId)) {
          next.user.onboarding.platforms.push({
            platformId: platform.platformId,
            status: "available",
          });
        }
      }
    });
  }

  // TabLayout -> ViewPager synchronization
  const handleTabClick = (family: string, index: number) => {
    setActiveFamily(family);
    if (viewPagerRef.current) {
      const width = viewPagerRef.current.clientWidth;
      viewPagerRef.current.scrollTo({
        left: index * width,
        behavior: "smooth",
      });
    }
  };

  // ViewPager -> TabLayout synchronization
  const handleViewPagerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const index = Math.round(container.scrollLeft / container.clientWidth);
    const targetFamily = tastePlatformFamilies[index];
    if (targetFamily && targetFamily !== activeFamily) {
      setActiveFamily(targetFamily);
    }
  };

  function applyPreset(presetId: string) {
    const preset = tastePlatformPresets.find((p) => p.id === presetId);
    if (!preset) return;
    updateState((next) => {
      const existing = new Set(next.user.onboarding.platforms.map((p) => p.platformId));
      for (const platform of seedData.platforms) {
        if (preset.matches(platform) && !existing.has(platform.platformId)) {
          next.user.onboarding.platforms.push({
            platformId: platform.platformId,
            status: "available",
          });
        }
      }
    });
  }

  function clearPreset(presetId: string) {
    const preset = tastePlatformPresets.find((p) => p.id === presetId);
    if (!preset) return;
    updateState((next) => {
      const remaining = next.user.onboarding.platforms.filter((p) => {
        const platform = seedData.platforms.find((plat) => plat.platformId === p.platformId);
        return !platform || !preset.matches(platform);
      });
      next.user.onboarding.platforms = withPlatformSelectionGuard(
        next.user.onboarding.platforms,
        remaining,
      );
    });
  }

  const presetStatus = tastePlatformPresets.map((preset) => {
    const presetPlatforms = seedData.platforms.filter(preset.matches);
    const selectedCount = presetPlatforms.filter((p) => selectedIds.has(p.platformId)).length;
    const allSelected = presetPlatforms.length > 0 && selectedCount === presetPlatforms.length;
    const someSelected = selectedCount > 0 && !allSelected;
    return {
      presetId: preset.id,
      allSelected,
      someSelected,
      selectedCount,
    };
  });

  return (
    <Card className="rounded-3xl border border-border bg-card shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-xl font-bold">Systems you play on</CardTitle>
        <CardDescription className="text-xs text-muted-foreground">
          Select consoles, handhelds, or computer systems to see recommendations matching what you
          own or play.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {/* Presets */}
        <div className="grid gap-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Presets & Quick Select
          </p>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {tastePlatformPresets.map((preset) => {
              const status = presetStatus.find((s) => s.presetId === preset.id);
              const all = status?.allSelected ?? false;
              const some = status?.someSelected ?? false;
              const Icon = preset.Icon;

              return (
                <div
                  key={preset.id}
                  className={cn(
                    "flex flex-col justify-between gap-3 rounded-2xl border border-border/60 bg-secondary/30 p-4 transition-all hover:border-border",
                    (all || some) && "border-accent/30 bg-accent/[0.03]",
                  )}
                >
                  <div className="grid gap-1">
                    <div className="flex items-center gap-2 text-foreground">
                      <Icon className="size-4 text-muted-foreground" />
                      <strong className="text-xs font-bold leading-none">{preset.label}</strong>
                    </div>
                    <p className="text-[10px] leading-relaxed text-muted-foreground">
                      {preset.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 pt-1">
                    {all ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-8 rounded-xl text-[10px] font-extrabold"
                        onClick={() => clearPreset(preset.id)}
                      >
                        Remove all
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-xl text-[10px] font-extrabold"
                        onClick={() => applyPreset(preset.id)}
                      >
                        Select{" "}
                        {status?.selectedCount && status.selectedCount > 0 ? "remaining" : "all"}
                      </Button>
                    )}
                    {(all || some) && (
                      <span className="text-[9px] font-bold text-muted-foreground bg-secondary/80 rounded px-1.5 py-0.5 ml-auto">
                        {status?.selectedCount} active
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Platforms List */}
        <div className="grid gap-3">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Custom Selection
          </p>

          {/* Mobile view (Scroll synchronized tabs + ViewPager) */}
          <div className="grid md:hidden gap-3">
            {/* Scrollable TabLayout */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none shrink-0">
              {tastePlatformFamilies.map((family, idx) => {
                const active = activeFamily === family;
                return (
                  <button
                    key={family}
                    type="button"
                    onClick={() => handleTabClick(family, idx)}
                    className={cn(
                      "rounded-xl px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
                      active
                        ? "bg-foreground text-background"
                        : "bg-secondary text-muted-foreground hover:bg-secondary/80",
                    )}
                  >
                    {formatTastePlatformFamily(family)}
                  </button>
                );
              })}
            </div>

            {/* ViewPager */}
            <div
              ref={viewPagerRef}
              onScroll={handleViewPagerScroll}
              className="flex snap-x snap-mandatory overflow-x-auto scrollbar-none rounded-2xl border border-border/60 bg-secondary/10"
            >
              {tastePlatformFamilies.map((family) => {
                const platforms = seedData.platforms
                  .filter((p) => p.family === family)
                  .sort((a, b) => a.sortOrder - b.sortOrder);

                return (
                  <div
                    key={family}
                    className="w-full flex-shrink-0 snap-center snap-always p-4 max-h-[300px] overflow-y-auto"
                  >
                    <div className="grid gap-2">
                      {platforms.map((platform) => {
                        const checked = selectedIds.has(platform.platformId);
                        return (
                          <button
                            key={platform.platformId}
                            type="button"
                            aria-pressed={checked}
                            onClick={() => togglePlatform(platform.platformId)}
                            className={cn(
                              "flex items-center justify-between rounded-xl border border-border/40 bg-card p-3 text-left transition-all",
                              checked && "border-accent/40 bg-accent/[0.04]",
                            )}
                          >
                            <span className="text-xs font-extrabold text-foreground">
                              {platform.displayName}
                            </span>
                            <span
                              className={cn(
                                "grid size-4 place-items-center rounded-full border border-border/60 text-transparent transition-all",
                                checked && "border-accent bg-accent text-accent-foreground",
                              )}
                            >
                              <Check className="size-2.5 stroke-[3]" />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Desktop view */}
          <div className="hidden md:grid gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-secondary/35 rounded-2xl p-2.5">
              {/* Desktop Filters */}
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => selectDesktopFamily("all")}
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                    desktopFamily === "all"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-secondary/80",
                  )}
                >
                  All Platforms
                </button>
                {desktopFamilyGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => selectDesktopFamily(group.id)}
                    className={cn(
                      "rounded-xl px-3 py-1.5 text-xs font-bold transition-all cursor-pointer",
                      desktopFamily === group.id
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:bg-secondary/80",
                    )}
                  >
                    {group.label}
                  </button>
                ))}
              </div>

              {/* Search + Action panel */}
              <div className="flex items-center gap-2 ml-auto">
                <div className="relative w-44">
                  <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search systems..."
                    value={desktopSearch}
                    onChange={(e) => setDesktopSearch(e.target.value)}
                    className="h-9 w-full rounded-xl border border-border/60 bg-card pl-9 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-0"
                  />
                </div>
                {desktopFamily !== "all" && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-xl text-xs font-bold"
                    onClick={selectAllInActiveFamily}
                  >
                    Select all
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 max-h-[420px] overflow-y-auto pr-1 content-start">
              {desktopVisiblePlatforms.map((platform) => {
                const checked = selectedIds.has(platform.platformId);
                return (
                  <button
                    key={platform.platformId}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => togglePlatform(platform.platformId)}
                    className={cn(
                      "grid gap-2 rounded-2xl border border-border/60 bg-secondary/30 p-3.5 text-left transition-all hover:border-border",
                      checked && "border-accent/40 bg-accent/10",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {platformKindLabels[platform.kind]}
                      </span>
                      <span
                        className={cn(
                          "grid size-4 place-items-center rounded-full border border-border/60 text-transparent transition-all",
                          checked && "border-accent bg-accent text-accent-foreground",
                        )}
                      >
                        <Check className="size-2.5 stroke-[3]" />
                      </span>
                    </div>
                    <span className="text-sm font-extrabold text-foreground">
                      {platform.displayName}
                    </span>
                  </button>
                );
              })}
              {desktopVisiblePlatforms.length === 0 && (
                <p className="col-span-3 py-8 text-center text-xs text-muted-foreground">
                  No platforms match “{desktopSearch}”.
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
