import { jsonError } from "@/lib/api-errors";
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
    return Response.json(model);
  } catch {
    return jsonError("Failed to score recommendations", 500);
  }
}
