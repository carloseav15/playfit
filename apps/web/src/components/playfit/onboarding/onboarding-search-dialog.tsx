import type { ProductOnboardingDraft, ProductSeedData, SeedGame } from "@playfit/core/types";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormLabel } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  SearchResultRow,
  type SearchResultSelectionState,
  SearchStatusPanel,
} from "../search-result-row";
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

  return (
    <Dialog
      open={searchSlot !== null}
      onClose={onClose}
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        inputRef.current?.focus();
      }}
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
            <SearchResultRow
              key={game.gameId}
              game={game}
              selectionState={buildSelectionState(game, draft, replaceGameId, searchSlot)}
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

          {anchorResults.length === 0 && (
            <SearchStatusPanel
              pending={onboardingSearchPending}
              error={onboardingSearchError}
              catalogEmpty={seedData.allGames.length === 0}
              hasQuery={hasOnboardingSearch}
            />
          )}
        </div>
      </div>
    </Dialog>
  );
}

function buildSelectionState(
  game: SeedGame,
  draft: ProductOnboardingDraft,
  replaceGameId: string | null,
  searchSlot: SearchSlot | null,
): SearchResultSelectionState {
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

  return {
    isCurrentSelection,
    isDisabled,
    statusLabel,
    tone: searchSlot === "dislike" ? "negative" : "accent",
  };
}
