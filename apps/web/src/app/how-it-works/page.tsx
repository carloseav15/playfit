import { ArrowLeft, CalendarDays, Library, Sparkles, Star } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "How It Works — Gaming Calibration Explained",
  description:
    "Learn how Playfit aggregates your platform preferences and game feedback to provide calm, honest recommendations.",
};

const steps = [
  {
    icon: Sparkles,
    title: "Pick your platforms and favorites",
    copy: "Tell Playfit what you can play on and a few games you already love. That creates the first read.",
  },
  {
    icon: Star,
    title: "Rate as you play",
    copy: "Star ratings, play status, backlog, and wishlist choices sharpen the evidence.",
  },
  {
    icon: CalendarDays,
    title: "Get calm, honest reads",
    copy: "Current run, best match, resume, or watch-out. You see the reason and confidence behind each read.",
  },
  {
    icon: Library,
    title: "Your data, your account",
    copy: "Your library and ratings sync to your account so the product keeps its memory.",
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
            Game decisions with evidence attached.
          </h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            Playfit learns from games you love, games you drop, and the systems you can actually
            play on. Early signals stay cautious until ratings make the pattern stronger.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {steps.map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <item.icon className="size-6 text-accent" />
                <CardTitle as="h2">{item.title}</CardTitle>
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
              rated low add watch-outs. Confidence depends on how much evidence exists.
            </p>
          </section>
          <section className="grid gap-3">
            <h2 className="font-display text-3xl font-extrabold text-foreground">
              What you can do
            </h2>
            <p>
              Search the catalog, track upcoming releases, check your evolving taste signals, and
              inspect recommendation details before saving it. Every rating or status change
              improves the next read.
            </p>
          </section>
          <section className="grid gap-3">
            <h2 className="font-display text-3xl font-extrabold text-foreground">Why it matters</h2>
            <p>
              A good game tool should help you decide what to play, what to skip, and what to come
              back to based on your evidence, not only on what is popular.
            </p>
          </section>
        </article>

        <div className="flex flex-wrap gap-3">
          <Button
            asChild
            className="!bg-accent !text-white hover:!bg-[#0b625b] dark:!text-slate-950"
          >
            <Link href="/">Open app</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
