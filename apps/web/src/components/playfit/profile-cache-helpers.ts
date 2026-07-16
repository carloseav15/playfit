import { buildAdaptiveProfile } from "@playfit/core/domain";
import type {
  ProductGameState,
  ProductOnboardingDraft,
  ProductProfile,
  ProductState,
  SeedGame,
} from "@playfit/core/types";
import { getCachedGame } from "@/lib/game-cache";

export function buildProfileGamesById(
  onboarding: ProductOnboardingDraft,
  gameStates: Record<string, ProductGameState>,
) {
  const ids = new Set([
    ...onboarding.likedGameIds,
    ...(onboarding.dislikedGameIds ?? []),
    ...Object.keys(gameStates),
  ]);
  const gamesById = new Map<string, SeedGame>();
  for (const id of ids) {
    const game = getCachedGame(id);
    if (game) gamesById.set(id, game);
  }
  return gamesById;
}

export function buildAdaptiveProfileFromCache(
  onboarding: ProductOnboardingDraft,
  gameStates: Record<string, ProductGameState>,
): ProductProfile {
  return buildAdaptiveProfile(
    onboarding,
    buildProfileGamesById(onboarding, gameStates),
    gameStates,
  );
}

export function rebuildAdaptiveProfileFromCache(draft: ProductState) {
  if (!draft.user.profile && !draft.user.onboardingCompletedAt) return;
  draft.user.profile = buildAdaptiveProfileFromCache(draft.user.onboarding, draft.user.gameStates);
}
