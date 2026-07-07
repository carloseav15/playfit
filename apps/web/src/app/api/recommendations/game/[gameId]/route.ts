import { jsonError } from "@/lib/api-errors";
import { loadRecommendationState, scoreOneGame } from "../../shared";

export const maxDuration = 30;

export async function GET(request: Request, props: { params: Promise<{ gameId: string }> }) {
  const loaded = await loadRecommendationState(request);
  if (!loaded.ok) {
    return jsonError(loaded.error, loaded.status);
  }

  const { gameId } = await props.params;
  const entry = await scoreOneGame({ gameId, state: loaded.state });
  if (!entry) {
    return jsonError("Recommendation game not found", 404);
  }

  return Response.json({ entry, stateVersion: loaded.stateVersion });
}
