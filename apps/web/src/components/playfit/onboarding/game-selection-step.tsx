import type { ProductOnboardingDraft, SeedGame } from "@playfit/core/types";
import { ChevronRight, X } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CoverArt } from "../cover-art";
import type { SearchSlot } from "./onboarding-helpers";

export function LovedGamesStep({
  draft,
  getSeedGame,
  onBack,
  onContinue,
  onRemoveAnchor,
  onOpenSearch,
}: {
  draft: ProductOnboardingDraft;
  getSeedGame: (gameId: string) => SeedGame | null;
  onBack: () => void;
  onContinue: () => void;
  onRemoveAnchor: (gameId: string) => void;
  onOpenSearch: (slot: SearchSlot, replaceGameId: string | null) => void;
}) {
  return (
    <motion.div
      key="anchors"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="flex flex-col gap-6 flex-1 min-h-0"
    >
      <p className="text-sm text-muted-foreground/80 leading-relaxed">
        Select 3 games you loved. This establishes your taste baseline and platforms preferences.
      </p>
      <div className="grid grid-cols-3 gap-4 py-2">
        {[0, 1, 2].map((index) => {
          const gameId = draft.likedGameIds[index];
          const game = gameId ? getSeedGame(gameId) : null;

          return game ? (
            <SelectedGameCard
              key={game.gameId}
              accent="accent"
              game={game}
              label="Change Game"
              onChange={() => onOpenSearch("anchor", game.gameId)}
              onRemove={() => onRemoveAnchor(game.gameId)}
            />
          ) : (
            <EmptyGameSlot
              key={index}
              label={`Select ${index + 1}`}
              onClick={() => onOpenSearch("anchor", null)}
            />
          );
        })}
      </div>
      <div className="mt-auto sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-white/5 bg-card/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md md:relative md:m-0 md:border-t-0 md:bg-transparent md:p-0 md:pt-2 flex items-center justify-between">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          onClick={onContinue}
          className="ml-auto bg-accent text-accent-foreground font-extrabold hover:bg-accent/90"
        >
          {draft.likedGameIds.length === 0 ? "Skip & Continue" : "Continue"}{" "}
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </motion.div>
  );
}

export function MissedGameStep({
  draft,
  getSeedGame,
  onBack,
  onFinalize,
  onRemoveDislikedAnchor,
  onOpenSearch,
}: {
  draft: ProductOnboardingDraft;
  getSeedGame: (gameId: string) => SeedGame | null;
  onBack: () => void;
  onFinalize: () => void;
  onRemoveDislikedAnchor: (gameId: string) => void;
  onOpenSearch: (slot: SearchSlot, replaceGameId: string | null) => void;
}) {
  const gameId = draft.dislikedGameIds[0];
  const game = gameId ? getSeedGame(gameId) : null;

  return (
    <motion.div
      key="dislikes"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
      className="flex flex-col gap-6 flex-1 min-h-0"
    >
      <p className="text-sm text-muted-foreground/80 leading-relaxed">
        Select 1 game that was not for you so the recommender knows what to avoid.
      </p>
      <div className="flex justify-center py-4">
        {game ? (
          <SelectedGameCard
            accent="negative"
            game={game}
            label="Change Game"
            narrow
            onChange={() => onOpenSearch("dislike", game.gameId)}
            onRemove={() => onRemoveDislikedAnchor(game.gameId)}
          />
        ) : (
          <EmptyGameSlot
            accent="negative"
            label="Select Game"
            narrow
            onClick={() => onOpenSearch("dislike", null)}
          />
        )}
      </div>
      <div className="mt-auto sticky bottom-0 z-20 -mx-4 -mb-4 border-t border-white/5 bg-card/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md md:relative md:m-0 md:border-t-0 md:bg-transparent md:p-0 md:pt-2 flex items-center justify-between">
        <Button type="button" variant="secondary" onClick={onBack}>
          Back
        </Button>
        <Button
          type="button"
          onClick={onFinalize}
          className="ml-auto bg-gradient-to-r from-accent to-indigo-600 font-extrabold text-white shadow-[0_0_15px_rgba(255,106,61,0.25)] hover:shadow-[0_0_20px_rgba(255,106,61,0.35)]"
        >
          {game ? "Find Play Next" : "Skip & Find Play Next"}
        </Button>
      </div>
    </motion.div>
  );
}

function SelectedGameCard({
  accent = "accent",
  game,
  label,
  narrow = false,
  onChange,
  onRemove,
}: {
  accent?: "accent" | "negative";
  game: SeedGame;
  label: string;
  narrow?: boolean;
  onChange: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={cn(
        "group relative aspect-[3/4] rounded-2xl border border-white/5 overflow-hidden shadow-lg transition-all duration-300",
        narrow ? "w-40" : "w-full",
        accent === "accent" ? "hover:border-accent/40" : "hover:border-negative/40",
      )}
    >
      <CoverArt
        game={game}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
      />
      <button
        type="button"
        onClick={onChange}
        className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-3 text-center cursor-pointer animate-fade-in border-0"
      >
        <span
          className={cn(
            "text-[11px] font-black uppercase tracking-wider",
            accent === "accent" ? "text-accent" : "text-negative",
          )}
        >
          {label}
        </span>
        <span className="text-[9px] text-white/70 line-clamp-2 mt-1 leading-snug">
          {game.title}
        </span>
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-2 right-2 size-7 rounded-full bg-black/75 text-white/80 hover:text-white hover:bg-destructive shadow-md grid place-items-center transition-all duration-200 z-10"
        aria-label={`Remove ${game.title}`}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function EmptyGameSlot({
  accent = "accent",
  label,
  narrow = false,
  onClick,
}: {
  accent?: "accent" | "negative";
  label: string;
  narrow?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex flex-col items-center justify-center aspect-[3/4] rounded-2xl border-2 border-dashed border-white/10 bg-secondary/15 hover:bg-secondary/25 transition-all duration-300 active:scale-[0.98] cursor-pointer",
        narrow ? "w-40" : "w-full",
        accent === "accent" ? "hover:border-accent/30" : "hover:border-negative/30",
      )}
    >
      <div
        className={cn(
          "size-10 rounded-full border border-white/10 bg-white/[0.02] transition-all duration-300 grid place-items-center mb-2",
          accent === "accent"
            ? "group-hover:bg-accent/15 group-hover:border-accent/30 group-hover:text-accent"
            : "group-hover:bg-negative/15 group-hover:border-negative/30 group-hover:text-negative",
        )}
      >
        <span className="text-xl font-bold leading-none">+</span>
      </div>
      <span className="text-xs font-bold text-muted-foreground group-hover:text-foreground transition-colors">
        {label}
      </span>
    </button>
  );
}
