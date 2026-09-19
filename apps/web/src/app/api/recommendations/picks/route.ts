import type { RankedSeedGame } from "@playfit/core/types";
import { getCache, setCache } from "@/lib/api-cache";
import { picksResponseSchema } from "@/lib/api-contracts";
import { jsonData, jsonError } from "@/lib/api-errors";
import { captureApiError, withApiTiming } from "@/lib/monitoring";
import { loadRecommendationState, RECOMMENDATION_MODEL_VERSION, scoreGamesByIds } from "../shared";

const PICKS_CACHE_TTL = 300;

async function getPicks(request: Request) {
  const loaded = await loadRecommendationState(request);
  if (!loaded.ok) {
    return jsonError(loaded.error, loaded.status);
  }

  const profile = loaded.state.user.profile;
  if (!profile || !loaded.state.user.onboardingCompletedAt) {
    return Response.json([]);
  }

  const pickIds = Object.entries(loaded.state.user.gameStates)
    .filter(
      ([, gs]) =>
        gs.inPlayfitPicks &&
        !gs.excluded &&
        gs.status !== "completed" &&
        gs.status !== "beaten" &&
        gs.status !== "abandoned",
    )
    .map(([id]) => id)
    .sort();

  if (pickIds.length === 0) {
    return Response.json([]);
  }

  const cacheKey = `recs:picks:${loaded.userId}:${loaded.stateVersion}:${RECOMMENDATION_MODEL_VERSION}:${pickIds.join(",")}`;
  const cached = await getCache<RankedSeedGame[]>(cacheKey);
  if (cached) return jsonData(picksResponseSchema, cached);

  try {
    const picks = (await scoreGamesByIds(pickIds, loaded.state)).sort(
      (a, b) =>
        b.affinityScore - a.affinityScore ||
        a.riskScore - b.riskScore ||
        a.game.gameId.localeCompare(b.game.gameId),
    );

    void setCache(cacheKey, picks, PICKS_CACHE_TTL);

    return jsonData(picksResponseSchema, picks);
  } catch (error) {
    captureApiError(error, {
      route: "/api/recommendations/picks",
      request,
      operation: "score_picks",
      statusCode: 500,
    });
    return jsonError("Failed to score picks", 500);
  }
}

export function GET(request: Request) {
  return withApiTiming(request, "/api/recommendations/picks", () => getPicks(request));
}
