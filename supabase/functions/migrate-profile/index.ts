import { createClient } from "jsr:@supabase/supabase-js@2";

interface MigrateRequest {
  fromUserId: string;
  toUserId: string;
  onboarding: Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "content-type": "application/json" },
      });
    }

    let body: MigrateRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    if (!body.fromUserId || !body.toUserId) {
      return new Response(
        JSON.stringify({ error: "fromUserId and toUserId are required" }),
        { status: 400, headers: { "content-type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      db: { schema: "games_library" },
    });

    const { error: migrateError } = await supabase.rpc("migrate_profile", {
      p_from_user_id: body.fromUserId,
      p_to_user_id: body.toUserId,
      p_onboarding: body.onboarding,
    });

    if (migrateError) {
      return new Response(JSON.stringify({ error: "Migration failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    const { error: deleteError } = await supabase.rpc("delete_profile", {
      p_user_id: body.fromUserId,
    });

    if (deleteError) {
      return new Response(JSON.stringify({ error: "Cleanup failed" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
