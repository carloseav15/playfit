"use client";

import type { RankedSeedGame } from "@playfit/core/types";
import { CheckCircle2, MoreVertical, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CoverArt } from "../../playfit/cover-art";
import { type AlreadyPlayedFeedback, AlreadyPlayedPanel } from "../already-played-panel";

interface PicksMobileProps {
  entry: RankedSeedGame;
  expandedId: string | null;
  onToggleAlreadyPlayed: () => void;
  onCloseAlreadyPlayed: () => void;
  onAlreadyPlayed: (gameId: string, feedback: AlreadyPlayedFeedback) => void;
  onNotForMe: (gameId: string) => void;
  onRemove: (gameId: string) => void;
}

function ManagePickDialog({
  open,
  onClose,
  title,
  onAlreadyPlayed,
  onNotForMe,
  onRemove,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  onAlreadyPlayed: () => void;
  onNotForMe: () => void;
  onRemove: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} eyebrow="Manage Pick" className="max-w-sm">
      <div className="grid gap-2 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onAlreadyPlayed();
            onClose();
          }}
          className="w-full h-12 rounded-xl text-xs font-bold justify-start px-4"
        >
          <CheckCircle2 className="size-4 mr-2.5 text-positive" />
          Already Played It
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onNotForMe();
            onClose();
          }}
          className="w-full h-auto py-2.5 rounded-xl justify-start px-4 hover:bg-destructive/10"
        >
          <XCircle className="size-4 mr-2.5 shrink-0 text-destructive" />
          <span className="grid text-left">
            <span className="text-xs font-bold">Not for me</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              Trains your taste profile
            </span>
          </span>
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            onRemove();
            onClose();
          }}
          className="w-full h-auto py-2.5 rounded-xl justify-start px-4"
        >
          <Trash2 className="size-4 mr-2.5 shrink-0" />
          <span className="grid text-left">
            <span className="text-xs font-bold">Remove Pick</span>
            <span className="text-[10px] font-normal text-muted-foreground">
              Just unpicks -- doesn't affect your taste
            </span>
          </span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onClose}
          className="w-full h-12 rounded-xl text-xs font-bold mt-2"
        >
          Cancel
        </Button>
      </div>
    </Dialog>
  );
}

export function PicksMobile({
  entry,
  expandedId,
  onToggleAlreadyPlayed,
  onCloseAlreadyPlayed,
  onAlreadyPlayed,
  onNotForMe,
  onRemove,
}: PicksMobileProps) {
  const gameId = entry.game.gameId;
  const alreadyPlayedPanelId = `pick-already-played-${gameId}`;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex items-center justify-between p-3 bg-card border border-border rounded-2xl hover:border-border/80 transition-all gap-3 w-full min-w-0">
      <Link href={`/game/${gameId}`} className="flex items-center gap-3 min-w-0 flex-1">
        <CoverArt
          game={entry.game}
          className="aspect-[3/4] w-12 rounded-lg shadow-sm border border-border/40 shrink-0"
        />
        <div className="min-w-0">
          <h3 className="font-display text-base font-black text-foreground truncate leading-tight">
            {entry.game.title}
          </h3>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] font-extrabold text-accent">
              {entry.affinityScore}% Match
            </span>
          </div>
        </div>
      </Link>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setMenuOpen(true)}
        className="size-10 rounded-full shrink-0 text-muted-foreground hover:text-foreground hover:bg-secondary/40"
        aria-label="Manage pick"
      >
        <MoreVertical className="size-5" />
      </Button>

      <ManagePickDialog
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={entry.game.title}
        onAlreadyPlayed={onToggleAlreadyPlayed}
        onNotForMe={() => onNotForMe(gameId)}
        onRemove={() => onRemove(gameId)}
      />

      <AlreadyPlayedPanel
        id={alreadyPlayedPanelId}
        open={expandedId === gameId}
        onClose={onCloseAlreadyPlayed}
        onSelect={(feedback) => onAlreadyPlayed(gameId, feedback)}
      />
    </div>
  );
}
