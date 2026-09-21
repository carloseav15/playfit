import type { ProductTasteModel } from "@playfit/core/types";
import { Layers, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function TasteProfileSummary({
  model,
  className,
}: {
  model: ProductTasteModel;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden gap-4 rounded-3xl border border-border bg-card p-6 shadow-md md:grid-cols-[minmax(0,1.15fr)_minmax(250px,0.85fr)] md:items-end shrink-0",
        className,
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-accent/10 blur-xl" />
      <div className="grid gap-2 relative z-10">
        <div className="flex items-center gap-2 text-accent">
          <Layers className="size-4" />
          <span className="text-[10px] font-black uppercase tracking-[0.15em]">Gaming profile</span>
        </div>
        <p className="max-w-2xl text-xs text-muted-foreground leading-relaxed mt-0.5">
          What Playfit is learning from your active decisions. {model.confidenceLabel}.
        </p>
      </div>
      <div className="rounded-2xl border border-border/60 bg-secondary/50 p-4 relative z-10">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-accent flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" />
          Profile Summary
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {model.positiveCount > model.negativeCount
            ? "Playfit leans toward your favorites, but still needs more signals to sharpen the edge cases."
            : "Playfit is still balancing your likes and misses; a few more decisions will make the next pick steadier."}
        </p>
      </div>
    </section>
  );
}
