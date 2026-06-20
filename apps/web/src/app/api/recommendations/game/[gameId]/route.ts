import { loadRecommendationState, scoreOneGame } from "../../shared";

export const maxDuration = 30;

export async function GET(request: Request, props: { params: Promise<{ gameId: string }> }) {
  const loaded = await loadRecommendationState(request);
  if (!loaded.ok) {
    return Response.json({ error: loaded.error }, { status: loaded.status });
  }

  const { gameId } = await props.params;
  const entry = await scoreOneGame({ gameId, state: loaded.state });
  if (!entry) {
    return Response.json({ error: "Recommendation game not found" }, { status: 404 });
  }

  return Response.json({ entry, stateVersion: loaded.stateVersion });
}
