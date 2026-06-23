import { buildPlayNextModel, loadRecommendationState } from "../shared";

export const maxDuration = 30;

async function rejectLegacyPayload(request: Request) {
  const rawBody = await request.text();
  if (!rawBody.trim()) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (
    parsed &&
    typeof parsed === "object" &&
    ("profile" in parsed || "onboarding" in parsed || "gameStates" in parsed)
  ) {
    return Response.json(
      { error: "Recommendations are session-scoped; do not send profile state." },
      { status: 400 },
    );
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
    return Response.json({ error: loaded.error }, { status: loaded.status });
  }

  try {
    const model = await buildPlayNextModel({
      state: loaded.state,
      stateVersion: loaded.stateVersion,
      userId: loaded.userId,
    });
    return Response.json(model);
  } catch {
    return Response.json({ error: "Failed to score recommendations" }, { status: 500 });
  }
}
