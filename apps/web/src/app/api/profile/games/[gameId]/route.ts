import { isValidDeviceId } from "@/lib/device-id";
import { createAnonClient } from "@/lib/supabase/server";

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

function createClient() {
  return createAnonClient();
}

async function checkRateLimit(request: Request): Promise<boolean> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const client = await createClient();
  const { data, error } = await client.rpc("check_rate_limit", {
    p_ip_address: ip,
    p_endpoint: "/api/profile/games",
    p_max_requests: RATE_LIMIT_MAX,
    p_window_seconds: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
    p_user_id: null,
  });

  if (error) {
    console.error("checkRateLimit error:", error);
    return false;
  }

  return data === true;
}

async function getUserId(request: Request): Promise<string | null> {
  const serverSupabase = await createClient();
  const {
    data: { user },
  } = await serverSupabase.auth.getUser();
  if (user?.id) return user.id;

  const authHeader = request.headers.get("authorization");
  const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!jwt) return null;

  const { data } = await serverSupabase.auth.getUser(jwt);
  if (data?.user?.id) return data.user.id;

  return null;
}

export async function PATCH(request: Request, props: { params: Promise<{ gameId: string }> }) {
  if (!(await checkRateLimit(request))) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  const { gameId } = await props.params;

  try {
    const userId = await getUserId(request);
    const deviceId = new URL(request.url).searchParams.get("device_id");
    if (deviceId && !isValidDeviceId(deviceId)) {
      return Response.json({ error: "Invalid device identifier" }, { status: 400 });
    }
    const resolvedId = userId ?? deviceId;

    if (!resolvedId) {
      return Response.json({ error: "No user identifier" }, { status: 400 });
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const body = rawBody as Record<string, unknown>;

    const client = await createClient();
    const { error } = await client.rpc("upsert_game_state", {
      p_user_id: resolvedId,
      p_game_id: gameId,
      p_status: body.status ?? null,
      p_rating: body.rating ?? null,
      p_in_backlog: body.inBacklog ?? null,
      p_in_wishlist: body.inWishlist ?? null,
      p_in_playfit_picks: body.inPlayfitPicks ?? null,
      p_excluded: body.excluded ?? null,
      p_source: body.source ?? "manual",
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("PATCH /api/profile/games error:", e);
    return Response.json({ error: "Failed to update game state" }, { status: 500 });
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ gameId: string }> }) {
  if (!(await checkRateLimit(request))) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  const { gameId } = await props.params;

  try {
    const userId = await getUserId(request);
    const deviceId = new URL(request.url).searchParams.get("device_id");
    if (deviceId && !isValidDeviceId(deviceId)) {
      return Response.json({ error: "Invalid device identifier" }, { status: 400 });
    }
    const resolvedId = userId ?? deviceId;

    if (!resolvedId) {
      return Response.json({ error: "No user identifier" }, { status: 400 });
    }

    const client = await createClient();
    const { error } = await client.rpc("delete_game_state", {
      p_user_id: resolvedId,
      p_game_id: gameId,
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch (e) {
    console.error("DELETE /api/profile/games error:", e);
    return Response.json({ error: "Failed to delete game state" }, { status: 500 });
  }
}
