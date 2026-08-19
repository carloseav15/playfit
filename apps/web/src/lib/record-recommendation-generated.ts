import { playNextRecommendationId } from "@/lib/core-loop-analytics";
import type { RequestSupabaseContext } from "@/lib/supabase/server";
import type { ProductPlayNextModel } from "@playfit/core/types";

export async function recordRecommendationGenerated({
  context,
  model,
}: {
  context: RequestSupabaseContext;
  model: ProductPlayNextModel;
}) {
  const primary = model.primary;
  if (!primary) return;
  await context.client.rpc("record_recommendation_generated", {
    p_user_id: context.userId,
    p_state_version: Number(model.stateVersion),
    p_recommendation_id: playNextRecommendationId(model.stateVersion),
    p_primary_game_id: primary.game.gameId,
    p_rank: 1,
  });
}
