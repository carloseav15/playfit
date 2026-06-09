import { ArrowRight, Brain, Compass, Database, ShieldCheck, Sparkles } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Playfit | Game decisions you can trust",
  description:
    "Playfit turns your library into calm, honest reads for what to play, skip, or come back to.",
};

const outputs = [
  {
    label: "Now playing",
    title: "Your current game",
    copy: "Keeps active games visible without turning your library into noise.",
  },
  {
    label: "Best match",
    title: "Your next play",
    copy: "Surfaces the clearest read when Playfit has enough evidence.",
  },
  {
    label: "Watch-outs",
    title: "Know the caveats",
    copy: "Shows what could get in the way before you commit time.",
  },
];

const stack = [
  {
    icon: Brain,
    title: "Clear reads, no black box",
    copy: "See why a game might work, what could get in the way, and how confident Playfit is.",
  },
  {
    icon: Database,
    title: "Saved to your account",
    copy: "Your ratings, library, and setup sync to your account so the app survives a reload.",
  },
  {
    icon: ShieldCheck,
    title: "Evidence over certainty",
    copy: "Early reads stay cautious. Stronger language appears only after enough ratings.",
  },
];

const screenshots = [
  {
    src: "/screenshots/dashboard.jpg",
    alt: "Playfit dashboard with current run and recommendation cards",
    title: "Decision dashboard",
  },
  {
    src: "/screenshots/onboarding.jpg",
    alt: "Playfit onboarding platform step",
    title: "Cold-start onboarding",
  },
  {
    src: "/screenshots/dossier.jpg",
    alt: "Playfit game dossier with match and watch-out signals",
    title: "Inspectable dossier",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-x-hidden">
      <header className="sticky top-0 z-40 border-b border-border bg-background/82 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 w-[min(1180px,calc(100%-2rem))] items-center justify-between gap-5">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <span className="size-3 rounded-full bg-accent shadow-[0_0_0_7px_color-mix(in_srgb,var(--accent),transparent_86%)]" />
            <span className="grid leading-tight">
              <strong className="font-display text-base">Playfit</strong>
              <span className="text-sm text-muted-foreground">Game decisions you can trust</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-semibold text-muted-foreground md:flex">
            <a href="#problem">Problem</a>
            <a href="#product">Product</a>
            <a href="#proof">Proof</a>
            <Link href="/how-it-works">How it works</Link>
          </nav>
          <Button asChild size="sm">
            <Link href="/app">Open app</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto grid w-[min(1180px,calc(100%-2rem))] gap-12 py-16 lg:grid-cols-[1.08fr_0.92fr] lg:py-24">
        <div className="grid content-start gap-7">
          <Badge variant="outline" className="border-muted-foreground/30 text-muted-foreground">
            Recommendations built for you
          </Badge>
          <div className="grid gap-5">
            <h1 className="max-w-4xl text-balance font-display text-4xl font-black leading-[0.96] tracking-tight md:text-6xl">
              Know your next game before you start it.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground md:text-xl">
              Playfit turns your library, ratings, and platforms into calm, honest reads for what to
              start, resume, watch, or skip.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/app">
                Open Playfit <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/how-it-works">How it works</Link>
            </Button>
          </div>
          <div className="grid gap-4 pt-6 md:grid-cols-3">
            {outputs.map((item) => (
              <Card key={item.label} className="bg-card/70">
                <CardHeader>
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                    {item.label}
                  </p>
                  <CardTitle>{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{item.copy}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <aside className="grid gap-5">
          <div className="relative min-h-[520px] overflow-hidden">
            <Image
              className="absolute left-0 top-0 w-[68%] rounded-xl border border-border object-cover shadow-2xl"
              src="/covers/games/kingdom_hearts_iii.jpg"
              alt="Kingdom Hearts III cover"
              width={556}
              height={720}
              priority
            />
            <Image
              className="absolute right-0 top-12 w-[42%] rotate-6 rounded-xl border border-border object-cover shadow-2xl"
              src="/covers/games/chrono_trigger.jpg"
              alt="Chrono Trigger cover"
              width={330}
              height={460}
              loading="eager"
            />
            <Image
              className="absolute bottom-0 left-[34%] w-[40%] -rotate-6 rounded-xl border border-border object-cover shadow-2xl"
              src="/covers/games/bayonetta_3.jpg"
              alt="Bayonetta 3 cover"
              width={316}
              height={440}
              loading="eager"
            />
          </div>
          <Card className="bg-card/78">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-muted-foreground" />
                Not every acclaimed game is your game.
              </CardTitle>
              <CardDescription>
                Playfit treats that as a decision problem, not a popularity contest.
              </CardDescription>
            </CardHeader>
          </Card>
        </aside>
      </section>

      <section id="problem" className="scroll-mt-24 border-y border-border bg-muted py-16">
        <div className="mx-auto grid w-[min(1180px,calc(100%-2rem))] gap-8 md:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              Problem
            </p>
            <h2 className="font-display text-3xl font-extrabold tracking-tight">
              Players choose by prestige, then lose time forcing the wrong fit.
            </h2>
          </div>
          <div className="grid gap-4 text-muted-foreground">
            <p>
              Popularity, review scores, and critical acclaim help discovery. They are weaker at
              answering whether a specific player will enjoy and finish a specific game.
            </p>
            <p>
              Playfit models that as a product problem: reduce wasted time by making match,
              watch-outs, and confidence inspectable.
            </p>
          </div>
        </div>
      </section>

      <section
        id="product"
        className="scroll-mt-24 mx-auto grid w-[min(1180px,calc(100%-2rem))] gap-6 py-16 md:grid-cols-3"
      >
        {stack.map((item) => (
          <Card key={item.title}>
            <CardHeader>
              <item.icon className="size-6 text-accent" />
              <CardTitle>{item.title}</CardTitle>
              <CardDescription>{item.copy}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section id="proof" className="mx-auto grid w-[min(1180px,calc(100%-2rem))] gap-6 pb-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
              What you get
            </p>
            <h2 className="font-display text-3xl font-extrabold tracking-tight">
              Helps you decide what to play next, not just browse.
            </h2>
          </div>
          <Button asChild variant="secondary">
            <Link href="/app">
              Try the app <Compass className="size-4" />
            </Link>
          </Button>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {screenshots.map((shot) => (
            <Card key={shot.src} className="overflow-hidden">
              <Image
                src={shot.src}
                alt={shot.alt}
                width={1440}
                height={900}
                className="aspect-[16/10] object-cover"
              />
              <CardHeader>
                <CardTitle>{shot.title}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex w-[min(1180px,calc(100%-2rem))] flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>Playfit · Game decisions you can trust.</span>
          <nav className="flex flex-wrap gap-4">
            <Link href="/how-it-works" className="hover:text-foreground transition-colors">
              How it works
            </Link>
            <Link href="/legal/privacy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link href="/legal/terms" className="hover:text-foreground transition-colors">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
