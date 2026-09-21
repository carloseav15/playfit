import type { ProductTasteModel } from "@playfit/core/types";

export function TasteStats({ model }: { model: ProductTasteModel }) {
  return (
    <div className="grid grid-cols-3 gap-3.5">
      <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          Preferences
        </p>
        <strong className="mt-1 block font-mono text-2xl font-black text-foreground">
          {model.evidenceCount}
        </strong>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-positive">Liked</p>
        <strong className="mt-1 block font-mono text-2xl font-black text-positive">
          {model.positiveCount}
        </strong>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-negative">Avoided</p>
        <strong className="mt-1 block font-mono text-2xl font-black text-negative">
          {model.negativeCount}
        </strong>
      </div>
    </div>
  );
}
