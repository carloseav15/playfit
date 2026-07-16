import type { SeedGame } from "@playfit/core/types";

export function getSafeSearchReturnTo(returnTo?: string) {
  return returnTo === "/search" || returnTo?.startsWith("/search?") ? returnTo : null;
}

export function buildAvailablePlatformList(game: SeedGame | null | undefined) {
  const ids = game?.availablePlatformIds ?? [];
  const names = game?.availablePlatformNames ?? [];
  return ids.map((id, index) => ({
    id,
    name: names[index] || id,
  }));
}
