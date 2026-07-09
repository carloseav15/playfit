"use client";

import type { SeedGame } from "@playfit/core/types";
import { Compass, LogIn, Sparkles } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CoverArt } from "../playfit/cover-art";

const MOCK_GAMES = [
  {
    title: "Hollow Knight",
    primaryGenre: "Action-Adventure • Metroidvania",
    description: "Atmospheric adventure through a ruined kingdom of insects.",
    vibeFit: 94,
    cautionRisk: 35,
    whyMatches: "Matches atmospheric tag",
    watchOut: "High difficulty curve",
    confidence: "High",
  },
  {
    title: "Hades",
    primaryGenre: "Action • Roguelike",
    description: "Defy the god of the dead in a hack-and-slash underworld escape.",
    vibeFit: 96,
    cautionRisk: 25,
    whyMatches: "High action affinity",
    watchOut: "Repetitive run loops",
    confidence: "High",
  },
  {
    title: "Metroid Dread",
    primaryGenre: "Action • Platformer",
    description: "Confront a mysterious mechanical threat on planet ZDR.",
    vibeFit: 91,
    cautionRisk: 40,
    whyMatches: "Matches platformer bias",
    watchOut: "Intense stalker chases",
    confidence: "Medium",
  },
  {
    title: "Outer Wilds",
    primaryGenre: "Adventure • Exploration",
    description: "Solve a space exploration mystery in a 22-minute time loop.",
    vibeFit: 95,
    cautionRisk: 15,
    whyMatches: "Matches discovery tag",
    watchOut: "No combat/action",
    confidence: "High",
  },
];

export function DecisionIntro({
  onStart,
  onSignIn,
}: {
  onStart?: () => void;
  onSignIn?: () => void;
}) {
  const [realGame, setRealGame] = useState<SeedGame | null>(null);
  const [hasError, setHasError] = useState(false);
  const mock = MOCK_GAMES[1]; // Use Hades deterministically to prevent hydration mismatch and visual flicker

  useEffect(() => {
    // Fetch from backend search API to get the real cover path!
    fetch(`/api/games?q=${encodeURIComponent(mock.title)}`)
      .then((res) => {
        if (!res.ok) throw new Error("API failed");
        return res.json();
      })
      .then((data) => {
        if (data && Array.isArray(data.games) && data.games.length > 0) {
          const found =
            data.games.find((g: SeedGame) => g.title.toLowerCase() === mock.title.toLowerCase()) ||
            data.games[0];
          setRealGame(found);
        }
      })
      .catch((err) => {
        console.error("Mock fetch failed", err);
        setHasError(true);
      });
  }, []);

  const mockGame = {
    gameId: `mock-${mock.title.toLowerCase().replace(/\s+/g, "-")}`,
    title: mock.title,
    aliases: [],
    series: "",
    source: "rawg",
    primaryGenre: mock.primaryGenre.split(" • ")[1] || mock.primaryGenre,
    genreId: "action_adventure",
    tags: [],
    notes: "",
    coverPath: "",
    externalCoverUrl: "",
    availablePlatformIds: [],
    availablePlatformNames: [],
    releaseState: "released",
  } as unknown as SeedGame;

  return (
    <section className="relative overflow-hidden rounded-3xl border border-border bg-card p-5 sm:p-8 md:p-12 text-card-foreground shadow-lg grid grid-cols-1 gap-8 md:grid-cols-[minmax(0,1.15fr)_minmax(290px,0.85fr)] md:gap-10">
      {/* Decorative Glow Elements */}
      <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-accent/20 blur-[120px]" />
      <div className="pointer-events-none absolute -left-20 -bottom-20 size-80 rounded-full bg-positive/10 blur-[100px]" />

      <div className="relative z-10 flex flex-col justify-between gap-6">
        <div className="grid gap-5">
          <div className="flex items-center gap-3">
            <div className="relative size-12 rounded-2xl overflow-hidden shadow-md border border-border/50 shrink-0 bg-secondary/50">
              <Image
                src="/playfit_logo_light.png"
                alt="Playfit Brand Logo"
                fill
                sizes="48px"
                className="object-cover dark:hidden"
              />
              <Image
                src="/playfit_logo_dark.png"
                alt="Playfit Brand Logo"
                fill
                sizes="48px"
                className="hidden object-cover dark:block"
              />
            </div>
            <span className="text-xs font-black uppercase tracking-[0.2em] text-accent font-mono">
              Playfit
            </span>
          </div>
          <h1 className="max-w-xl font-display text-4xl sm:text-5xl md:text-6xl font-black leading-[0.95] tracking-tight text-foreground">
            Your next game,{" "}
            <span className="bg-gradient-to-r from-accent to-pink-500 bg-clip-text text-transparent">
              curated.
            </span>
          </h1>
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground sm:text-base">
            Select your platforms, three favorites, and one notable miss. Get one clear
            recommendation with its complete decision analysis.
          </p>
          <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
            Zero noise. Zero decision fatigue.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full">
          <Button
            type="button"
            className="w-full sm:w-fit bg-accent text-white dark:bg-gradient-to-r dark:from-accent dark:to-accent/75 font-extrabold shadow-[0_4px_14px_rgba(15,118,110,0.2)] dark:shadow-[0_0_20px_rgba(255,106,61,0.25)] hover:shadow-[0_6px_20px_rgba(15,118,110,0.3)] dark:hover:shadow-[0_0_25px_rgba(255,106,61,0.4)] transition-all duration-300 scale-100 hover:scale-[1.02] active:scale-[0.98]"
            onClick={onStart}
          >
            <Compass className="size-4 mr-2" />
            Find What to Play
          </Button>
          {onSignIn && (
            <Button
              type="button"
              variant="outline"
              className="w-full sm:w-fit font-bold border-border bg-secondary/10 hover:bg-secondary/40 active:scale-[0.98] transition-all"
              onClick={onSignIn}
            >
              <LogIn className="size-4 mr-2 text-accent" />
              Sign In
            </Button>
          )}
        </div>
      </div>

      <aside
        aria-labelledby="preview-curation-title"
        className="relative z-10 rounded-3xl border border-border bg-card p-4 sm:p-6 shadow-lg flex flex-col justify-between overflow-hidden group"
      >
        {/* Glowing aura inside card */}
        <div className="pointer-events-none absolute -right-12 -top-12 size-32 rounded-full bg-accent/20 blur-2xl group-hover:scale-110 transition-transform duration-500" />

        <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
          <span
            id="preview-curation-title"
            className="text-[10px] font-black uppercase tracking-[0.15em] text-accent flex items-center gap-1.5"
          >
            <Sparkles className="size-3.5 animate-pulse" />
            Playfit Curation Preview
          </span>
          <Badge
            variant="outline"
            className="border-accent/30 text-accent font-bold px-2 py-0.5 text-[10px] bg-accent/5"
          >
            {mock.vibeFit}% Vibe Fit
          </Badge>
        </div>

        <div className="grid grid-cols-[72px_1fr] gap-4 py-5">
          <div className="relative shrink-0">
            <CoverArt
              game={realGame || mockGame}
              className="aspect-[2/3] w-18 rounded-sm shadow-md border border-border/50 bg-secondary/30"
            />
            {hasError && (
              <span className="absolute -bottom-1 -left-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-white shadow-sm" title="Cover artwork fallback active">
                !
              </span>
            )}
          </div>
          <div className="flex flex-col justify-center min-w-0">
            <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
              {mock.primaryGenre}
            </span>
            <h2
              id="mock-game-title"
              className="font-display text-lg font-black text-foreground mt-0.5 truncate"
            >
              {mock.title}
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1.5 line-clamp-2">
              {mock.description}
            </p>
          </div>
        </div>

        <div className="grid gap-2.5 pt-3 border-t border-border/60 text-[11px]">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-positive" />
              Why it matches
            </span>
            <span className="font-semibold text-foreground text-right truncate max-w-[150px]">
              {mock.whyMatches}
            </span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-warning" />
              Watch-outs
            </span>
            <span className="font-semibold text-foreground text-right truncate max-w-[150px]">
              {mock.watchOut}
            </span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-accent" />
              Confidence
            </span>
            <Badge variant="secondary" className="text-[9px] font-bold py-0 px-1.5 bg-secondary/50">
              {mock.confidence}
            </Badge>
          </div>
        </div>
      </aside>
    </section>
  );
}
