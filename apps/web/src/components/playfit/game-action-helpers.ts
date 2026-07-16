import type { ProductGameState, SeedGame } from "@playfit/core/types";
import { nowIso } from "@playfit/core/utils";

export const PLAYFIT_PICKS_LIMIT = 100;

export function buildGameState(
  game: SeedGame,
  source: ProductGameState["source"],
): ProductGameState {
  const timestamp = nowIso();
  return {
    gameId: game.gameId,
    title: game.title,
    inBacklog: false,
    inWishlist: false,
    inPlayfitPicks: false,
    excluded: false,
    source,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function isTerminalGameState(record: ProductGameState | undefined) {
  return (
    record?.status === "completed" ||
    record?.status === "beaten" ||
    record?.status === "abandoned" ||
    record?.excluded === true
  );
}

export function activePlayfitPickCount(gameStates: Record<string, ProductGameState>) {
  return Object.values(gameStates).filter(
    (record) => record.inPlayfitPicks && !isTerminalGameState(record),
  ).length;
}

export function shouldDeleteManualState(record: ProductGameState) {
  return (
    record.source === "manual" &&
    !record.status &&
    record.rating == null &&
    !record.inBacklog &&
    !record.inWishlist &&
    !record.inPlayfitPicks &&
    !record.excluded
  );
}

export { rebuildAdaptiveProfileFromCache } from "./profile-cache-helpers";
