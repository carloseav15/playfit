import { jsonError } from "@/lib/api-errors";
import { captureApiError } from "@/lib/monitoring";
import { buildPlayNextModel, loadRecommendationState } from "../shared";

export const maxDuration = 30;

async function rejectLegacyPayload(request: Request) {
  const rawBody = await request.text();
  if (!rawBody.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return jsonError("Invalid JSON payload", 400);
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    ("profile" in parsed || "onboarding" in parsed || "gameStates" in parsed)
  ) {
    return jsonError("Recommendations are session-scoped; do not send profile state.", 400);
  }

  return null;
}

export async function POST(request: Request) {
  const payloadError = await rejectLegacyPayload(request);
  if (payloadError) return payloadError;

  const loaded = await loadRecommendationState(request);
  if (!loaded.ok) {
    if (loaded.status === 200) {
      return Response.json({ needsResync: true });
    }
    return jsonError(loaded.error, loaded.status);
  }

  try {
    const model = await buildPlayNextModel({
      state: loaded.state,
      stateVersion: loaded.stateVersion,
      userId: loaded.userId,
    });
    return Response.json(model);
  } catch (error) {
    captureApiError(error, {
      route: "/api/recommendations/today",
      request,
      operation: "build_play_next_model",
      statusCode: 500,
    });
    return jsonError("Failed to score recommendations", 500);
  }
}
