import { scoreSeedGame } from "@playfit/core/domain";
import type { RankedSeedGame, SeedGame } from "@playfit/core/types";
import { getCache, setCache } from "@/lib/api-cache";
import { jsonError } from "@/lib/api-errors";
import { captureApiError } from "@/lib/monitoring";
import { buildStateForScoring, fetchFullGamesById, loadRecommendationState } from "../shared";

const PICKS_CACHE_TTL = 300;

export async function GET(request: Request) {
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

  const cacheKey = `recs:picks:${loaded.userId}:${pickIds.join(",")}`;
  const cached = await getCache<RankedSeedGame[]>(cacheKey);
  if (cached) return Response.json(cached);

  try {
    const gamesById = await fetchFullGamesById(pickIds);
    const scoringState = buildStateForScoring(loaded.state, profile, loaded.state.user.onboarding);

    const picks: RankedSeedGame[] = pickIds
      .map((id) => gamesById.get(id))
      .filter((g): g is SeedGame => !!g)
      .map((game) => scoreSeedGame(game, scoringState, profile))
      .sort((a, b) => b.affinityScore - a.affinityScore);

    void setCache(cacheKey, picks, PICKS_CACHE_TTL);

    return Response.json(picks);
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
