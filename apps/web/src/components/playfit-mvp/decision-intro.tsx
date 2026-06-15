import { CircleAlert, Gauge, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function DecisionIntro() {
  return (
    <section className="grid gap-5 overflow-hidden rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm md:grid-cols-[minmax(0,1fr)_minmax(260px,340px)] md:items-center">
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Badge variant="info">Playfit</Badge>
          <h1 className="font-display text-4xl font-extrabold leading-tight">
            Find what to play next
          </h1>
          <p className="max-w-prose text-sm leading-6 text-muted-foreground">
            Pick your platforms, 3 games you loved, and 1 that missed. Get one clear next pick.
          </p>
        </div>
        <Button type="button" className="w-fit" asChild>
          <a href="#tune-your-taste">Tune my taste</a>
        </Button>
      </div>
      <div className="grid gap-3 rounded-md border border-border bg-secondary p-4">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="positive">Play Next preview</Badge>
          <Badge variant="outline">High confidence</Badge>
        </div>
        <div className="grid gap-2">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Preview
          </p>
          <div className="grid gap-2">
            <div className="flex items-center gap-2 rounded-md bg-card px-3 py-2 text-sm">
              <Sparkles className="size-4 text-positive" />
              Why it fits your taste
            </div>
            <div className="flex items-center gap-2 rounded-md bg-card px-3 py-2 text-sm">
              <CircleAlert className="size-4 text-warning" />
              Watch-outs before you commit
            </div>
            <div className="flex items-center gap-2 rounded-md bg-card px-3 py-2 text-sm">
              <Gauge className="size-4 text-accent" />
              Confidence based on your signals
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
