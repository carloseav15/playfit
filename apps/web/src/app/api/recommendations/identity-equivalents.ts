import type { ProductGameState, ProductPlayStatus, ProductState } from "@playfit/core/types";
import { captureApiError } from "@/lib/monitoring";
import { createAnonClient } from "@/lib/supabase/server";

/**
 * Statuses that already make a game_id ineligible for a *new* Play Next
 * recommendation today (see the nextUp bucket predicates in
 * score_today_recommendations). Mirrors that existing definition rather
 * than inventing a new one -- Game Identity only extends *which ids* this
 * applies to, never *what "already known" means*.
 */
const KNOWN_STATUSES = new Set<ProductPlayStatus>([
  "playing",
  "on_hold",
  "shelved",
  "abandoned",
  "completed",
  "beaten",
]);

function isKnownGameState(record: ProductGameState): boolean {
  return (
    (record.status !== undefined && KNOWN_STATUSES.has(record.status)) ||
    record.excluded === true ||
    record.inWishlist === true ||
    record.inPlayfitPicks === true
  );
}

function collectKnownGameIds(state: ProductState): string[] {
  const known = new Set<string>();
  for (const [gameId, record] of Object.entries(state.user.gameStates)) {
    if (isKnownGameState(record)) known.add(gameId);
  }
  for (const gameId of state.user.onboarding.likedGameIds) known.add(gameId);
  for (const gameId of state.user.onboarding.dislikedGameIds ?? []) known.add(gameId);
  return [...known];
}

interface IdentityEquivalentRow {
  source_game_id: string;
  equivalent_game_id: string;
}

/**
 * Builds a game_states payload for score_today_recommendations that adds
 * confirmed-equivalent-edition ids as excluded=true, alongside every real
 * entry already in state.user.gameStates.
 *
 * This only ever affects RPC candidate eligibility: excluded games never
 * reach the affinity/risk scoring formula for a bucket, and the synthetic
 * entries are never written back anywhere -- they exist only inside the
 * jsonb payload of this one RPC call. Never overrides a game_id that
 * already has a real gameStates entry, so any explicit user state on a
 * specific edition (whatever it is) always wins over identity inference.
 *
 * Returns undefined when there is nothing to add, so callers can fall back
 * to the caller's own state.user.gameStates unchanged.
 */
export async function buildIdentityExpandedGameStates(
  state: ProductState,
): Promise<Record<string, unknown> | undefined> {
  const knownIds = collectKnownGameIds(state);
  if (knownIds.length === 0) return undefined;

  const supabase = createAnonClient();
  const { data, error } = await supabase.rpc("confirmed_identity_equivalents", {
    p_game_ids: knownIds,
  });

  if (error) {
    captureApiError(error, {
      route: "/api/recommendations",
      operation: "confirmed_identity_equivalents",
    });
    return undefined;
  }
  if (!Array.isArray(data) || data.length === 0) return undefined;

  const additions: Record<string, { excluded: true }> = {};
  for (const row of data as IdentityEquivalentRow[]) {
    const equivalentId = row?.equivalent_game_id;
    if (!equivalentId) continue;
    if (state.user.gameStates[equivalentId]) continue;
    additions[equivalentId] = { excluded: true };
  }

  if (Object.keys(additions).length === 0) return undefined;

  return { ...state.user.gameStates, ...additions };
}
