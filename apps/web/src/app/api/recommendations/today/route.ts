import { buildDislikedTagsFromProfile, buildLikedTagsFromProfile } from "@playfit/core/domain";
import {
  productGameStateSchema,
  productProfileSchema,
  productStateSchema,
} from "@playfit/core/schemas";
import type {
  ProductGameState,
  ProductOnboardingDraft,
  ProductProfile,
  ProductTodayModel,
} from "@playfit/core/types";
import { z } from "zod";
import { getCache, setCache } from "@/lib/api-cache";
import { createAnonClient } from "@/lib/supabase/server";

const todayRequestSchema = z
  .object({
    profile: productProfileSchema,
    gameStates: z.record(z.string(), productGameStateSchema),
    onboarding: productStateSchema.shape.user.shape.onboarding,
  })
  .strict();

type TodayRequest = z.infer<typeof todayRequestSchema>;

const DB_VERSION = 3;
const RECS_CACHE_TTL = 3600;
const debug = process.env.NODE_ENV === "development";

function simpleHash(data: unknown): string {
  const json = JSON.stringify(data);
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = (hash << 5) + hash + json.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function computeRecsCacheKey(
  profile: ProductProfile,
  gameStates: Record<string, ProductGameState>,
  onboarding: ProductOnboardingDraft,
): string {
  const relevantData = {
    lT: profile.likedTags,
    dT: profile.dislikedTags,
    lG: profile.likedGenres,
    aG: profile.avoidedGenres,
    rC: profile.ratedCount,
    p: onboarding.platforms
      .map((p) => `${p.platformId}:${p.status}`)
      .sort()
      .join(","),
    gs: Object.entries(gameStates)
      .map(
        ([id, s]) =>
          `${id}:${s.status ?? ""}:${s.excluded ? "x" : ""}:${s.inWishlist ? "w" : ""}:${s.inPlayfitPicks ? "p" : ""}`,
      )
      .sort()
      .join(","),
    v: DB_VERSION,
  };
  return `recs:today:${simpleHash(relevantData)}`;
}

export const maxDuration = 30;

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const parsedBody = todayRequestSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return Response.json(
      { error: "Invalid recommendations payload", issues: parsedBody.error.issues },
      { status: 400 },
    );
  }

  const body: TodayRequest = parsedBody.data;
  const { profile, gameStates, onboarding } = body;

  const supabase = createAnonClient();

  const recsCacheKey = computeRecsCacheKey(profile, gameStates, onboarding);

  const cachedModel = await getCache<ProductTodayModel>(recsCacheKey, supabase);
  if (cachedModel) {
    if (debug) {
      console.log(JSON.stringify({ stage: "recsCacheHit", cacheKey: recsCacheKey }));
    }
    return Response.json(cachedModel);
  }

  if (debug) {
    console.log(
      JSON.stringify({
        stage: "recommendations/today.cacheMiss",
        cacheKey: recsCacheKey,
        hasProfile: !!profile,
        onboardingPlatforms: onboarding?.platforms?.length ?? 0,
        likedGames: onboarding?.likedGameIds?.length ?? 0,
        dislikedGames: onboarding?.dislikedGameIds?.length ?? 0,
        gameStatesCount: Object.keys(gameStates ?? {}).length,
      }),
    );
  }

  const likedTags = buildLikedTagsFromProfile(profile);
  const dislikedTags = buildDislikedTagsFromProfile(profile);

  const accessiblePlatformIds = onboarding.platforms
    .filter((p) => p.status === "available" || p.status === "limited")
    .map((p) => p.platformId);

  const { data, error } = await supabase.rpc("score_today_recommendations", {
    p_liked_tags: likedTags as Record<string, number>,
    p_disliked_tags: dislikedTags as Record<string, number>,
    p_liked_genres: profile.likedGenres,
    p_avoided_genres: profile.avoidedGenres,
    p_rated_count: profile.ratedCount,
    p_accessible_platform_ids: accessiblePlatformIds,
    p_onboarding_liked_ids: onboarding.likedGameIds,
    p_onboarding_disliked_ids: onboarding.dislikedGameIds ?? [],
    p_game_states: gameStates as Record<string, unknown>,
  });

  if (error) {
    if (debug) {
      console.log(JSON.stringify({ stage: "scoreRpcError", error: error.message }));
    }
    return Response.json({ error: "Failed to score recommendations" }, { status: 500 });
  }

  const model = data as unknown as ProductTodayModel;

  void setCache(recsCacheKey, model, RECS_CACHE_TTL, supabase);

  return Response.json(model);
}
