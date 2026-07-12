import {
  productGameStateSchema,
  productProfileSchema,
  productStateSchema,
} from "@playfit/core/schemas";
import { cookies } from "next/headers";
import { z } from "zod";

import { jsonError } from "@/lib/api-errors";
import { captureApiError } from "@/lib/monitoring";
import { RETURNING_VISITOR_COOKIE } from "@/lib/returning-visitor";
import { createRequestSupabaseContext, type RequestSupabaseContext } from "@/lib/supabase/server";

// Best-effort: this cookie only smooths out repeat visits to the marketing landing page.
// It must never take down the actual profile save/delete on a request context that
// doesn't support writing cookies (or in tests, where next/headers isn't mocked).
async function markReturningVisitor() {
  try {
    const cookieStore = await cookies();
    cookieStore.set(RETURNING_VISITOR_COOKIE, "1", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  } catch {
    // no-op
  }
}

async function clearReturningVisitor() {
  try {
    const cookieStore = await cookies();
    // `.delete(name)` only clears a cookie whose path matches the default ("/" here, since
    // that's what markReturningVisitor sets) — passing the same options explicitly avoids
    // relying on that default matching by coincidence.
    cookieStore.delete({ name: RETURNING_VISITOR_COOKIE, path: "/" });
  } catch {
    // no-op
  }
}

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
    captureApiError(error, {
      route: "/api/profile",
      request,
      operation: "check_rate_limit",
      statusCode: 503,
    });
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
      captureApiError(error, {
        route: "/api/profile",
        request,
        operation: "get_profile",
        statusCode: 500,
      });
      return jsonError("Failed to load profile", 500);
    }

    if (!data) {
      return Response.json({ state: null }, { status: 200 });
    }

    return Response.json({ state: data }, { status: 200 });
  } catch (e) {
    captureApiError(e, {
      route: "/api/profile",
      request,
      operation: "GET",
      statusCode: 500,
    });
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
      captureApiError(error, {
        route: "/api/profile",
        request,
        operation: "upsert_profile",
        statusCode: 500,
      });
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

    await markReturningVisitor();

    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    captureApiError(e, {
      route: "/api/profile",
      request,
      operation: "POST",
      statusCode: 500,
    });
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
      captureApiError(error, {
        route: "/api/profile",
        request,
        operation: "delete_profile",
        statusCode: 500,
      });
      return jsonError(error.message, 500);
    }

    await clearReturningVisitor();

    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    captureApiError(e, {
      route: "/api/profile",
      request,
      operation: "DELETE",
      statusCode: 500,
    });
    return jsonError("Failed to reset profile", 500);
  }
}
