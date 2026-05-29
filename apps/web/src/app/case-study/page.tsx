import { ArrowLeft, Database, GitBranch, Radar, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Case Study",
  description:
    "How Playfit turns personal game taste and friction signals into explainable recommendations.",
};

const capabilities = [
  {
    icon: Database,
    title: "Structured data model",
    copy: "Catalog metadata, platform access, outcomes, ratings, and upcoming releases are modeled separately.",
  },
  {
    icon: GitBranch,
    title: "Explainable rules",
    copy: "The engine separates affinity, friction, access, and confidence instead of hiding everything behind one score.",
  },
  {
    icon: ShieldCheck,
    title: "Local-first storage",
    copy: "The public demo works without accounts or a backend; personal data stays in IndexedDB.",
  },
  {
    icon: Radar,
    title: "Future AI layer",
    copy: "AI is reserved for enrichment and onboarding, not for inventing user truth or product rules.",
  },
];

export default function CaseStudyPage() {
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
            Portfolio case study
          </Badge>
          <h1 className="text-balance font-display text-5xl font-black tracking-tight md:text-7xl">
            A recommendation product for personal fit, not public hype.
          </h1>
          <p className="max-w-3xl text-lg text-muted-foreground">
            Playfit started from a real decision problem: choosing games because they were
            acclaimed, then stalling because they did not match actual taste, pace, or play
            behavior.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {capabilities.map((item) => (
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
            <h2 className="font-display text-3xl font-black text-foreground">Product thesis</h2>
            <p>
              Good recommendation for games should optimize for personal affinity and likelihood of
              follow-through, not generic quality. The useful outputs are concrete: continue this,
              start this next, resume this later, avoid this for now.
            </p>
          </section>
          <section className="grid gap-3">
            <h2 className="font-display text-3xl font-black text-foreground">
              Technical direction
            </h2>
            <p>
              The portfolio version uses Next.js App Router, React, TypeScript, Tailwind, and
              shadcn/ui for fast industry recognition, while the core scoring engine remains
              framework-independent.
            </p>
          </section>
          <section className="grid gap-3">
            <h2 className="font-display text-3xl font-black text-foreground">Why it matters</h2>
            <p>
              The project demonstrates product framing, structured data, local-first persistence,
              explainable scoring, and a credible path toward AI-assisted enrichment without
              pretending the model is the source of truth.
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
