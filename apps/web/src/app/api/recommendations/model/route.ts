import { recommendationModelSchema } from "@/lib/api-contracts";
import { jsonData, jsonError } from "@/lib/api-errors";
import { captureApiError } from "@/lib/monitoring";
import { loadRecommendationState, scoreTodayModel } from "../shared";

export const maxDuration = 30;

export async function POST(request: Request) {
  const loaded = await loadRecommendationState(request);
  if (!loaded.ok) {
    return jsonError(loaded.error, loaded.status);
  }

  try {
    const model = await scoreTodayModel({
      state: loaded.state,
      stateVersion: loaded.stateVersion,
      userId: loaded.userId,
      cacheScope: "model",
    });
    return jsonData(recommendationModelSchema, model);
  } catch (error) {
    captureApiError(error, {
      route: "/api/recommendations/model",
      request,
      operation: "score_today_model",
      statusCode: 500,
    });
    return jsonError("Failed to score recommendations", 500);
  }
}
