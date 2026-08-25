import {
  applyProductStartedAction,
  applyProductTasteAction,
  applyProductTasteUndo,
} from "@playfit/core/domain";
import {
  productCanonicalDecisionRequestSchema,
  productGameStateSchema,
} from "@playfit/core/schemas";
import type {
  ProductCanonicalDecisionResponse,
  ProductGameState,
  ProductPlayNextModel,
  ProductState,
} from "@playfit/core/types";
import { jsonError } from "@/lib/api-errors";
import { playNextRecommendationId } from "@/lib/core-loop-analytics";
import { captureApiError, withApiTiming } from "@/lib/monitoring";
import { recordRecommendationGenerated } from "@/lib/record-recommendation-generated";
import { createRequestSupabaseContext } from "@/lib/supabase/server";
import {
  buildPlayNextModel,
  fetchFullGamesById,
  loadRecommendationStateFromContext,
} from "../recommendations/shared";
import { mapPersistedState, type PersistedProfilePayload } from "../recommendations/state-loader";

type TransitionResult = {
  status?:
    | "applied"
    | "replayed"
    | "conflict"
    | "not_found"
    | "operation_mismatch"
    | "undo_unavailable";
  state_version?: number | string;
  profile_snapshot?: PersistedProfilePayload;
  game_id?: string;
  restored_previous_state?: boolean;
};

type UndoContextResult = {
  status?: "available" | "replayable" | "conflict" | "not_found" | "undo_unavailable";
  state_version?: number | string;
  game_id?: string;
  previous_game_state_exists?: boolean;
  previous_game_state?: unknown;
  profile_snapshot?: PersistedProfilePayload;
};

async function postDecision(request: Request) {
  const context = await createRequestSupabaseContext(request);
  if (!context) return jsonError("Authentication required", 401);

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonError("Invalid JSON payload", 400);
  }

  const parsed = productCanonicalDecisionRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid decision payload", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const action = parsed.data;

  const loaded = await loadRecommendationStateFromContext(request, context);
  if (!loaded.ok) {
    return Response.json(
      { error: loaded.error, needsResync: loaded.error === "needs_resync" },
      { status: loaded.status },
    );
  }

  let transitionData: unknown;
  let transitionError: { message: string } | null;
  let responseGameId: string;
  let undoMetadata:
    | { targetOperationId: string; gameId: string; restoredPreviousState: boolean }
    | undefined;

  if (action.actionType === "undo_decision") {
    const { data: contextData, error: contextError } = await context.client.rpc(
      "get_undo_transition_context",
      {
        p_user_id: context.userId,
        p_expected_state_version: action.expectedStateVersion,
        p_target_operation_id: action.targetOperationId,
        p_operation_id: action.operationId,
      },
    );
    if (contextError) {
      captureApiError(contextError, {
        route: "/api/decisions",
        request,
        operation: "get_undo_transition_context",
        statusCode: 500,
      });
      return jsonError("Failed to prepare Undo", 500);
    }

    const undoContext = (contextData ?? {}) as UndoContextResult;
    if (undoContext.status === "conflict") {
      return Response.json(
        {
          error: "Profile changed before Undo could be applied",
          conflict: true,
          needsResync: true,
          currentStateVersion: String(undoContext.state_version ?? loaded.stateVersion),
          state: loaded.state,
        },
        { status: 409 },
      );
    }
    if (
      (undoContext.status !== "available" && undoContext.status !== "replayable") ||
      !undoContext.profile_snapshot
    ) {
      return Response.json(
        {
          error: "That decision can no longer be undone",
          undoUnavailable: true,
          needsResync: true,
          currentStateVersion: String(undoContext.state_version ?? loaded.stateVersion),
          state: loaded.state,
        },
        { status: 409 },
      );
    }

    let currentState: ProductState;
    try {
      currentState = mapPersistedState(undoContext.profile_snapshot);
    } catch {
      return jsonError("Invalid Undo context", 503);
    }
    const gameId = undoContext.game_id;
    if (!gameId) return jsonError("Invalid Undo context", 503);

    let previousGameState: ProductGameState | null = null;
    if (undoContext.status === "available" && undoContext.previous_game_state_exists) {
      const parsedPreviousState = productGameStateSchema.safeParse(undoContext.previous_game_state);
      if (!parsedPreviousState.success) return jsonError("Invalid Undo context", 503);
      previousGameState = parsedPreviousState.data;
    }

    const nextState = structuredClone(currentState);
    if (undoContext.status === "available") {
      const allGameIds = [
        gameId,
        ...currentState.user.onboarding.likedGameIds,
        ...currentState.user.onboarding.dislikedGameIds,
        ...Object.keys(currentState.user.gameStates),
      ];
      const gamesById = await fetchFullGamesById(allGameIds);
      if (!gamesById.has(gameId)) return jsonError("Game not found", 404);
      applyProductTasteUndo({
        state: nextState,
        gameId,
        previousGameState,
        gamesById,
      });
    }
    if (!nextState.user.profile) return jsonError("Taste profile is not ready", 409);

    const operationFingerprint = JSON.stringify({
      actionType: action.actionType,
      targetOperationId: action.targetOperationId,
    });
    const undoResult = await context.client.rpc("apply_profile_undo", {
      p_user_id: context.userId,
      p_expected_state_version: action.expectedStateVersion,
      p_operation_id: action.operationId,
      p_operation_fingerprint: operationFingerprint,
      p_target_operation_id: action.targetOperationId,
      p_rebuilt_profile: nextState.user.profile,
    });
    transitionData = undoResult.data;
    transitionError = undoResult.error;
    responseGameId = gameId;
    undoMetadata = {
      targetOperationId: action.targetOperationId,
      gameId,
      restoredPreviousState: undoContext.previous_game_state_exists === true,
    };
  } else {
    const allGameIds = [
      action.gameId,
      ...loaded.state.user.onboarding.likedGameIds,
      ...loaded.state.user.onboarding.dislikedGameIds,
      ...Object.keys(loaded.state.user.gameStates),
    ];
    const gamesById = await fetchFullGamesById(allGameIds);
    const targetGame = gamesById.get(action.gameId);
    if (!targetGame) return jsonError("Game not found", 404);

    const nextState = structuredClone(loaded.state);
    if (action.actionType === "started") {
      applyProductStartedAction({ state: nextState, game: targetGame });
    } else {
      applyProductTasteAction({
        state: nextState,
        game: targetGame,
        gamesById,
        actionType: action.actionType,
        played: action.played,
      });
    }
    if (!nextState.user.profile) return jsonError("Taste profile is not ready", 409);

    const operationFingerprint = JSON.stringify({
      actionType: action.actionType,
      gameId: action.gameId,
      played: action.actionType === "started" ? undefined : (action.played ?? false),
    });
    const decisionResult = await context.client.rpc("apply_profile_transition", {
      p_user_id: context.userId,
      p_expected_state_version: action.expectedStateVersion,
      p_operation_id: action.operationId,
      p_operation_fingerprint: operationFingerprint,
      p_game_id: action.gameId,
      p_game_states: nextState.user.gameStates,
      p_profile: nextState.user.profile,
      p_onboarding: {
        ...nextState.user.onboarding,
        onboardingCompletedAt: nextState.user.onboardingCompletedAt,
      },
    });
    transitionData = decisionResult.data;
    transitionError = decisionResult.error;
    responseGameId = action.gameId;
  }

  if (transitionError) {
    captureApiError(transitionError, {
      route: "/api/decisions",
      request,
      operation: "apply_profile_transition",
      statusCode: 500,
    });
    return jsonError("Failed to save decision", 500);
  }

  const transition = (transitionData ?? {}) as TransitionResult;
  const currentStateVersion = String(transition.state_version ?? loaded.stateVersion);
  if (transition.status === "conflict") {
    return Response.json(
      {
        error: "Profile changed before this decision could be saved",
        conflict: true,
        needsResync: true,
        currentStateVersion,
      },
      { status: 409 },
    );
  }
  if (transition.status === "operation_mismatch") {
    return jsonError("operationId was already used for a different decision", 409);
  }
  if (transition.status === "undo_unavailable") {
    return Response.json(
      {
        error: "That decision can no longer be undone",
        undoUnavailable: true,
        needsResync: true,
        currentStateVersion,
        state: loaded.state,
      },
      { status: 409 },
    );
  }
  if (transition.status !== "applied" && transition.status !== "replayed") {
    return Response.json({ error: "Profile is unavailable", needsResync: true }, { status: 409 });
  }

  let persisted: Awaited<ReturnType<typeof loadRecommendationStateFromContext>>;
  if (transition.profile_snapshot) {
    try {
      const persistedState = mapPersistedState(transition.profile_snapshot);
      persisted = {
        ok: true,
        userId: context.userId,
        state: persistedState,
        stateVersion: persistedState.stateVersion,
      };
    } catch {
      persisted = { ok: false, status: 503, error: "Invalid persisted transition snapshot" };
    }
  } else {
    // Compatibility fallback for a rolling deploy where the API can briefly reach the
    // prior RPC shape. The migrated RPC returns its locked N+1 snapshot directly.
    persisted = await loadRecommendationStateFromContext(request, context);
  }

  if (!persisted.ok) {
    return Response.json(
      {
        error: "Decision was saved, but the updated profile could not be loaded",
        decisionSaved: true,
        stateVersion: currentStateVersion,
      },
      { status: 503 },
    );
  }

  if (persisted.stateVersion !== currentStateVersion) {
    return Response.json(
      {
        error: "Decision was saved, but the persisted revision could not be verified",
        decisionSaved: true,
        stateVersion: currentStateVersion,
      },
      { status: 503 },
    );
  }

  const gameState = persisted.state.user.gameStates[responseGameId] ?? null;
  const profile = persisted.state.user.profile;
  if ((!gameState && action.actionType !== "undo_decision") || !profile) {
    return Response.json(
      {
        error: "Decision was saved, but the updated profile is incomplete",
        decisionSaved: true,
        stateVersion: persisted.stateVersion,
        state: persisted.state,
      },
      { status: 503 },
    );
  }
  const versionedProfile = { ...profile, stateVersion: persisted.stateVersion };

  let recommendationModel: ProductPlayNextModel;
  try {
    recommendationModel = await buildPlayNextModel({
      state: persisted.state,
      stateVersion: persisted.stateVersion,
      userId: persisted.userId,
    });
  } catch (rankingError) {
    captureApiError(rankingError, {
      route: "/api/decisions",
      request,
      operation: "rank_persisted_transition",
      statusCode: 503,
    });
    return Response.json(
      {
        error: "Decision was saved, but recommendations could not be refreshed",
        decisionSaved: true,
        stateVersion: persisted.stateVersion,
        state: persisted.state,
        gameState,
        profile: versionedProfile,
      },
      { status: 503 },
    );
  }

  if (
    recommendationModel.stateVersion !== persisted.stateVersion ||
    recommendationModel.rankingMetadata.profileStateVersion !== persisted.stateVersion
  ) {
    return Response.json(
      {
        error: "Decision was saved, but ranking version verification failed",
        decisionSaved: true,
        stateVersion: persisted.stateVersion,
        state: persisted.state,
        gameState,
        profile: versionedProfile,
      },
      { status: 503 },
    );
  }

  // Snapshot the pre-transition model only after the canonical response has
  // passed its normal consistency checks, so instrumentation never changes a
  // conflict or saved-but-not-ranked product response.
  let recommendationProvenance: { recommendationId: string; rank: number } | null = null;
  if (action.actionType !== "undo_decision") {
    try {
      const beforeModel = await buildPlayNextModel({
        state: loaded.state,
        stateVersion: loaded.stateVersion,
        userId: loaded.userId,
      });
      const candidate = beforeModel.rankingMetadata.candidates.find(
        (entry) => entry.gameId === action.gameId,
      );
      if (candidate) {
        recommendationProvenance = {
          recommendationId: playNextRecommendationId(loaded.stateVersion),
          rank: candidate.rank,
        };
      }
    } catch {
      // Analytics enrichment must never turn an accepted canonical decision
      // into a failed product action.
    }
  }
  if (recommendationProvenance) {
    const { error } = await context.client.rpc("attach_recommendation_provenance", {
      p_user_id: context.userId,
      p_operation_id: action.operationId,
      p_recommendation_id: recommendationProvenance.recommendationId,
      p_rank: recommendationProvenance.rank,
    });
    if (error) {
      captureApiError(error, {
        route: "/api/decisions",
        request,
        operation: "attach_recommendation_provenance",
        statusCode: 500,
      });
    }
  }
  void recordRecommendationGenerated({ context, model: recommendationModel }).catch((error) =>
    captureApiError(error, {
      route: "/api/decisions",
      request,
      operation: "record_recommendation_generated",
      statusCode: 500,
    }),
  );

  const response: ProductCanonicalDecisionResponse = {
    operationId: action.operationId,
    stateVersion: persisted.stateVersion,
    state: persisted.state,
    gameState,
    profile: versionedProfile,
    recommendationModel,
    ...(undoMetadata ? { undo: undoMetadata } : {}),
  };
  return Response.json(response, { status: 200 });
}

export function POST(request: Request) {
  return withApiTiming(request, "/api/decisions", () => postDecision(request));
}
