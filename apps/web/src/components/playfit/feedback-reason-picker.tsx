import { Button } from "@/components/ui/button";
import { Stack } from "@/components/ui/stack";
import { cn } from "@/lib/utils";

const feedbackReasonOptions = ["Wrong mood", "Too long", "Too hard", "Not my genre"];

export function FeedbackReasonPicker({
  onSelect,
  className,
  labelClassName,
  buttonClassName,
}: {
  onSelect: (reason: string) => void;
  className?: string;
  labelClassName?: string;
  buttonClassName?: string;
}) {
  return (
    <div className={cn("grid gap-2 rounded-2xl border border-border bg-secondary p-4", className)}>
      <p
        className={cn(
          "text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground",
          labelClassName,
        )}
      >
        What got in the way?
      </p>
      <Stack direction="row" wrap gap={2}>
        {feedbackReasonOptions.map((reason) => (
          <Button
            key={reason}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelect(reason)}
            className={buttonClassName}
          >
            {reason}
          </Button>
        ))}
      </Stack>
    </div>
  );
}
