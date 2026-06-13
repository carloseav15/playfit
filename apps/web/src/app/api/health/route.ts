import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    const supabase = await createSupabaseServerClient();
    const { count, error } = await supabase
      .schema("games_library")
      .from("games")
      .select("*", { count: "exact", head: true });

    if (error) {
      checks.database = `error: ${error.message}`;
      healthy = false;
    } else {
      checks.database = `connected (${count?.toLocaleString() ?? "?"} games)`;
    }
  } catch (e) {
    checks.database = `error: ${e instanceof Error ? e.message : "unknown"}`;
    healthy = false;
  }

  return Response.json({
    ok: healthy,
    app: "playfit",
    timestamp: new Date().toISOString(),
    checks,
  });
}
