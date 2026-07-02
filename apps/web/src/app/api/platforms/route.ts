import { createAnonClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createAnonClient();
    const { data: platforms, error } = await supabase
      .schema("games_library")
      .from("platforms")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const mapped = (platforms ?? []).map((row) => ({
      platformId: row.id,
      displayName: row.name,
      family: row.family,
      kind: row.kind,
      activeStatus: "active",
      sortOrder: row.gen,
    }));

    return Response.json({ platforms: mapped });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
