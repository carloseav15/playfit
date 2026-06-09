import { resolve } from "node:path";
import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

loadEnvConfig(resolve(process.cwd(), "../.."));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function createSupabaseAdminClient() {
  if (!SUPABASE_SERVICE_KEY) {
    throw new Error("SUPABASE_SERVICE_KEY is required for profile API routes.");
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    db: { schema: "games_library" },
  });
}

// Simple in-memory rate limiter: max 30 requests per minute per IP
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW = 60_000;

function checkRateLimit(request: Request): boolean {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW;

  const timestamps = rateLimitMap.get(ip) ?? [];
  const recent = timestamps.filter((t) => t > windowStart);
  recent.push(now);
  rateLimitMap.set(ip, recent);

  // Prune stale entries periodically
  if (rateLimitMap.size > 10_000) {
    for (const [key, ts] of rateLimitMap) {
      if (ts.filter((t) => t > Date.now() - RATE_LIMIT_WINDOW).length === 0) {
        rateLimitMap.delete(key);
      }
    }
  }

  return recent.length <= RATE_LIMIT_MAX;
}

async function getUserId(request: Request): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  const jwt = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!jwt) return null;

  const supabase = createClient(
    SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local-dev-anon-key",
    {
      db: { schema: "games_library" },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );

  const { data } = await supabase.auth.getUser(jwt);
  if (data?.user?.id) return data.user.id;

  return null;
}

export async function GET(request: Request) {
  if (!checkRateLimit(request)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }
  try {
    const userId = await getUserId(request);
    const deviceId = new URL(request.url).searchParams.get("device_id");
    const resolvedId = userId ?? deviceId;

    if (!resolvedId) {
      return Response.json({ state: null }, { status: 200 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin
      .schema("games_library")
      .from("profiles")
      .select("game_states, profile, onboarding, created_at")
      .eq("user_id", resolvedId)
      .single();

    if (error || !data) {
      return Response.json({ state: null }, { status: 200 });
    }

    return Response.json({ state: data }, { status: 200 });
  } catch {
    return Response.json({ error: "Failed to load profile" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!checkRateLimit(request)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }
  try {
    const userId = await getUserId(request);
    const body = await request.json();
    const resolvedId = userId ?? body.deviceId;

    if (!resolvedId) {
      return Response.json({ error: "No user identifier" }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin.schema("games_library").from("profiles").upsert(
      {
        user_id: resolvedId,
        game_states: body.gameStates,
        profile: body.profile,
        onboarding: body.onboarding,
      },
      { onConflict: "user_id" },
    );

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch {
    return Response.json({ error: "Failed to save profile" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!checkRateLimit(request)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }
  try {
    const userId = await getUserId(request);
    const deviceId = new URL(request.url).searchParams.get("device_id");
    const resolvedId = userId ?? deviceId;

    if (!resolvedId) {
      return Response.json({ error: "No user identifier" }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { error } = await supabaseAdmin
      .schema("games_library")
      .from("profiles")
      .delete()
      .eq("user_id", resolvedId);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true }, { status: 200 });
  } catch {
    return Response.json({ error: "Failed to reset profile" }, { status: 500 });
  }
}
