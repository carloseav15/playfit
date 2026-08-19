import { authenticatedFetch } from "@playfit/core/store";
import { playNextRecommendationId } from "@/lib/core-loop-analytics";

const STABLE_EVENT_ID_PREFIX = "playfit_core_loop_event_id:";

/**
 * A page reload mints a fresh component tree, so an in-memory dedup guard
 * (e.g. the shown-keys ref in decision-shell.tsx) cannot prevent a reload
 * from re-firing this event for the same logical exposure. Deriving the
 * eventId from the exposure identity itself (event name + stateVersion +
 * gameId + rank), persisted across reloads, lets the server's
 * (user_id, event_key) dedup absorb the resend instead of inserting a
 * second row for one exposure. This mirrors the stable per-key id iOS
 * (UserDefaults) and Android (DataStore) already persist.
 */
function stableEventId(key: string): string {
  try {
    const storageKey = STABLE_EVENT_ID_PREFIX + key;
    const existing = window.localStorage.getItem(storageKey);
    if (existing) return existing;
    const generated = crypto.randomUUID();
    window.localStorage.setItem(storageKey, generated);
    return generated;
  } catch {
    return crypto.randomUUID();
  }
}

export function recordRecommendationClientEvent({
  eventName,
  stateVersion,
  gameId,
  rank,
}: {
  eventName: "recommendation_shown" | "recommendation_skipped" | "recommendation_saved";
  stateVersion: string;
  gameId: string;
  rank: number;
}) {
  const key = `${eventName}:${stateVersion}:${gameId}:${rank}`;
  void authenticatedFetch("/api/core-loop-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      eventId: stableEventId(key),
      eventName,
      clientPlatform: "web" as const,
      recommendationId: playNextRecommendationId(stateVersion),
      stateVersion,
      gameId,
      rank,
    }),
  }).catch(() => undefined);
}
