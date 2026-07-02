"use client";

import type { ProductDecisionFeedback } from "@playfit/core/types";
import { Heart, ThumbsDown, ThumbsUp, Waves } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
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
  open,
  onClose,
  onSelect,
}: {
  id?: string;
  open: boolean;
  onClose: () => void;
  onSelect: (feedback: AlreadyPlayedFeedback) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="How did it land?"
      eyebrow="Already Played"
      className="max-w-md"
    >
      <div id={id} className="grid gap-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Let us know how your experience was. This helps refine your future recommendations.
        </p>
        <Stack direction="row" wrap gap={3} className="justify-between pt-2">
          {options.map(({ feedback, label, Icon }) => (
            <Button
              key={feedback}
              type="button"
              variant="outline"
              onClick={() => {
                onSelect(feedback);
                onClose();
              }}
              className="flex-1 flex flex-col items-center justify-center gap-2.5 p-5 h-24 rounded-2xl border border-border/50 bg-secondary/30 hover:bg-accent/10 hover:border-accent/20 text-foreground transition-all duration-300 active:scale-[0.97]"
            >
              <Icon className="size-6 text-accent" />
              <span className="text-[11px] font-black uppercase tracking-wider">{label}</span>
            </Button>
          ))}
        </Stack>
      </div>
    </Dialog>
  );
}
