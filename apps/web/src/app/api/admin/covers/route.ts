import { NextRequest, NextResponse } from "next/server";

import { createServiceRoleClient } from "@/lib/supabase/server";

function isAuthorized(req: NextRequest) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) return false;
  return req.headers.get("x-admin-secret") === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const offset = Number(req.nextUrl.searchParams.get("offset") ?? "0");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? "50"), 100);
  const source = req.nextUrl.searchParams.get("source");

  const supabase = createServiceRoleClient();
  let query = supabase
    .from("cover_review_queue")
    .select("game_id, title, cover_url, metacritic_score, max_platform_gen, platform_names", {
      count: "exact",
    })
    .order("metacritic_score", { ascending: false, nullsFirst: false })
    .order("max_platform_gen", { ascending: false, nullsFirst: false })
    .order("game_id", { ascending: true })
    .range(offset, offset + limit - 1);

  if (source) {
    query = query.ilike("cover_url", `%${source}%`);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [], total: count ?? null });
}

export async function PATCH(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const gameId = body?.gameId;
  if (typeof gameId !== "string" || !gameId) {
    return NextResponse.json({ error: "gameId is required" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();

  const { data: existing, error: fetchError } = await supabase
    .from("games")
    .select("cover_url")
    .eq("game_id", gameId)
    .single();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const { error } = await supabase
    .from("games")
    .update({ cover_url: "", previous_cover_url: existing?.cover_url || null })
    .eq("game_id", gameId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
