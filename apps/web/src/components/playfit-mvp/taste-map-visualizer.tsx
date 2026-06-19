"use client";

import type { ProductGameState, RankedSeedGame, SeedGame } from "@playfit/core/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CoverArt } from "../playfit/cover-art";
import { usePlayfit } from "../playfit/playfit-context";

interface GameNode {
  game: SeedGame;
  x: number;
  y: number;
  type: "liked" | "disliked" | "pending";
  score?: number;
  state?: ProductGameState;
}

function calculateGameCoordinates(game: SeedGame): { x: number; y: number } {
  let x = 0; // Chill (-) vs Demanding (+)
  let y = 0; // Story/Linear (-) vs Open World/Systems (+)

  // X-axis: Chill vs Demanding
  const demandingTags = [
    "souls_like",
    "unforgiving",
    "demanding",
    "survival",
    "tactical",
    "deck_building",
    "stealth",
  ];
  const chillTags = [
    "chill",
    "cozy",
    "accessible",
    "short_sessions",
    "pick_up_and_play",
    "lighthearted",
  ];

  // Y-axis: Story/Linear vs Open World/Systems
  const systemsTags = ["open_world", "sandbox", "roguelike", "puzzle", "rhythm", "deck_building"];
  const storyTags = [
    "story_rich",
    "lore_heavy",
    "linear",
    "branching_narrative",
    "text_based",
    "horror",
    "dark",
  ];

  game.tags.forEach((tag) => {
    if (demandingTags.includes(tag)) x += 28;
    if (chillTags.includes(tag)) x -= 28;
    if (systemsTags.includes(tag)) y += 28;
    if (storyTags.includes(tag)) y -= 28;
  });

  // Fallback by genre if no tags matched
  if (x === 0 && y === 0) {
    const genre = (game.genreId ?? game.primaryGenre ?? "").toLowerCase();
    if (genre.includes("rpg") || genre.includes("role_playing")) {
      x += 10;
      y -= 20;
    } else if (genre.includes("action") || genre.includes("shooter")) {
      x += 20;
      y += 15;
    } else if (genre.includes("adventure") || genre.includes("indie")) {
      x -= 15;
      y -= 15;
    } else if (genre.includes("strategy") || genre.includes("simulation")) {
      x += 25;
      y += 25;
    } else if (genre.includes("puzzle") || genre.includes("casual")) {
      x -= 25;
      y += 20;
    }
  }

  // Add deterministic jitter based on gameId to prevent complete overlapping
  let hash = 0;
  for (let i = 0; i < game.gameId.length; i++) {
    hash = game.gameId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const jitterX = (hash % 16) - 8;
  const jitterY = ((hash >> 4) % 16) - 8;

  x += jitterX;
  y += jitterY;

  return {
    x: Math.max(-90, Math.min(90, x)),
    y: Math.max(-90, Math.min(90, y)),
  };
}

export function TasteMapVisualizer({
  gamesById,
  gameStates,
}: {
  gamesById: Map<string, SeedGame>;
  gameStates: Record<string, ProductGameState>;
  recommendations?: RankedSeedGame[]; // Kept for prop compatibility in taste-shell.tsx
}) {
  const { state: playfitState } = usePlayfit();
  const onboarding = playfitState.user.onboarding;

  const carouselRef = useRef<HTMLDivElement>(null);
  const [activeNode, setActiveNode] = useState<GameNode | null>(null);

  const nodes = useMemo(() => {
    const list: GameNode[] = [];
    const addedIds = new Set<string>();

    // Add historical games (rated, onboarding, playing, picks)
    gamesById.forEach((game) => {
      const state = gameStates[game.gameId];
      const isLikedOnboarding = onboarding.likedGameIds.includes(game.gameId);
      const isDislikedOnboarding = (onboarding.dislikedGameIds ?? []).includes(game.gameId);

      // If it's not onboarding, active state, or pick, ignore
      if (!state && !isLikedOnboarding && !isDislikedOnboarding) return;

      const isPick = state?.inPlayfitPicks;
      const isPlaying = state?.status === "playing";
      const hasRating = state?.rating != null && state.rating > 0;

      let type: "liked" | "disliked" | "pending" = "liked";

      if (isPick && !isPlaying && !hasRating) {
        type = "pending";
      } else {
        const isLikedSignal =
          isLikedOnboarding ||
          isPlaying ||
          (state?.rating && state.rating >= 4) ||
          ((state?.status === "completed" || state?.status === "beaten") &&
            state?.rating &&
            state.rating >= 3);

        type = isLikedSignal ? "liked" : "disliked";
      }

      const { x, y } = calculateGameCoordinates(game);

      list.push({ game, x, y, type, state });
      addedIds.add(game.gameId);
    });

    return list;
  }, [gamesById, gameStates, onboarding]);

  // Set the first node as active initially
  const [hasDefaulted, setHasDefaulted] = useState(false);
  useEffect(() => {
    if (nodes.length > 0 && !hasDefaulted) {
      setActiveNode(nodes[0]);
      setHasDefaulted(true);
    }
  }, [nodes, hasDefaulted]);

  // Scroll active card into view inside the horizontal carousel
  useEffect(() => {
    if (!activeNode) return;
    const element = document.getElementById(`map-card-${activeNode.game.gameId}`);
    if (element && carouselRef.current) {
      const parent = carouselRef.current;
      const elementOffsetLeft = element.offsetLeft;
      const elementWidth = element.offsetWidth;
      const parentWidth = parent.clientWidth;
      const targetScrollLeft = elementOffsetLeft - parentWidth / 2 + elementWidth / 2;

      parent.scrollTo({
        left: targetScrollLeft,
        behavior: "smooth",
      });
    }
  }, [activeNode]);

  const goToPreviousNode = () => {
    if (nodes.length === 0) return;
    const currentIndex = nodes.findIndex((n) => n.game.gameId === activeNode?.game.gameId);
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) prevIndex = nodes.length - 1;
    setActiveNode(nodes[prevIndex]);
  };

  const goToNextNode = () => {
    if (nodes.length === 0) return;
    const currentIndex = nodes.findIndex((n) => n.game.gameId === activeNode?.game.gameId);
    let nextIndex = currentIndex + 1;
    if (nextIndex >= nodes.length) nextIndex = 0;
    setActiveNode(nodes[nextIndex]);
  };

  // Translate coordinate from [-100, 100] scale to SVG Viewbox [20, 380]
  const scaleX = (val: number) => 200 + (val / 100) * 160;
  const scaleY = (val: number) => 200 - (val / 100) * 160; // Invert Y for standard Cartesian

  return (
    <Card className="rounded-3xl border border-border bg-card shadow-lg overflow-hidden">
      <CardHeader className="pb-3 border-b border-border/40">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-black text-foreground">
              Interactive Affinity Map
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground mt-0.5">
              Visual coordinates mapping your gaming footprint and active pick list.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-[10px] font-bold">
            <span className="flex items-center gap-1.5 bg-positive-bg text-positive border border-positive/10 px-2 py-0.5 rounded-full">
              <span className="size-2 rounded-full bg-positive" />
              Liked / Playing ({nodes.filter((n) => n.type === "liked").length})
            </span>
            <span className="flex items-center gap-1.5 bg-negative-bg text-negative border border-negative/10 px-2 py-0.5 rounded-full">
              <span className="size-2 rounded-full bg-negative" />
              Disliked / Dropped ({nodes.filter((n) => n.type === "disliked").length})
            </span>
            <span className="flex items-center gap-1.5 bg-secondary text-muted-foreground border border-border px-2 py-0.5 rounded-full">
              <span className="size-2 rounded-full bg-muted-foreground" />
              Pending Picks ({nodes.filter((n) => n.type === "pending").length})
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 relative bg-muted/10">
        {/* SVG Cartesian Space */}
        <div className="w-full max-w-[460px] mx-auto aspect-square relative">
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click to clear selection is secondary mouse helper */}
          <svg
            viewBox="0 0 400 400"
            className="w-full h-full text-muted-foreground/35 select-none"
            aria-label="Affinity Map Plot"
            onClick={() => setActiveNode(null)}
          >
            {/* Grid Circles */}
            <circle
              cx="200"
              cy="200"
              r="160"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              strokeDasharray="3 3"
            />
            <circle
              cx="200"
              cy="200"
              r="100"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              strokeDasharray="3 3"
            />
            <circle
              cx="200"
              cy="200"
              r="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.5"
              strokeDasharray="3 3"
            />

            {/* Axes */}
            <line x1="20" y1="200" x2="380" y2="200" stroke="currentColor" strokeWidth="1" />
            <line x1="200" y1="20" x2="200" y2="380" stroke="currentColor" strokeWidth="1" />

            {/* Quadrant Labels */}
            <text
              x="35"
              y="35"
              className="text-[7.5px] font-black fill-muted-foreground uppercase tracking-widest opacity-80"
            >
              Chill &amp; Open World
            </text>
            <text
              x="240"
              y="35"
              className="text-[7.5px] font-black fill-muted-foreground uppercase tracking-widest opacity-80"
            >
              Complex &amp; Systems
            </text>
            <text
              x="35"
              y="375"
              className="text-[7.5px] font-black fill-muted-foreground uppercase tracking-widest opacity-80"
            >
              Cozy &amp; Story-Rich
            </text>
            <text
              x="240"
              y="375"
              className="text-[7.5px] font-black fill-muted-foreground uppercase tracking-widest opacity-80"
            >
              Demanding &amp; Linear
            </text>

            {/* Axis Direction Indicators */}
            <text
              x="375"
              y="195"
              textAnchor="end"
              className="text-[7px] font-bold fill-muted-foreground uppercase tracking-wider"
            >
              Demanding &rarr;
            </text>
            <text
              x="25"
              y="195"
              textAnchor="start"
              className="text-[7px] font-bold fill-muted-foreground uppercase tracking-wider"
            >
              &larr; Cozy
            </text>
            <text
              x="190"
              y="25"
              textAnchor="end"
              className="text-[7px] font-bold fill-muted-foreground uppercase tracking-wider"
            >
              Systems &uarr;
            </text>
            <text
              x="190"
              y="380"
              textAnchor="end"
              className="text-[7px] font-bold fill-muted-foreground uppercase tracking-wider"
            >
              Story &darr;
            </text>

            {/* Plot Nodes */}
            {nodes.map((node) => {
              const cx = scaleX(node.x);
              const cy = scaleY(node.y);
              const isActive = activeNode?.game.gameId === node.game.gameId;

              let fillColor = "#6b7280";
              let strokeColor = "rgba(107, 114, 128, 0.4)";

              if (node.type === "liked") {
                fillColor = "#10b981"; // Positive green
                strokeColor = "rgba(16, 185, 129, 0.4)";
              } else if (node.type === "disliked") {
                fillColor = "#ef4444"; // Negative red
                strokeColor = "rgba(239, 68, 68, 0.4)";
              } else if (node.type === "pending") {
                fillColor = "#9ca3af"; // Gray
                strokeColor = "rgba(156, 163, 175, 0.4)";
              }

              return (
                // biome-ignore lint/a11y/useSemanticElements: SVG groups cannot be semantic HTML buttons
                <g
                  key={node.game.gameId}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.game.title} - ${node.type}`}
                  className="cursor-pointer group focus:outline-none"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveNode((prev) => (prev?.game.gameId === node.game.gameId ? null : node));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setActiveNode((prev) =>
                        prev?.game.gameId === node.game.gameId ? null : node,
                      );
                    }
                  }}
                >
                  {/* Outer glow circle */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isActive ? 12 : 8}
                    fill={strokeColor}
                    className={cn(
                      "transition-all duration-300 ease-out",
                      isActive
                        ? "opacity-100"
                        : "opacity-30 group-hover:opacity-75 group-focus:opacity-75",
                    )}
                  />
                  {/* Inner solid circle */}
                  <circle
                    cx={cx}
                    cy={cy}
                    r={isActive ? 5.5 : 4.5}
                    fill={fillColor}
                    stroke="#ffffff"
                    strokeWidth="1.2"
                    className="transition-all duration-300"
                  />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Horizontal Navigation Carousel Area */}
        {nodes.length > 0 && (
          <div className="relative w-full border-t border-border/40 bg-card">
            {/* Left Nav Arrow */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={goToPreviousNode}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 size-8 rounded-full border border-border bg-background/80 hover:bg-background/100 shadow-sm transition-all"
              aria-label="Previous preference card"
            >
              <ChevronLeft className="size-4 text-foreground" />
            </Button>

            {/* Carousel Container */}
            <div
              ref={carouselRef}
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory scroll-smooth px-12 py-4 scrollbar-none"
            >
              {nodes.map((node) => {
                const isActive = activeNode?.game.gameId === node.game.gameId;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: interactive panel list item
                  <div
                    id={`map-card-${node.game.gameId}`}
                    key={node.game.gameId}
                    role="button"
                    tabIndex={0}
                    className={cn(
                      "w-72 shrink-0 snap-center rounded-2xl border p-3 text-left transition-all duration-200 cursor-pointer flex flex-col justify-between gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring select-none",
                      isActive
                        ? "border-accent bg-accent/5 ring-1 ring-accent/30 shadow-md"
                        : "border-border bg-card hover:bg-secondary/40",
                    )}
                    onClick={() => setActiveNode(node)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActiveNode(node);
                      }
                    }}
                  >
                    <div className="flex gap-3 min-w-0">
                      <CoverArt
                        game={node.game}
                        className="aspect-[2/3] w-12 rounded-lg border border-border/40 shrink-0 shadow-sm"
                      />
                      <div className="min-w-0 flex-1 grid gap-0.5">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[9px] font-black uppercase tracking-wider text-accent truncate">
                            {node.game.primaryGenre}
                          </span>
                          {node.type === "pending" ? (
                            <Badge
                              variant="secondary"
                              className="text-[8px] px-1.5 font-bold uppercase tracking-wider scale-90 origin-right"
                            >
                              Saved
                            </Badge>
                          ) : (
                            <Badge
                              variant={node.type === "liked" ? "positive" : "negative"}
                              className="text-[8px] px-1.5 font-bold uppercase tracking-wider scale-90 origin-right"
                            >
                              {node.type === "liked" ? "Liked" : "Avoided"}
                            </Badge>
                          )}
                        </div>
                        <h4 className="text-sm font-black leading-tight text-foreground truncate mt-0.5">
                          {node.game.title}
                        </h4>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {node.game.tags.slice(0, 2).map((t) => (
                            <span
                              key={t}
                              className="text-[8px] font-mono bg-secondary/80 border border-border/40 px-1 py-0.2 rounded text-muted-foreground"
                            >
                              {t.replace("_", " ")}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-border/40 pt-2 mt-1 shrink-0">
                      <span className="text-[9.5px] font-semibold text-muted-foreground">
                        {node.type === "liked"
                          ? "Liked/Playing"
                          : node.type === "disliked"
                            ? "Avoided/Dropped"
                            : "In Pick List"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-7 px-2.5 rounded-lg text-xs font-bold text-accent hover:text-accent hover:bg-accent/10"
                      >
                        <Link href={`/play/game/${node.game.gameId}`}>
                          See Details
                          <ChevronRight className="size-3 ml-0.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Nav Arrow */}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={goToNextNode}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 size-8 rounded-full border border-border bg-background/80 hover:bg-background/100 shadow-sm transition-all"
              aria-label="Next preference card"
            >
              <ChevronRight className="size-4 text-foreground" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
