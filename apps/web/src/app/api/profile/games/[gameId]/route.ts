import { isValidDeviceId } from "@/lib/device-id";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;

async function createClient() {
  return createSupabaseServerClient();
}

async function checkRateLimit(request: Request): Promise<boolean> {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const client = await createClient();
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();

  const { count } = await client
    .schema("games_library")
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("ip_address", ip)
    .eq("endpoint", "/api/profile/games")
    .gte("requested_at", windowStart);

  if (count && count >= RATE_LIMIT_MAX) return false;

  await client.schema("games_library").from("rate_limits").insert({
    ip_address: ip,
    endpoint: "/api/profile/games",
  });

  return true;
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
      p_excluded: body.excluded ?? null,
      p_source: body.source ?? "manual",
    });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch {
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
  } catch {
    return Response.json({ error: "Failed to delete game state" }, { status: 500 });
  }
}
