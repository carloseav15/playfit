import { getCachedAuthUserId, loadProductStateOrNull, setCachedAuth } from "@playfit/core/store";
import type { ProductState } from "@playfit/core/types";
import { supabase } from "@/lib/supabase/client";

const PREFETCH_TTL_MS = 15_000;

type PrefetchMap = {
  state: Promise<ProductState | null>;
  today: Promise<Response>;
};

type Entry<K extends keyof PrefetchMap> = {
  promise: PrefetchMap[K];
  userId: string;
  startedAt: number;
};

const entries: { [K in keyof PrefetchMap]?: Entry<K> } = {};
let started = false;

export async function startStartupPrefetch({
  includeToday,
  headers = {},
}: {
  includeToday: boolean;
  headers?: Record<string, string>;
}) {
  if (started || typeof window === "undefined") return;
  started = true;

  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session?.user) return;

    setCachedAuth(session.access_token ?? null, session.user.id);
    const startedAt = Date.now();
    const userId = session.user.id;

    entries.state = { promise: loadProductStateOrNull(), userId, startedAt };
    if (includeToday) {
      entries.today = {
        promise: fetch("/api/recommendations/today", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${session.access_token}`,
            ...headers,
          },
        }),
        userId,
        startedAt,
      };
    }
    for (const entry of Object.values(entries)) entry?.promise.catch(() => undefined);
  } catch {
    started = false;
  }
}

export function takeStartupPrefetch<K extends keyof PrefetchMap>(kind: K): PrefetchMap[K] | null {
  const entry = entries[kind] as Entry<K> | undefined;
  delete entries[kind];
  if (!entry) return null;
  if (Date.now() - entry.startedAt > PREFETCH_TTL_MS) return null;
  if (entry.userId !== getCachedAuthUserId()) return null;
  return entry.promise;
}

export function resetStartupPrefetch() {
  delete entries.state;
  delete entries.today;
  started = false;
}
