import { ArrowLeft, CalendarDays, Library, Sparkles, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "How It Works",
  description: "How Playfit learns your taste and recommends games that actually fit you.",
};

const steps = [
  {
    icon: Sparkles,
    title: "Pick your platforms and favorites",
    copy: "Tell Playfit what you play on and a few games you already love. That's all it needs to start building your profile.",
  },
  {
    icon: Star,
    title: "Rate as you play",
    copy: "Star ratings, play status, backlog, wishlist — every signal sharpens your recommendations.",
  },
  {
    icon: CalendarDays,
    title: "Get clear, honest picks",
    copy: "Current run, next up, resume, or watch out. Instead of one black-box score, you see exactly why a game fits or doesn't.",
  },
  {
    icon: Library,
    title: "Your data, your account",
    copy: "Your profile syncs to your account so you can pick up where you left off on any device.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto grid w-[min(980px,calc(100%-2rem))] gap-10 py-12 md:py-20">
        <Button asChild variant="ghost" className="w-fit">
          <Link href="/">
            <ArrowLeft className="size-4" />
            Back to Playfit
          </Link>
        </Button>

        <div className="grid gap-5">
          <Badge variant="outline" className="w-fit">
            How it works
          </Badge>
          <h1 className="text-balance font-display text-4xl font-black tracking-tight md:text-6xl">
            Game recommendations that actually fit you.
          </h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            Playfit learns your taste from the games you love, the ones you drop, and everything in
            between. No algorithms guessing for you.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {steps.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <item.icon className="size-6 text-accent" />
                <CardTitle>{item.title}</CardTitle>
                <CardDescription>{item.copy}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>

        <article className="grid gap-8 text-muted-foreground">
          <section className="grid gap-3">
            <h2 className="font-display text-3xl font-extrabold text-foreground">
              How scoring works
            </h2>
            <p>
              Playfit compares tags and genres across your library to figure out what clicks for
              you. Games that share traits with your favorites score higher. Traits from games you
              rated low add caution flags. Nothing is hidden behind a single number.
            </p>
          </section>
          <section className="grid gap-3">
            <h2 className="font-display text-3xl font-extrabold text-foreground">
              What you can do
            </h2>
            <p>
              Browse the full catalog, search upcoming releases, check your evolving taste profile,
              and see signals that explain every recommendation. Every action you take — a rating, a
              status change, a backlog add — makes the next pick smarter.
            </p>
          </section>
          <section className="grid gap-3">
            <h2 className="font-display text-3xl font-extrabold text-foreground">Why it matters</h2>
            <p>
              Good recommendations should tell you what to play, what to skip, and what to come back
              to — based on your actual taste, not what's popular. Playfit treats recommendation as
              a personal decision problem, not a popularity contest.
            </p>
          </section>
        </article>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/app">Open app</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">View landing</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
