import type {
  ProductDecisionFeedback,
  ProductGameState,
  ProductRating,
  ProductState,
  ProductTasteActionType,
  SeedGame,
} from "../types";
import { nowIso } from "../utils";
import { buildAdaptiveProfile } from "./onboarding";

const feedbackRatings: Partial<Record<ProductDecisionFeedback, ProductRating>> = {
  loved: 5,
  liked: 4,
  mixed: 3,
  not_for_me: 2,
  played_loved: 5,
  played_liked: 4,
  played_mixed: 3,
  played_dropped: 2,
};

export const productDecisionFeedbackMessages: Record<ProductDecisionFeedback, string> = {
  play: "Started. This updates Play Next, not your taste.",
  later: "Saved for later. Playfit will look past it for now.",
  loved: "Marked as loved.",
  liked: "Marked as liked.",
  mixed: "Marked as mixed.",
  not_for_me: "Noted. Playfit will find a better fit.",
  played_loved: "Already played and loved. Playfit will learn from it.",
  played_liked: "Already played and liked.",
  played_mixed: "Marked as mixed. This records the game without changing your taste profile.",
  played_dropped: "Marked as dropped. Playfit will steer away.",
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
    inPlayfitPicks: false,
    excluded: false,
    source: "manual" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const next: ProductGameState = { ...existing, updatedAt: timestamp };

  if (feedback === "play") {
    next.status = "playing";
    next.inBacklog = false;
    next.inPlayfitPicks = false;
    next.excluded = false;
  }

  if (feedback === "later") {
    next.status = "shelved";
    next.inBacklog = true;
    next.excluded = false;
  }

  if (feedback === "played_loved" || feedback === "played_liked" || feedback === "played_mixed") {
    next.status = "completed";
    next.inBacklog = false;
    next.inPlayfitPicks = false;
    next.excluded = false;
  }

  if (feedback === "played_dropped") {
    next.status = "abandoned";
    next.inBacklog = false;
    next.inPlayfitPicks = false;
    next.excluded = true;
  }

  const rating = feedbackRatings[feedback];
  if (rating) {
    next.rating = rating;
    next.excluded = feedback === "not_for_me" || feedback === "played_dropped";
    if (next.excluded || feedback.startsWith("played_")) {
      next.inPlayfitPicks = false;
    }
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

export function applyProductTasteAction({
  state,
  game,
  gamesById,
  actionType,
  played = false,
  timestamp = nowIso(),
}: {
  state: ProductState;
  game: SeedGame;
  gamesById: Map<string, SeedGame>;
  actionType: ProductTasteActionType;
  played?: boolean;
  timestamp?: string;
}): ProductGameState {
  const feedback: ProductDecisionFeedback = (() => {
    switch (actionType) {
      case "loved":
        return played ? "played_loved" : "loved";
      case "liked":
        return played ? "played_liked" : "liked";
      case "mixed":
        if (!played) throw new Error("mixed is only valid from the Already Played flow");
        return "played_mixed";
      case "dropped":
        if (!played) throw new Error("dropped is only valid from the Already Played flow");
        return "played_dropped";
      case "not_for_me":
        return "not_for_me";
    }
  })();

  const next = applyProductDecisionFeedback({
    state,
    game,
    gamesById,
    feedback,
    timestamp,
  });
  state.user.lastUpdatedAt = timestamp;
  return next;
}

/**
 * Started is a product-acceptance transition.  In particular, do not call
 * buildAdaptiveProfile here: starting a recommendation is not evidence that it
 * matches the user's taste.
 */
export function applyProductStartedAction({
  state,
  game,
  timestamp = nowIso(),
}: {
  state: ProductState;
  game: SeedGame;
  timestamp?: string;
}): ProductGameState {
  const existing = state.user.gameStates[game.gameId] ?? {
    gameId: game.gameId,
    title: game.title,
    inBacklog: false,
    inWishlist: false,
    inPlayfitPicks: false,
    excluded: false,
    source: "manual" as const,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const next: ProductGameState = {
    ...existing,
    status: "playing",
    inBacklog: false,
    inPlayfitPicks: false,
    excluded: false,
    updatedAt: timestamp,
  };
  state.user.gameStates[game.gameId] = next;
  state.user.lastUpdatedAt = timestamp;
  return next;
}

export function applyProductTasteUndo({
  state,
  gameId,
  previousGameState,
  gamesById,
  timestamp = nowIso(),
}: {
  state: ProductState;
  gameId: string;
  previousGameState: ProductGameState | null;
  gamesById: Map<string, SeedGame>;
  timestamp?: string;
}): ProductGameState | null {
  if (previousGameState) {
    state.user.gameStates[gameId] = structuredClone(previousGameState);
  } else {
    delete state.user.gameStates[gameId];
  }

  if (state.user.profile) {
    state.user.profile = buildAdaptiveProfile(
      state.user.onboarding,
      gamesById,
      state.user.gameStates,
    );
  }
  state.user.lastUpdatedAt = timestamp;
  return state.user.gameStates[gameId] ?? null;
}
