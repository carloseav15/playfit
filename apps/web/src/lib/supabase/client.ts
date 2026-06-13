"use client";

import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "local-dev-anon-key";

export const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: "games_library" },
});
