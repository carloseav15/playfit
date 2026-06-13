"use client";

import type { ProductTodayModel } from "@playfit/core/types";
import { Gamepad2, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";

import { Carousel } from "./carousel";
import { CarouselCard } from "./carousel-card";
import { usePlayfit } from "./playfit-context";
import { recommendationGroupCopy, recommendationGroupTitle } from "./product-utils";
import { SectionHead } from "./section-head";

function TodaySkeleton() {
  return (
    <section>
      <SectionHead
        eyebrow="Today"
        title="Today's picks"
        copy="What you're playing, what's next, and what to pick back up."
      />
      <div className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card className="min-h-56">
            <CardHeader>
              <Skeleton className="mb-2 h-3 w-16" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-56" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
              <Skeleton className="mt-4 h-9 w-full" />
            </CardContent>
          </Card>
          <Card className="min-h-56">
            <CardHeader>
              <Skeleton className="mb-2 h-3 w-16" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-56" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
              <Skeleton className="mt-4 h-9 w-full" />
            </CardContent>
          </Card>
          <Card className="min-h-56">
            <CardHeader>
              <Skeleton className="mb-2 h-3 w-16" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="mt-1 h-4 w-56" />
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
                <Skeleton className="h-10" />
              </div>
              <Skeleton className="mt-4 h-9 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

export function TodaySection() {
  const { state, setUi } = usePlayfit();
  const [model, setModel] = useState<ProductTodayModel | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!state.user.profile) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchToday() {
      try {
        const res = await fetch("/api/recommendations/today", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profile: state.user.profile,
            gameStates: state.user.gameStates,
            onboarding: state.user.onboarding,
          }),
        });
        if (!cancelled && res.ok) {
          const data = (await res.json()) as ProductTodayModel;
          setModel(data);
        }
      } catch {
        // Silently fail
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchToday();
    return () => {
      cancelled = true;
    };
  }, [state.user.profile, state.user.gameStates, state.user.onboarding]);

  if (loading || !model) return <TodaySkeleton />;

  if (!state.user.onboardingCompletedAt) {
    return (
      <section>
        <SectionHead
          eyebrow="Today"
          title="Complete setup first"
          copy="Tell Playfit your platforms and a few favorites so it can start reading games for you."
        />
        <Button
          type="button"
          onClick={() => setUi((current) => ({ ...current, activeTab: "onboarding" }))}
        >
          Go to setup
        </Button>
      </section>
    );
  }

  const hasAnyContent =
    model.currentRun.length > 0 || model.nextUp.length > 0 || model.resume.length > 0;

  if (!hasAnyContent) {
    return (
      <section>
        <SectionHead
          eyebrow="Today"
          title="Your first reads are on the way"
          copy="Add games to your library and mark what you are playing. Playfit will surface the clearest reads here."
        />
        <Button
          type="button"
          onClick={() => setUi((current) => ({ ...current, activeTab: "finder" }))}
        >
          Browse games
        </Button>
      </section>
    );
  }

  return (
    <section>
      <SectionHead
        eyebrow="Today"
        title={model.nextUp.length > 0 ? recommendationGroupTitle(model.nextUp) : "Today"}
        copy={
          model.nextUp.length > 0
            ? recommendationGroupCopy(model.nextUp)
            : "What you are playing, what to resume, and what deserves a closer look."
        }
      />
      <div className="grid gap-8">
        {model.nextUp.length > 0 && (
          <section aria-labelledby="carousel-next-up" className="grid gap-3">
            <SectionLabel id="carousel-next-up" icon={<Sparkles className="size-3.5" />}>
              {recommendationGroupTitle(model.nextUp)}
            </SectionLabel>
            <Carousel>
              {model.nextUp.map((entry, i) => (
                <CarouselCard
                  key={entry.game.gameId}
                  game={entry.game}
                  entry={entry}
                  rank={i + 1}
                />
              ))}
            </Carousel>
          </section>
        )}
        {model.currentRun.length > 0 && (
          <section aria-labelledby="carousel-current-run" className="grid gap-3">
            <SectionLabel id="carousel-current-run" icon={<Gamepad2 className="size-3.5" />}>
              Current Run
            </SectionLabel>
            <Carousel>
              {model.currentRun.map((entry) => (
                <CarouselCard
                  key={entry.game.gameId}
                  game={entry.game}
                  entry={entry}
                  status="playing"
                />
              ))}
            </Carousel>
          </section>
        )}
        {model.resume.length > 0 && (
          <section aria-labelledby="carousel-resume" className="grid gap-3">
            <SectionLabel id="carousel-resume" icon={<RotateCcw className="size-3.5" />}>
              Resume
            </SectionLabel>
            <Carousel>
              {model.resume.map((entry) => (
                <CarouselCard
                  key={entry.game.gameId}
                  game={entry.game}
                  entry={entry}
                  status="on_hold"
                />
              ))}
            </Carousel>
          </section>
        )}
      </div>
    </section>
  );
}
