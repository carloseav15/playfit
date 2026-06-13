import type { ProductPlatformOption } from "@playfit/core/types";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local-dev-anon-key";

export async function fetchPlatforms(): Promise<ProductPlatformOption[]> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    db: { schema: "games_library" },
  });
  const { data, error } = await supabase.from("platforms").select("*").order("id");
  if (error) {
    throw new Error(`Failed to load platforms: ${error.message}`);
  }
  return (data ?? []).map((row: Record<string, unknown>) => ({
    platformId: row.id as string,
    displayName: row.name as string,
    family: row.family as string,
    kind: row.kind as ProductPlatformOption["kind"],
    activeStatus: "active" as const,
    sortOrder: row.gen as number,
  }));
}
