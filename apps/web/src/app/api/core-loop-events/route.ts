import { coreLoopClientEventSchema, playNextRecommendationId } from "@/lib/core-loop-analytics";
import { jsonError } from "@/lib/api-errors";
import { captureApiError, withApiTiming } from "@/lib/monitoring";
import { createRequestSupabaseContext } from "@/lib/supabase/server";
import { buildPlayNextModel, loadRecommendationStateFromContext } from "../recommendations/shared";

async function postCoreLoopEvent(request: Request) {
  const context = await createRequestSupabaseContext(request);
  if (!context) return jsonError("Authentication required", 401);
  const parsed = coreLoopClientEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError("Invalid core-loop event", 400);
  const event = parsed.data;

  const loaded = await loadRecommendationStateFromContext(request, context);
  if (!loaded.ok) return jsonError(loaded.error, loaded.status);
  if (event.stateVersion !== loaded.stateVersion || event.recommendationId !== playNextRecommendationId(event.stateVersion)) {
    return jsonError("Stale recommendation event", 409);
  }

  try {
    const model = await buildPlayNextModel({
      state: loaded.state,
      stateVersion: loaded.stateVersion,
      userId: loaded.userId,
    });
    const candidate = model.rankingMetadata.candidates.find(
      (value) => value.gameId === event.gameId && value.rank === event.rank,
    );
    if (!candidate) return jsonError("Recommendation provenance is invalid", 409);

    const { error } = await context.client.rpc("record_client_core_loop_event", {
      p_user_id: context.userId,
      p_event_id: event.eventId,
      p_event_name: event.eventName,
      p_client_platform: event.clientPlatform,
      p_recommendation_id: event.recommendationId,
      p_state_version: Number(event.stateVersion),
      p_game_id: event.gameId,
      p_rank: event.rank,
    });
    if (error) throw error;
    return new Response(null, { status: 204 });
  } catch (error) {
    captureApiError(error, {
      route: "/api/core-loop-events",
      request,
      operation: "record_client_core_loop_event",
      statusCode: 500,
    });
    return jsonError("Failed to record core-loop event", 500);
  }
}

export function POST(request: Request) {
  return withApiTiming(request, "/api/core-loop-events", () => postCoreLoopEvent(request));
}
