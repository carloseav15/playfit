import { platformsResponseSchema } from "@/lib/api-contracts";
import { getErrorMessage, jsonData, jsonError } from "@/lib/api-errors";
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
      return jsonError(error.message, 500);
    }

    const mapped = (platforms ?? []).map((row) => ({
      platformId: row.id,
      displayName: row.name,
      family: row.family,
      kind: row.kind,
      activeStatus: "active",
      sortOrder: row.gen,
    }));

    return jsonData(platformsResponseSchema, { platforms: mapped });
  } catch (e) {
    return jsonError(getErrorMessage(e, "unknown"), 500);
  }
}
