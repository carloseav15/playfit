"use client";

import type { ProductDecisionFeedback } from "@playfit/core/types";
import { Heart, ThumbsDown, ThumbsUp, Waves } from "lucide-react";
import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

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
      mobileSheet
    >
      <div id={id} className="grid gap-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-0">
        <p className="text-xs text-muted-foreground leading-relaxed">
          Your answer improves future picks.
        </p>
        <div className="grid grid-cols-2 gap-3 pt-1">
          {options.map(({ feedback, label, Icon }) => (
            <Button
              key={feedback}
              type="button"
              variant="outline"
              onClick={() => {
                onSelect(feedback);
                onClose();
              }}
              className="min-h-24 flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-border/50 bg-secondary/30 p-4 text-foreground transition-all duration-300 hover:border-accent/20 hover:bg-accent/10 active:scale-[0.97]"
            >
              <Icon className="size-6 text-accent" />
              <span className="text-[11px] font-black uppercase tracking-wider">{label}</span>
            </Button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
