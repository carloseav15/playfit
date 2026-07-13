import type { SeedGame } from "@playfit/core/types";
import { Check, ChevronRight } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { CoverArt } from "./cover-art";
import { formatDisplayGenre, isValidReleaseYear } from "./product-utils";

export interface SearchResultSelectionState {
  isCurrentSelection: boolean;
  isDisabled: boolean;
  statusLabel: string;
  tone: "accent" | "negative";
}

export function SearchResultRow({
  game,
  onSelect,
  selectionState,
}: {
  game: SeedGame;
  onSelect: () => void;
  selectionState?: SearchResultSelectionState;
}) {
  const {
    isCurrentSelection = false,
    isDisabled = false,
    statusLabel = "",
    tone = "accent",
  } = selectionState ?? {};

  return (
    <button
      type="button"
      aria-pressed={selectionState ? isCurrentSelection : undefined}
      disabled={isDisabled}
      onClick={onSelect}
      className={cn(
        "group flex w-full min-w-0 items-center gap-3.5 rounded-2xl border border-white/5 bg-secondary/25 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-200 hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-muted/10",
        isCurrentSelection &&
          (tone === "accent"
            ? "border-accent/40 bg-accent/10"
            : "border-negative/40 bg-negative/10"),
      )}
    >
      <CoverArt
        game={game}
        className="aspect-[3/4] w-12 shrink-0 rounded-sm shadow-md transition-transform group-hover:scale-[1.03]"
      />
      <div className="min-w-0 flex-1">
        <strong
          className={cn(
            "block text-base font-black truncate text-foreground transition-colors",
            isCurrentSelection &&
              (tone === "accent" ? "group-hover:text-accent" : "group-hover:text-negative"),
          )}
        >
          {game.title}
        </strong>
        {statusLabel ? (
          <span
            className={cn(
              "block text-xs font-bold uppercase tracking-wider mt-0.5",
              isDisabled
                ? "text-muted-foreground/60"
                : tone === "accent"
                  ? "text-accent"
                  : "text-negative",
            )}
          >
            {statusLabel}
          </span>
        ) : (
          <span className="block text-xs text-muted-foreground truncate mt-0.5">
            {[
              formatDisplayGenre(game.primaryGenre),
              isValidReleaseYear(game.releaseYear) ? game.releaseYear : "",
              game.availablePlatformNames && game.availablePlatformNames.length > 0
                ? game.availablePlatformNames.slice(0, 3).join(", ") +
                  (game.availablePlatformNames.length > 3 ? "..." : "")
                : "",
            ]
              .filter(Boolean)
              .join(" • ")}
          </span>
        )}
      </div>
      {selectionState ? (
        isCurrentSelection ? (
          <div
            className={cn(
              "size-6 shrink-0 grid place-items-center rounded-full border",
              tone === "accent"
                ? "bg-accent/10 text-accent border-accent/30"
                : "bg-negative/10 text-negative border-negative/30",
            )}
          >
            <Check className="size-3.5 stroke-[3]" />
          </div>
        ) : (
          !isDisabled && (
            <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
          )
        )
      ) : (
        <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5" />
      )}
    </button>
  );
}

export function SearchStatusPanel({
  pending,
  error,
  catalogEmpty,
  hasQuery,
}: {
  pending: boolean;
  error: string | null;
  catalogEmpty: boolean;
  hasQuery: boolean;
}) {
  if (!hasQuery) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-white/5 rounded-2xl bg-secondary/5">
        Type a game title above to search.
      </p>
    );
  }
  if (pending) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-3">
        <Spinner className="text-accent" />
        <p className="text-sm text-muted-foreground">Searching catalog...</p>
      </div>
    );
  }
  if (error) {
    return <Alert variant="error">{error}</Alert>;
  }
  if (catalogEmpty) {
    return (
      <Alert variant="warning">
        The game catalog is currently empty. Make sure you run the seeding script (
        <code>bash scripts/seed-catalog.sh</code>) to import games.
      </Alert>
    );
  }
  return (
    <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-white/5 rounded-2xl bg-secondary/10">
      No games found matching your search.
    </p>
  );
}
