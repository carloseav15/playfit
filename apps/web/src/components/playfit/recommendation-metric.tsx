import { cn } from "@/lib/utils";

export function RecommendationMetric({
  label,
  value,
  detail,
  numericValue,
  colorClass = "bg-accent",
  interactive = false,
  className,
  labelClassName,
  valueClassName,
  detailClassName,
}: {
  label: string;
  value: string;
  detail?: string;
  numericValue?: number;
  colorClass?: string;
  interactive?: boolean;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
  detailClassName?: string;
}) {
  const meterValue =
    typeof numericValue === "number" ? Math.max(0, Math.min(100, numericValue)) : undefined;
  const ariaLabel = `${label}: ${value}${detail ? `, ${detail}` : ""}`;
  const accessibilityProps =
    meterValue != null
      ? {
          role: "meter",
          "aria-valuenow": meterValue,
          "aria-valuemin": 0,
          "aria-valuemax": 100,
          "aria-label": ariaLabel,
        }
      : {
          "aria-label": ariaLabel,
        };

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/50 bg-secondary/30 p-4",
        interactive && "transition-all duration-300 hover:border-border hover:bg-secondary/50",
        className,
      )}
      {...accessibilityProps}
    >
      <span
        className={cn(
          "block text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground",
          labelClassName,
        )}
      >
        {label}
      </span>
      <strong
        className={cn(
          "mt-1 block text-base font-extrabold leading-tight text-foreground",
          valueClassName,
        )}
      >
        {value}
      </strong>
      {detail ? (
        <span className={cn("mt-1 block text-xs text-muted-foreground/80", detailClassName)}>
          {detail}
        </span>
      ) : null}

      {meterValue != null ? (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/5 dark:bg-white/5">
          <div
            className={cn("h-full transition-all duration-500", colorClass)}
            style={{ width: `${meterValue}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
