"use client";

import { Heart, Meh, Smile, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stack } from "@/components/ui/stack";

export function FeedbackBar({
  onLoved,
  onLiked,
  onMixed,
  onNotForMe,
}: {
  onLoved: () => void;
  onLiked: () => void;
  onMixed: () => void;
  onNotForMe: () => void;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
        How did it land?
      </p>
      <Stack direction="row" wrap gap={2}>
        <Button type="button" variant="secondary" size="sm" onClick={onLoved}>
          <Heart className="size-4" />
          Loved it
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onLiked}>
          <Smile className="size-4" />
          Liked it
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onMixed}>
          <Meh className="size-4" />
          Mixed
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onNotForMe}>
          <XCircle className="size-4" />
          Not for me
        </Button>
      </Stack>
    </div>
  );
}
