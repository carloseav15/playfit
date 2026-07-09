import type { ProductOnboardingDraft, ProductSeedData, SeedGame } from "@playfit/core/types";
import { Check, ChevronRight } from "lucide-react";
import { useEffect, useRef } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormLabel } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { CoverArt } from "../cover-art";
import { formatDisplayGenre, isValidReleaseYear } from "../product-utils";
import type { SearchSlot } from "./onboarding-helpers";
import { quickSuggestions } from "./onboarding-helpers";

export function OnboardingSearchDialog({
  anchorResults,
  draft,
  hasOnboardingSearch,
  onboardingQuery,
  onboardingSearchError,
  onboardingSearchPending,
  replaceGameId,
  searchSlot,
  seedData,
  onAddAnchor,
  onAddDislikedAnchor,
  onClose,
  onReplaceAnchor,
  onQueryChange,
}: {
  anchorResults: SeedGame[];
  draft: ProductOnboardingDraft;
  hasOnboardingSearch: boolean;
  onboardingQuery: string;
  onboardingSearchError: string | null;
  onboardingSearchPending: boolean;
  replaceGameId: string | null;
  searchSlot: SearchSlot | null;
  seedData: ProductSeedData;
  onAddAnchor: (game: SeedGame) => void;
  onAddDislikedAnchor: (game: SeedGame) => void;
  onClose: () => void;
  onReplaceAnchor: (oldGameId: string, newGame: SeedGame) => void;
  onQueryChange: (query: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchSlot !== null) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [searchSlot]);

  return (
    <Dialog
      open={searchSlot !== null}
      onClose={onClose}
      title={
        searchSlot === "anchor"
          ? replaceGameId
            ? "Change loved game"
            : "Search loved game"
          : "Search missed game"
      }
      eyebrow={searchSlot === "anchor" ? "Loved Games" : "Missed Game"}
      className="max-w-xl overflow-hidden"
    >
      <div className="grid gap-5">
        <div className="grid gap-2">
          <FormLabel htmlFor="onboarding-search-input">Search by title</FormLabel>
          <Input
            ref={inputRef}
            id="onboarding-search-input"
            value={onboardingQuery}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Type game title..."
            className="w-full text-base"
          />
        </div>

        <div className="grid gap-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            Quick Suggestions
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quickSuggestions.map((suggestion) => (
              <Button
                key={suggestion}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onQueryChange(suggestion)}
                className="text-xs"
              >
                {suggestion}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 max-h-[40vh] overflow-y-auto pr-1">
          {anchorResults.map((game) => (
            <SearchResultButton
              key={game.gameId}
              draft={draft}
              game={game}
              replaceGameId={replaceGameId}
              searchSlot={searchSlot}
              onSelect={() => {
                if (searchSlot === "anchor") {
                  if (replaceGameId) {
                    onReplaceAnchor(replaceGameId, game);
                  } else {
                    onAddAnchor(game);
                  }
                } else if (searchSlot === "dislike") {
                  onAddDislikedAnchor(game);
                }
                onClose();
              }}
            />
          ))}

          {anchorResults.length === 0 && hasOnboardingSearch ? (
            onboardingSearchPending ? (
              <div className="flex flex-col items-center justify-center py-8 gap-3">
                <Spinner className="text-accent" />
                <p className="text-sm text-muted-foreground">Searching catalog...</p>
              </div>
            ) : onboardingSearchError ? (
              <Alert variant="error">{onboardingSearchError}</Alert>
            ) : seedData.allGames.length === 0 ? (
              <Alert variant="warning">
                The game catalog is currently empty. Make sure you run the seeding script (
                <code>bash scripts/seed-catalog.sh</code>) to import games.
              </Alert>
            ) : (
              <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-white/5 rounded-2xl bg-secondary/10">
                No games found matching your search.
              </p>
            )
          ) : !hasOnboardingSearch ? (
            <p className="text-sm text-muted-foreground py-6 text-center border border-dashed border-white/5 rounded-2xl bg-secondary/5">
              Type a game title above to search.
            </p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

function SearchResultButton({
  draft,
  game,
  replaceGameId,
  searchSlot,
  onSelect,
}: {
  draft: ProductOnboardingDraft;
  game: SeedGame;
  replaceGameId: string | null;
  searchSlot: SearchSlot | null;
  onSelect: () => void;
}) {
  const loved = draft.likedGameIds.includes(game.gameId);
  const disliked = draft.dislikedGameIds.includes(game.gameId);

  let isDisabled = false;
  let isCurrentSelection = false;
  let statusLabel = "";

  if (searchSlot === "anchor") {
    isCurrentSelection = game.gameId === replaceGameId;
    isDisabled = loved && !isCurrentSelection;
    if (isDisabled) {
      statusLabel = "Already selected as loved";
    } else if (isCurrentSelection) {
      statusLabel = "Current selection";
    } else if (disliked) {
      statusLabel = "Selected as disliked (will swap)";
    }
  } else if (searchSlot === "dislike") {
    isCurrentSelection = disliked;
    isDisabled = loved;
    if (isDisabled) {
      statusLabel = "Selected as loved";
    } else if (isCurrentSelection) {
      statusLabel = "Current selection";
    }
  }

  return (
    <button
      type="button"
      aria-pressed={isCurrentSelection}
      disabled={isDisabled}
      onClick={onSelect}
      className={cn(
        "group flex w-full min-w-0 items-center gap-3.5 rounded-2xl border border-white/5 bg-secondary/25 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-all duration-200 hover:bg-secondary/50 disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-muted/10",
        isCurrentSelection &&
          (searchSlot === "anchor"
            ? "border-accent/40 bg-accent/10"
            : "border-negative/40 bg-negative/10"),
      )}
    >
      <CoverArt
        game={game}
        className="aspect-[2/3] w-12 shrink-0 rounded-sm shadow-md transition-transform group-hover:scale-[1.03]"
      />
      <div className="min-w-0 flex-1">
        <strong
          className={cn(
            "block text-base font-black truncate text-foreground transition-colors",
            isCurrentSelection &&
              (searchSlot === "anchor" ? "group-hover:text-accent" : "group-hover:text-negative"),
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
                : searchSlot === "anchor"
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
      {isCurrentSelection ? (
        <div
          className={cn(
            "size-6 shrink-0 grid place-items-center rounded-full border",
            searchSlot === "anchor"
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
      )}
    </button>
  );
}
