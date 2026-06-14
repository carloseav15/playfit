import {
  productGameStateSchema,
  productProfileSchema,
  productStateSchema,
} from "@playfit/core/schemas";
import { z } from "zod";

import { isValidDeviceId } from "@/lib/device-id";
import { createAnonClient } from "@/lib/supabase/server";

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

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

function createClient() {
  return createAnonClient();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

async function fireMigrateProfile(
  fromUserId: string,
  toUserId: string,
  onboarding: Record<string, unknown>,
) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/migrate-profile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fromUserId, toUserId, onboarding }),
    });
  } catch {
    // Edge Function is best-effort; migration will retry on next profile save
  }
}

async function checkRateLimit(request: Request, userId?: string | null): Promise<boolean> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const client = await createClient();
  const { data, error } = await client.rpc("check_rate_limit", {
    p_ip_address: ip,
    p_endpoint: "/api/profile",
    p_max_requests: RATE_LIMIT_MAX,
    p_window_seconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    p_user_id: userId ?? null,
  });

  if (error) {
    console.error("checkRateLimit error:", error);
    return false;
  }

  return data === true;
}

async function getUserId(request: Request): Promise<string | null> {
  try {
    const serverSupabase = await createClient();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();
    if (user?.id) return user.id;
  } catch (e) {
    console.error("getUserId (cookie) error:", e);
  }

  const authHeader = request.headers.get("authorization");
  const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return null;

  try {
    const serverSupabase = await createClient();
    const { data } = await serverSupabase.auth.getUser(jwt);
    if (data?.user?.id) return data.user.id;
  } catch (e) {
    console.error("getUserId (bearer) error:", e);
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const userId = await getUserId(request);
    if (!(await checkRateLimit(request, userId))) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }
    const deviceId = new URL(request.url).searchParams.get("device_id");
    if (deviceId && !isValidDeviceId(deviceId)) {
      return Response.json({ error: "Invalid device identifier" }, { status: 400 });
    }
    const resolvedId = userId ?? deviceId;

    if (!resolvedId) {
      return Response.json({ state: null }, { status: 200 });
    }

    const client = await createClient();
    const { data, error } = await client.rpc("get_profile", {
      p_user_id: resolvedId,
    });

    if (error || !data) {
      // Fallback: authenticated user with no profile, try device migration
      if (userId && deviceId && deviceId !== userId) {
        const { data: deviceData } = await client.rpc("get_profile", {
          p_user_id: deviceId,
        });
        if (deviceData) {
          return Response.json({ state: deviceData }, { status: 200 });
        }
      }
      return Response.json({ state: null }, { status: 200 });
    }

    return Response.json({ state: data }, { status: 200 });
  } catch (e) {
    console.error("GET /api/profile error:", e);
    return Response.json({ error: "Failed to load profile" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getUserId(request);
    if (!(await checkRateLimit(request, userId))) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const parsedBody = profileSaveRequestSchema.safeParse(rawBody);
    if (!parsedBody.success) {
      return Response.json(
        { error: "Invalid profile payload", issues: parsedBody.error.issues },
        { status: 400 },
      );
    }

    const body = parsedBody.data;
    const resolvedId = userId ?? body.deviceId;
    if (!resolvedId) {
      return Response.json({ error: "No user identifier" }, { status: 400 });
    }

    const client = await createClient();

    // Protection A: reject empty overwrite of existing data
    const isEmptySave = Object.keys(body.gameStates).length === 0 && body.profile === null;
    if (isEmptySave && userId) {
      const { data: existing } = await client.rpc("get_profile", {
        p_user_id: userId,
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
          return Response.json(
            { error: "Cannot overwrite non-empty profile with empty data" },
            { status: 400 },
          );
        }
      }
    }

    // Protection B: migrate anonymous device profile to authenticated user
    if (userId && body.deviceId && body.deviceId !== userId) {
      const { data: authProfile } = await client.rpc("get_profile", {
        p_user_id: userId,
      });
      const authParsed = authProfile as {
        game_states?: Record<string, unknown>;
        profile?: unknown;
      } | null;
      const isAuthEmpty =
        !authParsed ||
        (Object.keys(authParsed.game_states ?? {}).length === 0 && !authParsed.profile);

      if (isAuthEmpty) {
        const { data: deviceProfile } = await client.rpc("get_profile", {
          p_user_id: body.deviceId,
        });
        const deviceParsed = deviceProfile as {
          game_states?: Record<string, unknown>;
          profile?: unknown;
        } | null;

        if (
          deviceParsed &&
          (Object.keys(deviceParsed.game_states ?? {}).length > 0 || deviceParsed.profile !== null)
        ) {
          void fireMigrateProfile(body.deviceId, userId, body.onboarding);
          return Response.json({ ok: true, migrated: true }, { status: 200 });
        }
      }
    }

    const { error } = await client.rpc("upsert_profile", {
      p_user_id: resolvedId,
      p_game_states: body.gameStates,
      p_profile: body.profile,
      p_onboarding: body.onboarding,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await client
      .schema("games_library")
      .from("audit_log")
      .insert({
        user_id: userId ?? resolvedId,
        action: "profile.write",
        ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      })
      .maybeSingle();

    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("POST /api/profile error:", e);
    return Response.json({ error: "Failed to save profile" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = await getUserId(request);
    if (!(await checkRateLimit(request, userId))) {
      return Response.json({ error: "Too many requests" }, { status: 429 });
    }

    const deviceId = new URL(request.url).searchParams.get("device_id");
    if (deviceId && !isValidDeviceId(deviceId)) {
      return Response.json({ error: "Invalid device identifier" }, { status: 400 });
    }
    const resolvedId = userId ?? deviceId;

    if (!resolvedId) {
      return Response.json({ error: "No user identifier" }, { status: 400 });
    }

    const client = await createClient();

    await client
      .schema("games_library")
      .from("audit_log")
      .insert({
        user_id: userId ?? resolvedId,
        action: "profile.delete",
        ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      })
      .maybeSingle();

    const { error } = await client.rpc("delete_profile", { p_user_id: resolvedId });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("DELETE /api/profile error:", e);
    return Response.json({ error: "Failed to reset profile" }, { status: 500 });
  }
}
