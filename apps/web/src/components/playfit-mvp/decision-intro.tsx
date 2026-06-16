import { CircleAlert, Gauge, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function DecisionIntro({ onStart }: { onStart?: () => void }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-[radial-gradient(circle_at_top_right,rgba(94,128,255,0.14),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03),transparent_30%)] p-6 text-card-foreground shadow-sm md:grid md:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] md:gap-6 md:p-8">
      <div className="grid gap-5">
        <div className="grid gap-3">
          <Badge variant="outline" className="w-fit">
            Public portfolio demo
          </Badge>
          <h1 className="max-w-xl font-display text-5xl font-black leading-[0.95] tracking-tight md:text-6xl">
            Find what to play next
          </h1>
          <p className="max-w-prose text-base leading-7 text-muted-foreground md:text-lg">
            Pick your platforms, 3 games you loved, and 1 that missed. Get one clear next pick,
            understand why, and correct it fast.
          </p>
          <p className="max-w-prose text-sm leading-6 text-muted-foreground">
            The interface is intentionally narrow: it shows one decision, the reasons behind it, and
            a direct correction path.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button" className="w-fit" onClick={onStart}>
            Tune my taste
          </Button>
          <Badge variant="info" className="w-fit">
            Playfit decision assistant
          </Badge>
        </div>
      </div>
      <div className="grid gap-3 rounded-2xl border border-border bg-card/90 p-4 backdrop-blur-sm md:p-5">
        <div className="flex items-center justify-between gap-3">
          <Badge variant="positive">Play Next preview</Badge>
          <Badge variant="outline">High confidence</Badge>
        </div>
        <div className="grid gap-3">
          <div className="grid gap-2 rounded-xl border border-border bg-secondary p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Sparkles className="size-4 text-positive" />
              Why it fits your taste
            </div>
            <p className="text-sm text-muted-foreground">
              Playfit uses your platforms, loved games, and misses to make the first read.
            </p>
          </div>
          <div className="grid gap-2 rounded-xl border border-border bg-secondary p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <CircleAlert className="size-4 text-warning" />
              Watch-outs before you commit
            </div>
            <p className="text-sm text-muted-foreground">
              Every recommendation keeps a visible reason and a correction path.
            </p>
          </div>
          <div className="grid gap-2 rounded-xl border border-border bg-secondary p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-foreground">
              <Gauge className="size-4 text-accent" />
              Confidence based on your signals
            </div>
            <p className="text-sm text-muted-foreground">
              The read gets steadier as calibration and history accumulate.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
