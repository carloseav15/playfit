import type { ProductOnboardingDraft } from "@playfit/core/types";
import { cn } from "@/lib/utils";

export function OnboardingProgress({
  draft,
  step,
}: {
  draft: ProductOnboardingDraft;
  step: number;
}) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { id: 1, label: "Platforms", count: `${draft.platforms.length} selected` },
          {
            id: 2,
            label: "Loved Games",
            count: `${Math.min(draft.likedGameIds.length, 3)}/3`,
          },
          {
            id: 3,
            label: "Missed Game",
            count: `${Math.min(draft.dislikedGameIds.length, 1)}/1`,
          },
        ].map((s) => {
          const isCompleted = step > s.id;
          const isActive = step === s.id;
          return (
            <div key={s.id} className="grid gap-1.5">
              <div className="h-1 rounded-full overflow-hidden bg-white/5 relative">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    isCompleted
                      ? "bg-positive"
                      : isActive
                        ? "bg-gradient-to-r from-accent to-pink-500 animate-pulse"
                        : "bg-transparent",
                  )}
                  style={{ width: isCompleted || isActive ? "100%" : "0%" }}
                />
              </div>
              <div className="flex flex-col text-center sm:text-left sm:flex-row sm:justify-between gap-0.5 px-0.5">
                <span
                  className={cn(
                    "text-[11px] sm:text-xs font-black uppercase tracking-wider transition-colors",
                    isActive
                      ? "text-accent"
                      : isCompleted
                        ? "text-positive"
                        : "text-muted-foreground/40",
                  )}
                >
                  {s.label}
                </span>
                <span className="text-[10px] sm:text-xs font-mono text-muted-foreground/60">
                  {s.count}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
