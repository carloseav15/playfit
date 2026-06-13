import type {
  ProductDecisionFeedback,
  ProductGameState,
  ProductRating,
  ProductState,
  SeedGame,
} from "../types";
import { nowIso } from "../utils";
import { buildAdaptiveProfile } from "./onboarding";

const feedbackRatings: Partial<Record<ProductDecisionFeedback, ProductRating>> = {
  loved: 5,
  liked: 4,
  mixed: 3,
  not_for_me: 2,
};

export const productDecisionFeedbackMessages: Record<ProductDecisionFeedback, string> = {
  play: "Set as playing. Your next pick will adapt around it.",
  later: "Saved for later. Playfit will look past it for now.",
  loved: "Marked as loved.",
  liked: "Marked as liked.",
  mixed: "Marked as mixed.",
  not_for_me: "Noted. Playfit will find a better fit.",
};

export function applyProductDecisionFeedback({
  state,
  game,
  gamesById,
  feedback,
  timestamp = nowIso(),
}: {
  state: ProductState;
  game: SeedGame;
  gamesById: Map<string, SeedGame>;
  feedback: ProductDecisionFeedback;
  timestamp?: string;
}): ProductGameState {
  const existing = state.user.gameStates[game.gameId] ?? {
    gameId: game.gameId,
    title: game.title,
    inBacklog: false,
    inWishlist: false,
    excluded: false,
    source: "manual" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const next: ProductGameState = { ...existing, updatedAt: timestamp };

  if (feedback === "play") {
    next.status = "playing";
    next.inBacklog = false;
    next.excluded = false;
  }

  if (feedback === "later") {
    next.status = "shelved";
    next.inBacklog = true;
    next.excluded = false;
  }

  const rating = feedbackRatings[feedback];
  if (rating) {
    next.rating = rating;
    next.excluded = feedback === "not_for_me";
  }

  state.user.gameStates[game.gameId] = next;
  if (state.user.profile) {
    state.user.profile = buildAdaptiveProfile(
      state.user.onboarding,
      gamesById,
      state.user.gameStates,
    );
  }

  return next;
}
