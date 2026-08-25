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

export type SpatialArrowKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

// Cartesian spatial nav for the affinity map's SVG nodes: restrict candidates to the
// half-plane the arrow key points toward, then prefer the one most directly ahead
// (perpendicular drift is penalized more than distance along the pressed direction) so
// the "nearest" node reads as spatially correct rather than just Euclidean-closest.
// Raw node.y increases toward the map's visual top (see scaleCoordinateY's inversion),
// so ArrowUp/ArrowDown compare against increasing/decreasing y, matching the screen.
export function findNearestNodeInDirection(
  current: TasteMapNode,
  direction: SpatialArrowKey,
  nodes: TasteMapNode[],
): TasteMapNode | null {
  let best: TasteMapNode | null = null;
  let bestCost = Infinity;

  for (const candidate of nodes) {
    if (candidate.game.gameId === current.game.gameId) continue;
    const dx = candidate.x - current.x;
    const dy = candidate.y - current.y;

    let primary: number;
    let cross: number;
    if (direction === "ArrowRight") {
      if (dx <= 0) continue;
      primary = dx;
      cross = dy;
    } else if (direction === "ArrowLeft") {
      if (dx >= 0) continue;
      primary = -dx;
      cross = dy;
    } else if (direction === "ArrowUp") {
      if (dy <= 0) continue;
      primary = dy;
      cross = dx;
    } else {
      if (dy >= 0) continue;
      primary = -dy;
      cross = dx;
    }

    const cost = primary + Math.abs(cross) * 2;
    if (cost < bestCost) {
      bestCost = cost;
      best = candidate;
    }
  }

  return best;
}
