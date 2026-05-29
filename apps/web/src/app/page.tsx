import { ArrowRight, Brain, Compass, Database, ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const outputs = [
  {
    label: "Current run",
    title: "Keep momentum visible",
    copy: "The active game stays in focus instead of getting buried under endless new suggestions.",
  },
  {
    label: "Next up",
    title: "Choose a safer next play",
    copy: "Surface stronger-fit options before you lose time on the wrong kind of recommendation.",
  },
  {
    label: "Avoid for now",
    title: "Spot false fits early",
    copy: "Flag games that look attractive on paper but are likely to stall in practice.",
  },
];

const stack = [
  {
    icon: Brain,
    title: "Explainable scoring",
    copy: "Affinity, friction, confidence, and access are separated instead of hidden in one opaque score.",
  },
  {
    icon: Database,
    title: "Local-first state",
    copy: "Seed data loads from public CSVs; user profile and ratings persist in IndexedDB.",
  },
  {
    icon: ShieldCheck,
    title: "Human truth first",
    copy: "AI is positioned as enrichment later, not the source of preference truth.",
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
    alt: "Playfit game dossier with fit and friction signals",
    title: "Inspectable dossier",
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/82 backdrop-blur-xl">
        <div className="mx-auto flex min-h-20 w-[min(1180px,calc(100%-2rem))] items-center justify-between gap-5">
          <Link href="/" className="flex items-center gap-3 no-underline">
            <span className="size-3 rounded-full bg-accent shadow-[0_0_0_7px_color-mix(in_srgb,var(--accent),transparent_86%)]" />
            <span className="grid leading-tight">
              <strong className="font-display text-base">Playfit</strong>
              <span className="text-sm text-muted-foreground">Find your next game</span>
            </span>
          </Link>
          <nav className="hidden items-center gap-5 text-sm font-semibold text-muted-foreground md:flex">
            <a href="#problem">Problem</a>
            <a href="#product">Product</a>
            <a href="#proof">Proof</a>
            <Link href="/case-study">Case study</Link>
          </nav>
          <Button asChild size="sm">
            <Link href="/app">Open app</Link>
          </Button>
        </div>
      </header>

      <section className="mx-auto grid w-[min(1180px,calc(100%-2rem))] gap-12 py-16 lg:grid-cols-[1.08fr_0.92fr] lg:py-24">
        <div className="grid content-start gap-7">
          <Badge
            variant="outline"
            className="border-[color-mix(in_srgb,var(--ink),transparent_70%)] text-[var(--ink)]"
          >
            Local-first recommendation product
          </Badge>
          <div className="grid gap-5">
            <h1 className="max-w-4xl text-balance font-display text-5xl font-black leading-[0.96] tracking-tight md:text-7xl">
              Find games that actually fit you.
            </h1>
            <p className="max-w-2xl text-lg text-muted-foreground md:text-xl">
              Playfit recommends what to continue, start, resume, or avoid based on personal taste
              and follow-through, not popularity or hype.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/app">
                Open Playfit <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/case-study">Read case study</Link>
            </Button>
          </div>
          <div className="grid gap-4 pt-6 md:grid-cols-3">
            {outputs.map((item) => (
              <Card key={item.label} className="bg-card/70">
                <CardHeader>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
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
          <div className="relative min-h-[520px]">
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
            />
            <Image
              className="absolute bottom-0 left-[34%] w-[40%] -rotate-6 rounded-xl border border-border object-cover shadow-2xl"
              src="/covers/games/bayonetta_3.jpg"
              alt="Bayonetta 3 cover"
              width={316}
              height={440}
            />
          </div>
          <Card className="bg-card/78">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="size-5 text-[var(--ink)]" />
                Not every acclaimed game is your game.
              </CardTitle>
              <CardDescription>
                The product turns that idea into a working decision system with explainable outputs.
              </CardDescription>
            </CardHeader>
          </Card>
        </aside>
      </section>

      <section id="problem" className="border-y border-border bg-white/30 py-16">
        <div className="mx-auto grid w-[min(1180px,calc(100%-2rem))] gap-8 md:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--ink)]">
              Problem
            </p>
            <h2 className="font-display text-4xl font-black tracking-tight">
              Players choose by prestige, then lose time forcing the wrong fit.
            </h2>
          </div>
          <div className="grid gap-4 text-muted-foreground">
            <p>
              Popularity, review scores, and critical acclaim help discovery. They are weaker at
              answering whether a specific player will enjoy and finish a specific game.
            </p>
            <p>
              Playfit models that as a product problem: reduce wasted time by making fit, friction,
              and confidence inspectable.
            </p>
          </div>
        </div>
      </section>

      <section
        id="product"
        className="mx-auto grid w-[min(1180px,calc(100%-2rem))] gap-6 py-16 md:grid-cols-3"
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
            <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-[var(--ink)]">
              Product surfaces
            </p>
            <h2 className="font-display text-4xl font-black tracking-tight">
              A portfolio piece that behaves like a product.
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
          <span>Playfit · Next.js, React, TypeScript, Tailwind, shadcn/ui</span>
          <span>Local-first. Explainable. Portfolio-ready.</span>
        </div>
      </footer>
    </main>
  );
}
