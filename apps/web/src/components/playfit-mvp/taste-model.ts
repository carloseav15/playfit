import type {
  ProductGameState,
  ProductRating,
  ProductState,
  ProductTasteDecision,
  ProductTasteHistoryEntry,
  ProductTasteSignalSource,
  ProductTasteTone,
  SeedGame,
} from "@playfit/core/types";

export interface HistoryOrActivityEntry {
  gameId: string;
  title: string;
  decision: ProductTasteDecision | "playing" | "picks";
  source: ProductTasteSignalSource | "active_state";
  tone?: ProductTasteTone;
  rating?: ProductRating;
  status?: ProductGameState["status"];
  updatedAt?: string;
  traits: string[];
}

const terminalStatuses = new Set<ProductGameState["status"]>(["completed", "beaten", "abandoned"]);

export function getTasteGameIds(state: ProductState) {
  return [
    ...new Set([
      ...state.user.onboarding.likedGameIds,
      ...(state.user.onboarding.dislikedGameIds ?? []),
      ...Object.keys(state.user.gameStates),
    ]),
  ];
}

export function getSeedGamesById(
  gameIds: string[],
  getSeedGame: (gameId: string) => SeedGame | null,
) {
  const gamesById = new Map<string, SeedGame>();
  for (const gameId of gameIds) {
    const game = getSeedGame(gameId);
    if (game) gamesById.set(gameId, game);
  }
  return gamesById;
}

export function getMissingGameIds(gameIds: string[], gamesById: Map<string, SeedGame>) {
  return gameIds.filter((gameId) => !gamesById.has(gameId));
}

function getGameTraits(game: SeedGame) {
  return [game.genreId ?? game.primaryGenre, ...game.tags].filter(Boolean).slice(0, 4);
}

function isActivePick(record: ProductGameState) {
  return record.inPlayfitPicks && !terminalStatuses.has(record.status) && !record.excluded;
}

export function buildHistoryAndActivityEntries({
  gameStates,
  historyEntries,
  gamesById,
}: {
  gameStates: Record<string, ProductGameState>;
  historyEntries: ProductTasteHistoryEntry[];
  gamesById: Map<string, SeedGame>;
}) {
  const activeEntries: HistoryOrActivityEntry[] = [];

  for (const record of Object.values(gameStates)) {
    const game = gamesById.get(record.gameId);
    if (!game) continue;

    if (record.status === "playing") {
      activeEntries.push({
        gameId: record.gameId,
        title: game.title,
        decision: "playing",
        source: "active_state",
        rating: record.rating,
        status: record.status,
        updatedAt: record.updatedAt,
        traits: getGameTraits(game),
      });
    } else if (isActivePick(record)) {
      activeEntries.push({
        gameId: record.gameId,
        title: game.title,
        decision: "picks",
        source: "active_state",
        rating: record.rating,
        status: record.status,
        updatedAt: record.updatedAt,
        traits: getGameTraits(game),
      });
    }
  }

  const combined = [...activeEntries];
  const activeIds = new Set(activeEntries.map((entry) => entry.gameId));

  for (const entry of historyEntries) {
    if (!activeIds.has(entry.gameId)) {
      combined.push({
        gameId: entry.gameId,
        title: entry.title,
        decision: entry.decision,
        source: entry.source,
        tone: entry.tone,
        rating: entry.rating,
        status: entry.status,
        updatedAt: entry.updatedAt,
        traits: entry.traits,
      });
    }
  }

  return combined.sort((a, b) => {
    const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return bTime - aTime || a.title.localeCompare(b.title);
  });
}
