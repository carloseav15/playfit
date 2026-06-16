"use client";

import type { ProductDecisionFeedback } from "@playfit/core/types";
import { Heart, ThumbsDown, ThumbsUp, Waves } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Stack } from "@/components/ui/stack";

export type AlreadyPlayedFeedback = Extract<
  ProductDecisionFeedback,
  "played_loved" | "played_liked" | "played_mixed" | "played_dropped"
>;

const options: {
  feedback: AlreadyPlayedFeedback;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { feedback: "played_loved", label: "Loved it", Icon: Heart },
  { feedback: "played_liked", label: "Liked it", Icon: ThumbsUp },
  { feedback: "played_mixed", label: "Mixed", Icon: Waves },
  { feedback: "played_dropped", label: "Dropped it", Icon: ThumbsDown },
];

export function AlreadyPlayedPanel({
  id,
  onSelect,
}: {
  id?: string;
  onSelect: (feedback: AlreadyPlayedFeedback) => void;
}) {
  return (
    <div id={id} className="grid gap-2 rounded-2xl border border-border bg-secondary p-4">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        How did it land?
      </p>
      <Stack direction="row" wrap gap={2}>
        {options.map(({ feedback, label, Icon }) => (
          <Button
            key={feedback}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSelect(feedback)}
          >
            <Icon className="size-4" />
            {label}
          </Button>
        ))}
      </Stack>
    </div>
  );
}
