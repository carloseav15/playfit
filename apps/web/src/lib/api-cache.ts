import { createSupabaseServerClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export async function getCache<T>(key: string, client?: Client): Promise<T | null> {
  try {
    const supabase = client ?? (await createSupabaseServerClient());
    const { data } = await supabase.rpc("get_cache", { p_key: key });
    return (data as T | null) ?? null;
  } catch {
    return null;
  }
}

export async function setCache<T>(
  key: string,
  value: T,
  ttlSeconds = 300,
  client?: Client,
): Promise<void> {
  try {
    const supabase = client ?? (await createSupabaseServerClient());
    await supabase.rpc("set_cache", {
      p_key: key,
      p_value: value as Record<string, unknown>,
      p_ttl_seconds: ttlSeconds,
    });
  } catch {
    // Cache write is best-effort
  }
}
