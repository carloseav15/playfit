import { createRequestSupabaseContext, type RequestSupabaseContext } from "@/lib/supabase/server";

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
    p_endpoint: "/api/profile/games",
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
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }
  if (result === "error") {
    return Response.json({ error: "Rate limiter unavailable" }, { status: 503 });
  }
  return null;
}

export async function PATCH(request: Request, props: { params: Promise<{ gameId: string }> }) {
  try {
    const context = await createRequestSupabaseContext(request);
    if (!context) return Response.json({ error: "Authentication required" }, { status: 401 });

    const rateLimitError = rateLimitFailure(
      await checkRateLimit(context.client, request, context.userId),
    );
    if (rateLimitError) return rateLimitError;

    const { gameId } = await props.params;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    const body = rawBody as Record<string, unknown>;

    const { error } = await context.client.rpc("upsert_game_state", {
      p_user_id: context.userId,
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
  try {
    const context = await createRequestSupabaseContext(request);
    if (!context) return Response.json({ error: "Authentication required" }, { status: 401 });

    const rateLimitError = rateLimitFailure(
      await checkRateLimit(context.client, request, context.userId),
    );
    if (rateLimitError) return rateLimitError;

    const { gameId } = await props.params;

    const { error } = await context.client.rpc("delete_game_state", {
      p_user_id: context.userId,
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
