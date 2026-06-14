import type { ProductPlatformOption } from "@playfit/core/types";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function fetchPlatforms(): Promise<ProductPlatformOption[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/platforms?select=*&order=id.asc`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      "Accept-Profile": "games_library",
    },
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Failed to load platforms: ${text}`);
  }
  const data = (await res.json()) as Record<string, unknown>[];
  return data.map((row) => ({
    platformId: row.id as string,
    displayName: row.name as string,
    family: row.family as string,
    kind: row.kind as ProductPlatformOption["kind"],
    activeStatus: "active" as const,
    sortOrder: row.gen as number,
  }));
}
