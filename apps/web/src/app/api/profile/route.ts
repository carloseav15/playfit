import {
  productGameStateSchema,
  productProfileSchema,
  productStateSchema,
} from "@playfit/core/schemas";
import { z } from "zod";

import { jsonError } from "@/lib/api-errors";
import { createRequestSupabaseContext, type RequestSupabaseContext } from "@/lib/supabase/server";

const persistedOnboardingSchema = productStateSchema.shape.user.shape.onboarding.extend({
  onboardingCompletedAt: z.string().nullable(),
});

const profileSaveRequestSchema = z
  .object({
    deviceId: z.string().min(1).optional(),
    gameStates: z.record(z.string(), productGameStateSchema),
    profile: productProfileSchema.nullable(),
    onboarding: persistedOnboardingSchema,
  })
  .strict();

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

type RateLimitResult = "allowed" | "limited" | "error";

async function checkRateLimit(
  client: RequestSupabaseContext["client"],
  request: Request,
  userId: string,
): Promise<RateLimitResult> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const { data, error } = await client.rpc("check_rate_limit", {
    p_ip_address: ip,
    p_endpoint: "/api/profile",
    p_max_requests: RATE_LIMIT_MAX,
    p_window_seconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    p_user_id: userId,
  });

  if (error) {
    console.error("checkRateLimit error:", error);
    return "error";
  }

  if (data === true) return "allowed";
  if (data === false) return "limited";
  return "error";
}

function rateLimitFailure(result: RateLimitResult): Response | null {
  if (result === "limited") {
    return jsonError("Too many requests", 429);
  }
  if (result === "error") {
    return jsonError("Rate limiter unavailable", 503);
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const context = await createRequestSupabaseContext(request);
    if (!context) return jsonError("Authentication required", 401);

    const rateLimitError = rateLimitFailure(
      await checkRateLimit(context.client, request, context.userId),
    );
    if (rateLimitError) return rateLimitError;

    const { data, error } = await context.client.rpc("get_profile", {
      p_user_id: context.userId,
    });

    if (error) {
      console.error("get_profile error:", error);
      return jsonError("Failed to load profile", 500);
    }

    if (!data) {
      return Response.json({ state: null }, { status: 200 });
    }

    return Response.json({ state: data }, { status: 200 });
  } catch (e) {
    console.error("GET /api/profile error:", e);
    return jsonError("Failed to load profile", 500);
  }
}

export async function POST(request: Request) {
  try {
    const context = await createRequestSupabaseContext(request);
    if (!context) return jsonError("Authentication required", 401);

    const rateLimitError = rateLimitFailure(
      await checkRateLimit(context.client, request, context.userId),
    );
    if (rateLimitError) return rateLimitError;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return jsonError("Invalid JSON payload", 400);
    }

    const parsedBody = profileSaveRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return Response.json(
        { error: "Invalid profile payload", issues: parsedBody.error.issues },
        { status: 400 },
      );
    }

    const body = parsedBody.data;

    // Protection A: reject empty overwrite of existing data
    const isEmptySave = Object.keys(body.gameStates).length === 0 && body.profile === null;
    if (isEmptySave) {
      const { data: existing } = await context.client.rpc("get_profile", {
        p_user_id: context.userId,
      });
      if (existing) {
        const parsed = existing as {
          game_states?: Record<string, unknown>;
          profile?: unknown;
        };
        if (
          (parsed.game_states && Object.keys(parsed.game_states).length > 0) ||
          parsed.profile !== null
        ) {
          return jsonError("Cannot overwrite non-empty profile with empty data", 400);
        }
      }
    }

    const { error } = await context.client.rpc("upsert_profile", {
      p_user_id: context.userId,
      p_game_states: body.gameStates,
      p_profile: body.profile,
      p_onboarding: body.onboarding,
    });

    if (error) {
      return jsonError(error.message, 500);
    }

    await context.client
      .schema("games_library")
      .from("audit_log")
      .insert({
        user_id: context.userId,
        action: "profile.write",
        ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      })
      .maybeSingle();

    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("POST /api/profile error:", e);
    return jsonError("Failed to save profile", 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await createRequestSupabaseContext(request);
    if (!context) return jsonError("Authentication required", 401);

    const rateLimitError = rateLimitFailure(
      await checkRateLimit(context.client, request, context.userId),
    );
    if (rateLimitError) return rateLimitError;

    await context.client
      .schema("games_library")
      .from("audit_log")
      .insert({
        user_id: context.userId,
        action: "profile.delete",
        ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      })
      .maybeSingle();

    const { error } = await context.client.rpc("delete_profile", {
      p_user_id: context.userId,
    });

    if (error) {
      return jsonError(error.message, 500);
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("DELETE /api/profile error:", e);
    return jsonError("Failed to reset profile", 500);
  }
}
