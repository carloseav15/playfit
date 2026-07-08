"use client";

import { buildTasteModel } from "@playfit/core/domain";
import type { ProductPlatformOption } from "@playfit/core/types";
import {
  ArrowLeft,
  Check,
  Gamepad2,
  Laptop,
  Layers,
  LayoutGrid,
  Search,
  ShieldCheck,
  Tv,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Container } from "@/components/ui/container";
import { Skeleton } from "@/components/ui/skeleton";
import { ensureGamesCached } from "@/lib/game-cache";
import { cn } from "@/lib/utils";
import { useHeader } from "../playfit/header-context";
import { usePlayfit } from "../playfit/playfit-context";
import { StatusToast } from "../playfit/status-toast";

export type { HistoryOrActivityEntry } from "./taste-model";

import { TasteDesktop } from "./desktop/taste-desktop";
import { TasteMobile } from "./mobile/taste-mobile";
import {
  buildHistoryAndActivityEntries,
  getMissingGameIds,
  getSeedGamesById,
  getTasteGameIds,
} from "./taste-model";
import { useTodayRecommendations } from "./use-today-recommendations";

const tastePlatformCurrentIds = new Set([
  "switch_1",
  "switch_2",
  "ps5",
  "xbox_series_xs",
  "pc",
  "macos",
  "linux",
  "cups",
]);

const tastePlatformRetroIds = new Set([
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

const tastePlatformPresets: Array<{
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
    matches: (p) => tastePlatformCurrentIds.has(p.platformId),
    Icon: Gamepad2,
  },
  {
    id: "nintendo",
    label: "Nintendo",
    description: "Switch, handhelds, and classic Nintendo.",
    matches: (p) => p.family === "nintendo",
    Icon: Gamepad2,
  },
  {
    id: "playstation",
    label: "PlayStation",
    description: "Sony home and handheld systems.",
    matches: (p) => p.family === "playstation",
    Icon: Gamepad2,
  },
  {
    id: "xbox",
    label: "Xbox",
    description: "Xbox generations and current consoles.",
    matches: (p) => p.family === "xbox",
    Icon: Gamepad2,
  },
  {
    id: "pc",
    label: "PC",
    description: "Desktop and computer platforms.",
    matches: (p) => p.family === "pc" || p.kind === "computer",
    Icon: Laptop,
  },
  {
    id: "retro",
    label: "Retro",
    description: "Older consoles and handhelds.",
    matches: (p) =>
      tastePlatformRetroIds.has(p.platformId) || ["sega", "atari", "snk"].includes(p.family),
    Icon: Tv,
  },
];

const tastePlatformFamilies = ["nintendo", "playstation", "xbox", "sega", "pc", "other"];
const tastePlatformFamilyLabels: Record<string, string> = {
  nintendo: "Nintendo",
  playstation: "PlayStation",
  xbox: "Xbox",
  sega: "SEGA",
  pc: "PC",
  other: "Other",
};

function formatTastePlatformFamily(family: string) {
  return (
    tastePlatformFamilyLabels[family] ??
    family
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
  );
}

const desktopFamilyIcons: Record<string, typeof Gamepad2> = {
  nintendo: Gamepad2,
  playstation: Gamepad2,
  xbox: Gamepad2,
  sega: Tv,
  pc: Laptop,
  other: Tv,
};

const platformKindLabels: Record<ProductPlatformOption["kind"], string> = {
  console: "Console",
  handheld: "Handheld",
  hybrid: "Hybrid",
  computer: "Computer",
  other: "Other",
};

export function PlatformsTabContent() {
  const { state, seedData, updateState } = usePlayfit();
  const selectedIds = new Set(state.user.onboarding.platforms.map((p) => p.platformId));
  const viewPagerRef = useRef<HTMLDivElement>(null);
  const [activeFamily, setActiveFamily] = useState("nintendo");
  const [desktopFamily, setDesktopFamily] = useState("all");
  const [desktopSearch, setDesktopSearch] = useState("");

  function selectDesktopFamily(family: string) {
    setDesktopFamily(family);
    setDesktopSearch("");
  }

  function togglePlatform(platformId: string) {
    updateState((next) => {
      const isSelected = next.user.onboarding.platforms.some((p) => p.platformId === platformId);
      next.user.onboarding.platforms = next.user.onboarding.platforms.filter(
        (p) => p.platformId !== platformId,
      );
      if (!isSelected) {
        next.user.onboarding.platforms.push({ platformId, status: "available" });
      }
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

  const renderPlatformFamilyPane = (family: string) => {
    const group = seedData.platforms
      .filter((p) => p.family === family)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    if (group.length === 0) return null;
    const consoles = group.filter((p) => p.kind !== "handheld");
    const handhelds = group.filter((p) => p.kind === "handheld");

    return (
      <div key={family} className="grid gap-3 w-full shrink-0 snap-center pb-2 px-1">
        {consoles.length > 0 && (
          <div>
            {handhelds.length > 0 && (
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Console / Hybrid
              </p>
            )}
            <div className="grid gap-3 grid-cols-2 min-w-0">
              {consoles.map((platform) => {
                const checked = selectedIds.has(platform.platformId);
                return (
                  <Checkbox
                    key={platform.platformId}
                    id={`mobile-taste-plat-${platform.platformId}`}
                    checked={checked}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      updateState((next) => {
                        next.user.onboarding.platforms = next.user.onboarding.platforms.filter(
                          (p) => p.platformId !== platform.platformId,
                        );
                        if (isChecked) {
                          next.user.onboarding.platforms.push({
                            platformId: platform.platformId,
                            status: "available",
                          });
                        }
                      });
                    }}
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
            <div className="grid gap-3 grid-cols-2 min-w-0">
              {handhelds.map((platform) => {
                const checked = selectedIds.has(platform.platformId);
                return (
                  <Checkbox
                    key={platform.platformId}
                    id={`mobile-taste-plat-hh-${platform.platformId}`}
                    checked={checked}
                    onChange={(e) => {
                      const isChecked = e.target.checked;
                      updateState((next) => {
                        next.user.onboarding.platforms = next.user.onboarding.platforms.filter(
                          (p) => p.platformId !== platform.platformId,
                        );
                        if (isChecked) {
                          next.user.onboarding.platforms.push({
                            platformId: platform.platformId,
                            status: "available",
                          });
                        }
                      });
                    }}
                    label={platform.displayName}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Card className="rounded-3xl border border-border bg-card shadow-lg">
      <CardHeader>
        <CardTitle className="text-lg font-black text-foreground">Your Platforms</CardTitle>
        <CardDescription className="text-xs text-muted-foreground mt-0.5">
          Recommendations are only shown for games available on your active platforms. Changes save
          automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6">
        {/* Quick Groups */}
        <div className="grid gap-3">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Quick Groups
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tastePlatformPresets.map((preset) => {
              const presetPlatforms = seedData.platforms.filter(preset.matches);
              const presetIds = presetPlatforms.map((p) => p.platformId);
              const selectedCount = presetIds.filter((id) => selectedIds.has(id)).length;
              const selected = presetIds.length > 0 && selectedCount === presetIds.length;
              const partiallySelected = selectedCount > 0 && !selected;
              return (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={selected}
                  disabled={presetIds.length === 0}
                  className={cn(
                    "group grid min-h-28 content-between gap-3 rounded-2xl border border-border/60 bg-secondary/60 p-4 text-left transition-all duration-300 hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                    selected &&
                      "border-accent/40 bg-accent/10 shadow-[0_0_20px_rgba(255,106,61,0.1)]",
                  )}
                  onClick={() => {
                    updateState((next) => {
                      if (selected) {
                        next.user.onboarding.platforms = next.user.onboarding.platforms.filter(
                          (p) => !presetIds.includes(p.platformId),
                        );
                      } else {
                        const cur = new Set(
                          next.user.onboarding.platforms.map((p) => p.platformId),
                        );
                        for (const id of presetIds) {
                          if (!cur.has(id)) {
                            next.user.onboarding.platforms.push({
                              platformId: id,
                              status: "available",
                            });
                          }
                        }
                      }
                    });
                  }}
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
                    <div
                      className={cn(
                        "size-8 shrink-0 rounded-xl grid place-items-center border border-border/60 bg-secondary/60 text-muted-foreground group-hover:text-foreground transition-all duration-300",
                        selected &&
                          "border-accent/30 bg-accent/10 text-accent group-hover:text-accent",
                      )}
                    >
                      <preset.Icon className="size-4" />
                    </div>
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

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border/60 bg-secondary/40 p-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">{state.user.onboarding.platforms.length}</strong>{" "}
            systems selected for Play Next.
          </p>
        </div>

        {/* Mobile Swipe ViewPager Layout */}
        <div className="flex flex-col gap-4 md:hidden min-w-0">
          {/* TabLayout Header */}
          <div className="flex overflow-x-auto scrollbar-none border-b border-border/60 pb-1.5 gap-4 relative shrink-0">
            {tastePlatformFamilies.map((family, idx) => (
              <button
                key={family}
                type="button"
                onClick={() => handleTabClick(family, idx)}
                className={cn(
                  "relative pb-2 text-[10px] font-bold uppercase tracking-wider transition-colors shrink-0",
                  activeFamily === family ? "text-accent" : "text-muted-foreground",
                )}
              >
                {formatTastePlatformFamily(family)}
                {activeFamily === family && (
                  <motion.div
                    layoutId="activePlatformTab"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* ViewPager Content Container */}
          <div
            ref={viewPagerRef}
            onScroll={handleViewPagerScroll}
            className="flex w-full overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth"
          >
            {tastePlatformFamilies.map((family) => renderPlatformFamilyPane(family))}
          </div>
        </div>

        {/* Desktop Sidebar + Canvas Layout */}
        <div className="hidden md:grid md:grid-cols-[200px_minmax(0,1fr)] gap-6 min-w-0">
          <nav className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => selectDesktopFamily("all")}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-all",
                desktopFamily === "all"
                  ? "bg-secondary text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
              )}
            >
              <LayoutGrid className="size-4 shrink-0" />
              <span className="flex-1">All Platforms</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {state.user.onboarding.platforms.length}/{desktopAllPlatforms.length}
              </span>
            </button>
            {desktopFamilyGroups.map((group) => {
              const selectedCount = group.platforms.filter((p) =>
                selectedIds.has(p.platformId),
              ).length;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => selectDesktopFamily(group.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold transition-all",
                    desktopFamily === group.id
                      ? "bg-secondary text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  <group.Icon className="size-4 shrink-0" />
                  <span className="flex-1">{group.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {selectedCount}/{group.platforms.length}
                  </span>
                </button>
              );
            })}
            <div className="mt-2 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <strong className="font-mono text-foreground">
                {state.user.onboarding.platforms.length}
              </strong>{" "}
              systems selected.
            </div>
          </nav>

          <div className="grid gap-4 min-w-0 content-start">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-black text-foreground">
                  {desktopFamily === "all" ? "All Platforms" : activeDesktopGroup?.label}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {desktopFamily === "all"
                    ? `${desktopAllPlatforms.length} systems across ${desktopFamilyGroups.length} families.`
                    : `${activeDesktopGroup?.platforms.length ?? 0} systems.`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={desktopSearch}
                    onChange={(e) => setDesktopSearch(e.target.value)}
                    placeholder={
                      desktopFamily === "all"
                        ? "Filter all platforms…"
                        : `Filter ${activeDesktopGroup?.label ?? ""}…`
                    }
                    className="h-9 w-48 rounded-xl border border-border/60 bg-secondary/40 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

export function TasteShell() {
  const { state, getSeedGame, applyDecisionFeedback, removeTasteSignal, setPlayfitPick } =
    usePlayfit();
  const [, setCacheVersion] = useState(0);
  const [hydrating, setHydrating] = useState(false);
  const [hydratedOnce, setHydratedOnce] = useState(false);
  const [changingId, setChangingId] = useState<string | null>(null);
  const [activeMainTab, setActiveMainTab] = useState<"taste" | "activity">("taste");
  const [mapView, setMapView] = useState<"visual" | "list">("visual");
  const [subView, setSubView] = useState<"menu" | "map" | "list" | "activity">("menu");

  useHeader(
    subView === "map"
      ? { title: "Affinity Map", onBack: () => setSubView("menu") }
      : subView === "list"
        ? { title: "Traits List", onBack: () => setSubView("menu") }
        : subView === "activity"
          ? { title: "Activity", onBack: () => setSubView("menu") }
          : {},
    [subView],
  );
  const profile = state.user.profile;
  const requiredIds = useMemo(() => getTasteGameIds(state), [state]);
  const gamesById = getSeedGamesById(requiredIds, getSeedGame);
  const missingIds = getMissingGameIds(requiredIds, gamesById);
  const missingKey = missingIds.join("|");
  const model = useMemo(
    () => buildTasteModel(state.user.onboarding, state.user.gameStates, gamesById, profile),
    [state.user.onboarding, state.user.gameStates, gamesById, profile],
  );
  const belowCalibration =
    state.user.onboarding.likedGameIds.length < 3 ||
    (state.user.onboarding.dislikedGameIds ?? []).length < 1;

  const profileReady = !!state.user.onboardingCompletedAt && !!profile;
  const { model: recsModel } = useTodayRecommendations({
    enabled: profileReady,
    profile,
    gameStates: state.user.gameStates,
    onboarding: state.user.onboarding,
    errorMessage: "Recommendations could not be loaded for the map.",
    cacheScope: "decision",
  });

  useEffect(() => {
    if (!missingKey) {
      setHydrating(false);
      return;
    }

    let cancelled = false;
    setHydrating(true);
    const idsToFetch = missingKey.split("|").filter(Boolean);
    void ensureGamesCached(idsToFetch).finally(() => {
      if (cancelled) return;
      setCacheVersion((current) => current + 1);
      setHydratedOnce(true);
      setHydrating(false);
    });

    return () => {
      cancelled = true;
    };
  }, [missingKey]);

  const historyAndActivityEntries = useMemo(
    () =>
      buildHistoryAndActivityEntries({
        gameStates: state.user.gameStates,
        historyEntries: model.historyEntries,
        gamesById,
      }),
    [state.user.gameStates, model.historyEntries, gamesById],
  );

  const recs = useMemo(() => {
    if (!recsModel) return [];
    return recsModel.nextUp;
  }, [recsModel]);

  if (!profile) {
    return (
      <div className="min-h-screen text-foreground relative flex items-center justify-center">
        <Container as="main" size="sm" className="py-8">
          <Card className="rounded-3xl border border-border bg-card shadow-lg p-6 text-center">
            <CardHeader className="px-0 pt-0">
              <CardTitle className="text-2xl font-black">Set up your taste first</CardTitle>
              <CardDescription className="text-xs text-muted-foreground mt-1">
                Select your platforms and a few favorite games so we can build your recommendations.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0 pb-0 pt-4">
              <Button
                type="button"
                asChild
                className="bg-accent text-accent-foreground font-extrabold hover:bg-accent/90"
              >
                <Link href="/">Start Play Next</Link>
              </Button>
            </CardContent>
          </Card>
        </Container>
      </div>
    );
  }

  if (hydrating || (missingIds.length > 0 && !hydratedOnce)) {
    return (
      <Container as="main" size="md" className="grid gap-4 py-8">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-6 w-96 rounded-lg" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </Container>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative min-h-screen text-foreground w-full"
    >
      <div className="pointer-events-none absolute left-1/4 top-1/4 size-[400px] rounded-full bg-accent/5 blur-[100px]" />
      <div className="pointer-events-none absolute right-1/4 bottom-1/4 size-[350px] rounded-full bg-indigo-500/5 blur-[90px]" />

      <div className="w-full">
        <Container as="main" size="md" className="flex flex-col gap-6 py-6 lg:py-8">
          <div className="hidden md:flex flex-wrap items-center justify-between gap-3 shrink-0">
            <Button
              type="button"
              variant="ghost"
              asChild
              className="text-xs hover:text-foreground hover:bg-secondary"
            >
              <Link href="/" className="flex items-center">
                <ArrowLeft className="size-4 mr-1.5" />
                Back to Play Next Recommendation
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Badge
                variant="info"
                className="bg-accent/10 text-accent border border-accent/30 text-[10px] font-bold py-1 px-3"
              >
                Based on {model.evidenceCount} preferences
              </Badge>
            </div>
          </div>

          <section className="hidden md:grid relative overflow-hidden gap-4 rounded-3xl border border-border bg-card p-6 shadow-md md:grid-cols-[minmax(0,1.15fr)_minmax(250px,0.85fr)] md:items-end shrink-0">
            <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-accent/10 blur-xl" />
            <div className="grid gap-2 relative z-10">
              <div className="flex items-center gap-2 text-accent">
                <Layers className="size-4" />
                <span className="text-[10px] font-black uppercase tracking-[0.15em]">
                  Gaming profile
                </span>
              </div>
              <h1 className="font-display text-4xl font-black tracking-tight text-foreground mt-1">
                Your Taste
              </h1>
              <p className="max-w-2xl text-xs text-muted-foreground leading-relaxed mt-0.5">
                What Playfit is learning from your active decisions. {model.confidenceLabel}.
              </p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-secondary/50 p-4 relative z-10">
              <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-accent flex items-center gap-1.5">
                <ShieldCheck className="size-3.5" />
                Profile Summary
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                {model.positiveCount > model.negativeCount
                  ? "Playfit leans toward your favorites, but still needs more signals to sharpen the edge cases."
                  : "Playfit is still balancing your likes and misses; a few more decisions will make the next pick steadier."}
              </p>
            </div>
          </section>

          {belowCalibration ? (
            <Alert variant="warning" className="shrink-0">
              Add at least 3 liked games and 1 missed game to refine your recommendations.
            </Alert>
          ) : null}

          {missingIds.length > 0 ? (
            <Alert variant="warning" className="shrink-0">
              Some older signals could not be loaded.
            </Alert>
          ) : null}

          {/* Mobile sub-views layout */}
          <TasteMobile
            model={model}
            historyAndActivityEntries={historyAndActivityEntries}
            gamesById={gamesById}
            gameStates={state.user.gameStates}
            recs={recs}
            subView={subView}
            setSubView={setSubView}
            changingId={changingId}
            setChangingId={setChangingId}
            applyDecisionFeedback={applyDecisionFeedback}
            setPlayfitPick={setPlayfitPick}
            removeTasteSignal={removeTasteSignal}
          />

          {/* Desktop layout */}
          <TasteDesktop
            model={model}
            historyAndActivityEntries={historyAndActivityEntries}
            gamesById={gamesById}
            gameStates={state.user.gameStates}
            recs={recs}
            activeMainTab={activeMainTab}
            setActiveMainTab={setActiveMainTab}
            mapView={mapView}
            setMapView={setMapView}
            changingId={changingId}
            setChangingId={setChangingId}
            applyDecisionFeedback={applyDecisionFeedback}
            setPlayfitPick={setPlayfitPick}
            removeTasteSignal={removeTasteSignal}
          />
        </Container>
        <StatusToast />
      </div>
    </motion.div>
  );
}
