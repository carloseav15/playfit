import { productStateSchema } from "@playfit/core/schemas";
import type { ProductProfile, ProductState } from "@playfit/core/types";
import { createRequestSupabaseContext } from "@/lib/supabase/server";

export const PRODUCT_STATE_VERSION = 2;

export interface PersistedProfilePayload {
  game_states?: Record<string, unknown>;
  profile?: unknown;
  onboarding?: {
    step?: unknown;
    platforms?: unknown;
    likedGameIds?: unknown;
    dislikedGameIds?: unknown;
    onboardingCompletedAt?: unknown;
  };
  created_at?: string | null;
  updated_at?: string | null;
}

export type LoadedRecommendationState =
  | {
      ok: true;
      userId: string;
      state: ProductState;
      stateVersion: string;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

function simpleHash(data: unknown): string {
  const json = JSON.stringify(data);
  let hash = 5381;
  for (let i = 0; i < json.length; i++) {
    hash = (hash << 5) + hash + json.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function mapPersistedState(data: PersistedProfilePayload): ProductState {
  const mapped: ProductState = {
    version: PRODUCT_STATE_VERSION,
    user: {
      onboarding: {
        step:
          data.onboarding?.step === "anchors" || data.onboarding?.step === "dislikes"
            ? data.onboarding.step
            : "platforms",
        platforms: Array.isArray(data.onboarding?.platforms) ? data.onboarding.platforms : [],
        likedGameIds: Array.isArray(data.onboarding?.likedGameIds)
          ? data.onboarding.likedGameIds
          : [],
        dislikedGameIds: Array.isArray(data.onboarding?.dislikedGameIds)
          ? data.onboarding.dislikedGameIds
          : [],
      },
      onboardingCompletedAt:
        typeof data.onboarding?.onboardingCompletedAt === "string"
          ? data.onboarding.onboardingCompletedAt
          : null,
      profile: (data.profile ?? null) as ProductProfile | null,
      gameStates: (data.game_states ?? {}) as ProductState["user"]["gameStates"],
      lastUpdatedAt: data.updated_at ?? data.created_at ?? null,
    },
  };

  const parsed = productStateSchema.safeParse(mapped);
  if (!parsed.success) {
    throw new Error("Invalid persisted recommendation state");
  }
  return parsed.data;
}

export function computeStateVersion(data: PersistedProfilePayload, state: ProductState) {
  return (
    data.updated_at ??
    data.created_at ??
    simpleHash({
      onboarding: state.user.onboarding,
      onboardingCompletedAt: state.user.onboardingCompletedAt,
      profile: state.user.profile,
      gameStates: state.user.gameStates,
    })
  );
}

export async function loadRecommendationState(
  request: Request,
): Promise<LoadedRecommendationState> {
  const context = await createRequestSupabaseContext(request);
  if (!context) {
    return { ok: false, status: 401, error: "Recommendation session required" };
  }

  const { data, error } = await context.client.rpc("get_profile", {
    p_user_id: context.userId,
  });
  if (error) {
    return { ok: false, status: 500, error: "Failed to load recommendation state" };
  }

  if (!data) {
    return { ok: false, status: 200, error: "needs_resync" };
  }

  try {
    const payload = data as PersistedProfilePayload;
    const state = mapPersistedState(payload);
    return {
      ok: true,
      userId: context.userId,
      state,
      stateVersion: computeStateVersion(payload, state),
    };
  } catch {
    return { ok: false, status: 500, error: "Invalid recommendation state" };
  }
}
