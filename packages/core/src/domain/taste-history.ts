import type {
  ProductGameState,
  ProductOnboardingDraft,
  ProductTasteDecision,
  ProductTasteHistoryEntry,
  ProductTasteSignalSource,
  SeedGame,
} from "../types";

function decisionFromRating(record: ProductGameState): ProductTasteDecision | null {
  if (record.status === "abandoned") return "dropped";
  if (record.excluded) return "not_for_me";
  if (record.rating == null || record.rating <= 0) return null;
  if (record.rating >= 4.5) return "loved";
  if (record.rating >= 4) return "liked";
  if (record.rating >= 3) return "mixed";
  return "not_for_me";
}

function toneFromDecision(decision: ProductTasteDecision): ProductTasteHistoryEntry["tone"] {
  if (decision === "setup_miss" || decision === "dropped" || decision === "not_for_me") {
    return "negative";
  }
  if (decision === "mixed") return "mixed";
  return "positive";
}

function buildHistoryEntry({
  game,
  decision,
  source,
  record,
}: {
  game: SeedGame;
  decision: ProductTasteDecision;
  source: ProductTasteSignalSource;
  record?: ProductGameState;
}): ProductTasteHistoryEntry {
  return {
    gameId: game.gameId,
    title: game.title,
    decision,
    source,
    tone: toneFromDecision(decision),
    rating: record?.rating,
    status: record?.status,
    updatedAt: record?.updatedAt,
    traits: [game.genreId ?? game.primaryGenre, ...game.tags].filter(Boolean).slice(0, 4),
  };
}

export function buildTasteHistoryEntries(
  draft: ProductOnboardingDraft,
  gameStates: Record<string, ProductGameState>,
  gamesById: Map<string, SeedGame>,
): ProductTasteHistoryEntry[] {
  const entriesByGame = new Map<string, ProductTasteHistoryEntry>();

  for (const record of Object.values(gameStates)) {
    const game = gamesById.get(record.gameId);
    if (!game) continue;
    const decision = decisionFromRating(record);
    if (!decision) continue;
    entriesByGame.set(
      record.gameId,
      buildHistoryEntry({ game, decision, source: "rating", record }),
    );
  }

  for (const gameId of draft.likedGameIds) {
    if (entriesByGame.has(gameId)) continue;
    const game = gamesById.get(gameId);
    if (!game) continue;
    entriesByGame.set(
      gameId,
      buildHistoryEntry({ game, decision: "setup_favorite", source: "onboarding_liked" }),
    );
  }

  for (const gameId of draft.dislikedGameIds ?? []) {
    if (entriesByGame.has(gameId)) continue;
    const game = gamesById.get(gameId);
    if (!game) continue;
    entriesByGame.set(
      gameId,
      buildHistoryEntry({ game, decision: "setup_miss", source: "onboarding_disliked" }),
    );
  }

  return [...entriesByGame.values()].sort((left, right) => {
    const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0;
    const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0;
    return rightTime - leftTime || left.title.localeCompare(right.title);
  });
}
