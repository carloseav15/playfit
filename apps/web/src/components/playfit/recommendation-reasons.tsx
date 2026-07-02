import { cn } from "@/lib/utils";

const emptyCautionLabels = new Set([
  "No reliable call yet.",
  "No major watch-out yet.",
  "No major caveat yet.",
]);

const toneClass = {
  accent: "text-accent",
  positive: "text-accent",
  warning: "text-warning",
  muted: "text-muted-foreground",
};

const markerClass = {
  accent: "bg-accent animate-pulse",
  positive: "bg-positive animate-pulse",
  warning: "bg-warning animate-pulse",
  muted: "bg-current",
};

export function filterUsefulCautions(reasons: readonly string[] | null | undefined) {
  return (reasons ?? []).filter((reason) => {
    const normalizedReason = reason.trim();
    return normalizedReason.length > 0 && !emptyCautionLabels.has(normalizedReason);
  });
}

export function RecommendationReasonList({
  reasons,
  fallback,
  maxItems = 4,
  tone = "accent",
  className,
  itemClassName,
  markerClassName,
}: {
  reasons: readonly string[];
  fallback: string;
  maxItems?: number;
  tone?: keyof typeof toneClass;
  className?: string;
  itemClassName?: string;
  markerClassName?: string;
}) {
  const visibleReasons = reasons.length ? reasons : [fallback];

  return (
    <ul className={cn("grid gap-2 text-xs text-muted-foreground/80", className)}>
      {visibleReasons.slice(0, maxItems).map((reason) => (
        <li key={reason} className={cn("flex items-start gap-2", itemClassName)}>
          <span
            className={cn(
              "mt-1 size-1.5 shrink-0 rounded-full",
              markerClass[tone],
              markerClassName,
            )}
          />
          <span>{reason}</span>
        </li>
      ))}
    </ul>
  );
}

export function RecommendationReasons({
  title,
  reasons,
  fallback,
  tone = "accent",
  maxItems = 4,
  variant = "list",
  className,
  titleClassName,
}: {
  title: string;
  reasons: readonly string[];
  fallback: string;
  tone?: keyof typeof toneClass;
  maxItems?: number;
  variant?: "list" | "paragraph";
  className?: string;
  titleClassName?: string;
}) {
  const visibleReasons = reasons.length ? reasons : [fallback];

  return (
    <div className={cn("rounded-2xl border border-border/50 bg-secondary/30 p-4", className)}>
      <p
        className={cn(
          "mb-2 text-[10px] font-bold uppercase tracking-[0.12em]",
          toneClass[tone],
          titleClassName,
        )}
      >
        {title}
      </p>
      {variant === "paragraph" ? (
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{visibleReasons[0]}</p>
      ) : (
        <RecommendationReasonList
          reasons={visibleReasons}
          fallback={fallback}
          maxItems={maxItems}
          tone={tone}
        />
      )}
    </div>
  );
}
