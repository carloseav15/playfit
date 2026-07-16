import type { ProductGameState, ProductOnboardingDraft, SeedGame } from "@playfit/core/types";
import { calculateGameCoordinates } from "@/lib/map-geometry";

export interface TasteMapNode {
  game: SeedGame;
  x: number;
  y: number;
  type: "liked" | "disliked" | "pending";
  state?: ProductGameState;
}

export function buildTasteMapNodes(
  gamesById: Map<string, SeedGame>,
  gameStates: Record<string, ProductGameState>,
  onboarding: ProductOnboardingDraft,
): TasteMapNode[] {
  const nodes: TasteMapNode[] = [];

  gamesById.forEach((game) => {
    const state = gameStates[game.gameId];
    const isLikedOnboarding = onboarding.likedGameIds.includes(game.gameId);
    const isDislikedOnboarding = (onboarding.dislikedGameIds ?? []).includes(game.gameId);

    if (!state && !isLikedOnboarding && !isDislikedOnboarding) return;

    const isPick = state?.inPlayfitPicks;
    const isPlaying = state?.status === "playing";
    const hasRating = state?.rating != null && state.rating > 0;
    let type: TasteMapNode["type"] = "liked";

    if (isPick && !isPlaying && !hasRating) {
      type = "pending";
    } else {
      const isLikedSignal =
        isLikedOnboarding ||
        isPlaying ||
        (state?.rating && state.rating >= 4) ||
        ((state?.status === "completed" || state?.status === "beaten") &&
          state?.rating &&
          state.rating >= 3);
      type = isLikedSignal ? "liked" : "disliked";
    }

    const { x, y } = calculateGameCoordinates(game);
    nodes.push({ game, x, y, type, state });
  });

  return nodes;
}
