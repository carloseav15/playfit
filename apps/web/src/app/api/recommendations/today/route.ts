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
  RankedSeedGame,
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

function computeRecsCacheKey(profile: ProductProfile, onboarding: ProductOnboardingDraft): string {
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
    v: DB_VERSION,
  };
  return `recs:today:${simpleHash(relevantData)}`;
}

function extractScoredGames(model: ProductTodayModel): RankedSeedGame[] {
  const seen = new Set<string>();
  const all: RankedSeedGame[] = [];
  for (const entry of [...model.currentRun, ...model.nextUp, ...model.resume, ...model.picks]) {
    if (!seen.has(entry.game.gameId)) {
      seen.add(entry.game.gameId);
      all.push(entry);
    }
  }
  return all;
}

const terminalStatuses = new Set(["completed", "beaten", "abandoned"]);

function rebucketModel(
  cached: ProductTodayModel,
  gameStates: Record<string, ProductGameState>,
  onboarding: ProductOnboardingDraft,
): ProductTodayModel {
  const scoredGames = extractScoredGames(cached);
  const onboardingIds = new Set([
    ...onboarding.likedGameIds,
    ...(onboarding.dislikedGameIds ?? []),
  ]);

  const currentRun: RankedSeedGame[] = [];
  const nextUp: RankedSeedGame[] = [];
  const resume: RankedSeedGame[] = [];
  const picks: RankedSeedGame[] = [];

  for (const entry of scoredGames) {
    const gs = gameStates[entry.game.gameId];
    const status = gs?.status;
    const excluded = gs?.excluded ?? false;
    const inWishlist = gs?.inWishlist ?? false;
    const inPlayfitPicks = gs?.inPlayfitPicks ?? false;

    if (excluded) continue;
    if (onboardingIds.has(entry.game.gameId)) continue;

    const modelEntry = { ...entry, inWishlist, inPlayfitPicks };

    if (status === "playing") {
      currentRun.push(modelEntry);
      continue;
    }

    if (inPlayfitPicks && entry.accessStatus === "playable") {
      picks.push(modelEntry);
      continue;
    }

    if ((status === "on_hold" || status === "shelved") && entry.accessStatus === "playable") {
      resume.push(modelEntry);
      continue;
    }

    if (
      entry.accessStatus === "playable" &&
      entry.riskScore < 58 &&
      status !== "on_hold" &&
      status !== "shelved" &&
      !terminalStatuses.has(status ?? "") &&
      !inWishlist &&
      !inPlayfitPicks
    ) {
      nextUp.push(modelEntry);
    }
  }

  const affinityDesc = (a: RankedSeedGame, b: RankedSeedGame) => b.affinityScore - a.affinityScore;
  const confidenceSort = (a: RankedSeedGame, b: RankedSeedGame) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.confidence] ?? 2) - (order[b.confidence] ?? 2);
  };

  currentRun.sort((a, b) => {
    const d = b.affinityScore - a.affinityScore;
    if (d !== 0) return d;
    return a.riskScore - b.riskScore;
  });

  nextUp.sort(affinityDesc);

  resume.sort(affinityDesc);

  picks.sort((a, b) => {
    const d = b.affinityScore - a.affinityScore;
    if (d !== 0) return d;
    const r = a.riskScore - b.riskScore;
    if (r !== 0) return r;
    return confidenceSort(a, b);
  });

  return {
    currentRun: currentRun.slice(0, 100),
    nextUp: nextUp.slice(0, 100),
    resume: resume.slice(0, 100),
    picks: picks.slice(0, 100),
  };
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

  const recsCacheKey = computeRecsCacheKey(profile, onboarding);

  const cachedModel = await getCache<ProductTodayModel>(recsCacheKey, supabase);
  if (cachedModel) {
    if (debug) {
      console.log(JSON.stringify({ stage: "recsCacheHit", cacheKey: recsCacheKey }));
    }
    return Response.json(rebucketModel(cachedModel, gameStates, onboarding));
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

  let data: unknown;
  let error: { message?: string } | null = null;
  try {
    const result = await supabase.rpc("score_today_recommendations", {
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
    data = result.data;
    error = result.error;
  } catch (rpcError) {
    if (debug) {
      const message = rpcError instanceof Error ? rpcError.message : "unknown rpc failure";
      console.log(JSON.stringify({ stage: "scoreRpcException", error: message }));
    }
    return Response.json({ error: "Failed to score recommendations" }, { status: 500 });
  }

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
