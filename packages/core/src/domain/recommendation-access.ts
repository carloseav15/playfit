import type {
  GameAccessStatus,
  PlatformAvailability,
  ProductState,
  RankedSeedGame,
  SeedGame,
} from "../types";

export function getAccessStatus(
  game: SeedGame,
  platformAvailability: PlatformAvailability,
): GameAccessStatus {
  if (game.releaseState === "unreleased") return "unreleased";
  if (platformAvailability === "unavailable") return "not_on_platforms";
  if (platformAvailability === "unknown") return "unknown_platform";
  return "playable";
}

export function buildAccessiblePlatformIds(state: ProductState) {
  return new Set(
    state.user.onboarding.platforms
      .filter((entry) => ["available", "limited"].includes(entry.status))
      .map((entry) => entry.platformId),
  );
}

export function getPlatformAvailability(
  game: SeedGame,
  accessiblePlatformIds: Set<string>,
): PlatformAvailability {
  if (!game.availablePlatformIds || game.availablePlatformIds.length === 0) return "unknown";
  return game.availablePlatformIds.some((platformId) => accessiblePlatformIds.has(platformId))
    ? "available"
    : "unavailable";
}

export function isPlayableNow(entry: RankedSeedGame) {
  return entry.accessStatus === "playable";
}
