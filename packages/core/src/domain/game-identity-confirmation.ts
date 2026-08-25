// Pure, in-memory model of the confirm/reject/merge algorithm implemented
// by the games_library_private.confirm_game_identity_candidate() and
// reject_game_identity_candidate() SQL functions (see the migration under
// supabase/migrations for the authoritative, transactional version).
//
// Why this exists as TypeScript too: the SQL functions are the real,
// production mechanism, but this module lets the merge algorithm itself --
// which case applies, which group survives, how membership is reassigned --
// be exercised with fast, deterministic unit tests without a live Postgres
// instance. The SQL function is a deliberately literal transliteration of
// the logic below (same branching, same survivor rule); this module is not
// a fallback implementation and is not called from any script or API path.

export type GameIdentityCandidateStatus = "pending" | "accepted" | "rejected";

export interface GameIdentityGroup {
  id: number;
  createdAt: string;
  createdBy: string;
}

export interface GameIdentityGroupMember {
  gameId: string;
  groupId: number;
  addedAt: string;
  addedBy: string;
}

export interface GameIdentityCandidateRecord {
  id: number;
  gameIdA: string;
  gameIdB: string;
  status: GameIdentityCandidateStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

// In-memory stand-in for the two confirmed tables. Mutated in place by
// confirmCandidate/rejectCandidate, mirroring how the SQL functions mutate
// the real tables in one transaction.
export class GameIdentityStore {
  private nextGroupId = 1;
  groups = new Map<number, GameIdentityGroup>();
  members = new Map<string, GameIdentityGroupMember>(); // keyed by gameId -- mirrors the PK choice

  createGroup(createdBy: string, now: string): GameIdentityGroup {
    const group: GameIdentityGroup = { id: this.nextGroupId++, createdAt: now, createdBy };
    this.groups.set(group.id, group);
    return group;
  }

  addMember(gameId: string, groupId: number, addedBy: string, now: string) {
    if (this.members.has(gameId)) {
      throw new Error(
        `invariant violation: game_id ${gameId} already belongs to a group (attempted to add to ${groupId})`,
      );
    }
    this.members.set(gameId, { gameId, groupId, addedAt: now, addedBy });
  }

  membersOf(groupId: number): GameIdentityGroupMember[] {
    return [...this.members.values()].filter((m) => m.groupId === groupId);
  }

  groupIdOf(gameId: string): number | null {
    return this.members.get(gameId)?.groupId ?? null;
  }
}

export class GameIdentityWorkflowError extends Error {}

function requireReviewer(reviewedBy: string) {
  if (!reviewedBy || reviewedBy.trim() === "") {
    throw new GameIdentityWorkflowError("reviewedBy is required");
  }
}

function requirePending(candidate: GameIdentityCandidateRecord) {
  if (candidate.status !== "pending") {
    throw new GameIdentityWorkflowError(
      `candidate ${candidate.id} is not pending (status=${candidate.status})`,
    );
  }
}

export interface ConfirmResult {
  survivorGroupId: number;
  mergedLoserGroupId: number | null;
  candidate: GameIdentityCandidateRecord;
}

// Mirrors games_library_private.confirm_game_identity_candidate(). Mutates
// `store` and `candidate` in place; returns the survivor group id and,
// when a merge happened, the id of the group that was deleted.
export function confirmCandidate(
  store: GameIdentityStore,
  candidate: GameIdentityCandidateRecord,
  reviewedBy: string,
  now: string = new Date().toISOString(),
): ConfirmResult {
  requireReviewer(reviewedBy);
  requirePending(candidate);

  const groupA = store.groupIdOf(candidate.gameIdA);
  const groupB = store.groupIdOf(candidate.gameIdB);
  let survivorGroupId: number;
  let mergedLoserGroupId: number | null = null;

  if (groupA === null && groupB === null) {
    // Case 1: neither side belongs to a group -- create one with both.
    const group = store.createGroup(reviewedBy, now);
    survivorGroupId = group.id;
    store.addMember(candidate.gameIdA, survivorGroupId, reviewedBy, now);
    store.addMember(candidate.gameIdB, survivorGroupId, reviewedBy, now);
  } else if (groupA !== null && groupB === null) {
    // Case 2: A is grouped, B joins A's group.
    survivorGroupId = groupA;
    store.addMember(candidate.gameIdB, survivorGroupId, reviewedBy, now);
  } else if (groupA === null && groupB !== null) {
    // Case 2, mirrored: B is grouped, A joins B's group.
    survivorGroupId = groupB;
    store.addMember(candidate.gameIdA, survivorGroupId, reviewedBy, now);
  } else if (groupA === groupB) {
    // Case 3: both already in the same group -- idempotent, nothing to do.
    survivorGroupId = groupA as number;
  } else {
    // Case 4: both exist in two different groups -- merge. Deterministic
    // survivor rule: the lower group id wins (== the older group, since
    // group ids are allocated in creation order). Documented and tested
    // explicitly so the rule can never silently change.
    const a = groupA as number;
    const b = groupB as number;
    survivorGroupId = Math.min(a, b);
    mergedLoserGroupId = Math.max(a, b);

    for (const member of store.membersOf(mergedLoserGroupId)) {
      store.members.set(member.gameId, {
        gameId: member.gameId,
        groupId: survivorGroupId,
        addedAt: now,
        addedBy: reviewedBy,
      });
    }
    store.groups.delete(mergedLoserGroupId);
  }

  candidate.status = "accepted";
  candidate.reviewedBy = reviewedBy;
  candidate.reviewedAt = now;

  return { survivorGroupId, mergedLoserGroupId, candidate };
}

// Mirrors games_library_private.reject_game_identity_candidate(). Never
// touches `store` -- rejection is purely a candidate-table state change,
// by design (see restriction: "NO tocar grupos confirmados").
export function rejectCandidate(
  candidate: GameIdentityCandidateRecord,
  reviewedBy: string,
  now: string = new Date().toISOString(),
): GameIdentityCandidateRecord {
  requireReviewer(reviewedBy);
  requirePending(candidate);

  candidate.status = "rejected";
  candidate.reviewedBy = reviewedBy;
  candidate.reviewedAt = now;
  return candidate;
}

// Read-only helper mirroring games_library_private.game_identity_group_members():
// given a known game_id, return every game_id equivalent to it (including
// itself), via the confirmed tables only. Returns just the game's own id
// (a group of one) when it has no confirmed group -- this function never
// reads game_identity_candidate.
export function equivalentGameIds(store: GameIdentityStore, gameId: string): string[] {
  const groupId = store.groupIdOf(gameId);
  if (groupId === null) return [gameId];
  return store.membersOf(groupId).map((m) => m.gameId);
}
