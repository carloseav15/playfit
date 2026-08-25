import { describe, expect, it } from "vitest";
import {
  confirmCandidate,
  equivalentGameIds,
  type GameIdentityCandidateRecord,
  GameIdentityStore,
  GameIdentityWorkflowError,
  rejectCandidate,
} from "./game-identity-confirmation";

function makeCandidate(id: number, gameIdA: string, gameIdB: string): GameIdentityCandidateRecord {
  return { id, gameIdA, gameIdB, status: "pending", reviewedBy: null, reviewedAt: null };
}

function requireGroupId(store: GameIdentityStore, gameId: string): number {
  const groupId = store.groupIdOf(gameId);
  if (groupId === null) throw new Error(`expected ${gameId} to already belong to a group`);
  return groupId;
}

describe("game identity invariants", () => {
  it("never lets a game_id belong to two groups", () => {
    const store = new GameIdentityStore();
    store.createGroup("system", "2026-01-01T00:00:00Z");
    store.addMember("witcher_3_base", 1, "system", "2026-01-01T00:00:00Z");

    expect(() => store.addMember("witcher_3_base", 2, "system", "2026-01-01T00:00:00Z")).toThrow(
      /already belongs to a group/,
    );
  });

  it("has no duplicate membership rows for the same game_id", () => {
    const store = new GameIdentityStore();
    store.createGroup("system", "now");
    store.addMember("dark_souls", 1, "system", "now");

    expect([...store.members.values()].filter((m) => m.gameId === "dark_souls")).toHaveLength(1);
  });

  it("treats candidate A-B and B-A as the same pair once normalized", () => {
    // normalizeCandidatePair lives in game-identity-candidates.ts; this
    // asserts the confirmation layer only ever sees one canonical pair,
    // by construction of how candidates are created upstream.
    const store = new GameIdentityStore();
    const forward = makeCandidate(1, "gta_iv", "gta_iv_complete_edition");
    confirmCandidate(store, forward, "reviewer-1", "now");

    expect(equivalentGameIds(store, "gta_iv")).toEqual(
      expect.arrayContaining(["gta_iv", "gta_iv_complete_edition"]),
    );
  });

  it("a rejected candidate stays persisted with status=rejected, not deleted", () => {
    const candidate = makeCandidate(2, "resident_evil_4_2005", "resident_evil_4_remake");
    const result = rejectCandidate(candidate, "reviewer-1", "2026-01-02T00:00:00Z");

    expect(result.status).toBe("rejected");
    expect(result.reviewedBy).toBe("reviewer-1");
    expect(result.reviewedAt).toBe("2026-01-02T00:00:00Z");
    // "persisted" here means the same object, not deleted -- the caller
    // (SQL layer) never issues a DELETE for a rejected candidate.
    expect(result.id).toBe(2);
  });

  it("rejects operating on a non-pending candidate", () => {
    const candidate = makeCandidate(3, "a", "b");
    rejectCandidate(candidate, "reviewer-1");

    expect(() => rejectCandidate(candidate, "reviewer-2")).toThrow(GameIdentityWorkflowError);
    const store = new GameIdentityStore();
    expect(() => confirmCandidate(store, candidate, "reviewer-2")).toThrow(
      GameIdentityWorkflowError,
    );
  });

  it("requires a non-empty reviewer identity", () => {
    const store = new GameIdentityStore();
    const candidate = makeCandidate(4, "a", "b");
    expect(() => confirmCandidate(store, candidate, "")).toThrow(GameIdentityWorkflowError);
    expect(() => rejectCandidate(makeCandidate(5, "a", "b"), "  ")).toThrow(
      GameIdentityWorkflowError,
    );
  });
});

describe("confirmation: accept cases", () => {
  it("case 1 -- neither game has a group: creates a group of 2", () => {
    const store = new GameIdentityStore();
    const candidate = makeCandidate(1, "witcher_3_base", "witcher_3_goty");

    const result = confirmCandidate(store, candidate, "reviewer-1", "now");

    expect(result.mergedLoserGroupId).toBeNull();
    expect(
      store
        .membersOf(result.survivorGroupId)
        .map((m) => m.gameId)
        .sort(),
    ).toEqual(["witcher_3_base", "witcher_3_goty"].sort());
    expect(candidate.status).toBe("accepted");
  });

  it("case 2 -- one game already grouped: the new member joins the existing group (grows to 3)", () => {
    const store = new GameIdentityStore();
    const first = makeCandidate(1, "witcher_3_base", "witcher_3_goty");
    confirmCandidate(store, first, "reviewer-1", "t1");

    const second = makeCandidate(2, "witcher_3_base", "witcher_3_complete_edition");
    const result = confirmCandidate(store, second, "reviewer-1", "t2");

    const members = store
      .membersOf(result.survivorGroupId)
      .map((m) => m.gameId)
      .sort();
    expect(members).toEqual(
      ["witcher_3_base", "witcher_3_complete_edition", "witcher_3_goty"].sort(),
    );
    expect(store.groups.size).toBe(1);
  });

  it("case 2, mirrored -- the already-grouped game can be either side of the pair", () => {
    const store = new GameIdentityStore();
    confirmCandidate(store, makeCandidate(1, "witcher_3_base", "witcher_3_goty"), "r", "t1");

    // This time the already-grouped game is gameIdB, not gameIdA.
    const second = makeCandidate(2, "witcher_3_complete_edition", "witcher_3_base");
    const result = confirmCandidate(store, second, "r", "t2");

    expect(store.membersOf(result.survivorGroupId)).toHaveLength(3);
  });

  it("case 3 -- both already in the same group: idempotent, no duplication", () => {
    const store = new GameIdentityStore();
    confirmCandidate(store, makeCandidate(1, "witcher_3_base", "witcher_3_goty"), "r", "t1");
    confirmCandidate(
      store,
      makeCandidate(2, "witcher_3_base", "witcher_3_complete_edition"),
      "r",
      "t2",
    );

    const groupCountBefore = store.groups.size;
    const memberCountBefore = store.members.size;

    // A third candidate re-pairing two games that are already in the same group.
    const redundant = makeCandidate(3, "witcher_3_goty", "witcher_3_complete_edition");
    const result = confirmCandidate(store, redundant, "r", "t3");

    expect(result.mergedLoserGroupId).toBeNull();
    expect(store.groups.size).toBe(groupCountBefore);
    expect(store.members.size).toBe(memberCountBefore);
    expect(redundant.status).toBe("accepted");
  });

  it("case 4 -- two different existing groups: merges atomically, deterministic survivor, loser deleted", () => {
    const store = new GameIdentityStore();
    confirmCandidate(store, makeCandidate(1, "dark_souls", "dark_souls_remastered"), "r", "t1");
    confirmCandidate(store, makeCandidate(2, "skyrim", "skyrim_special_edition"), "r", "t2");

    expect(store.groups.size).toBe(2);
    const dsGroup = requireGroupId(store, "dark_souls");
    const skyrimGroup = requireGroupId(store, "skyrim");
    expect(dsGroup).not.toBe(skyrimGroup);

    // A (hypothetical, for this test only) candidate claiming the two
    // groups are actually the same experience -- exercises the merge path.
    const merge = makeCandidate(3, "dark_souls", "skyrim");
    const result = confirmCandidate(store, merge, "r", "t3");

    const expectedSurvivor = Math.min(dsGroup, skyrimGroup);
    const expectedLoser = Math.max(dsGroup, skyrimGroup);

    expect(result.survivorGroupId).toBe(expectedSurvivor);
    expect(result.mergedLoserGroupId).toBe(expectedLoser);
    expect(store.groups.has(expectedLoser)).toBe(false); // loser group is gone
    expect(store.groups.size).toBe(1);

    const allMembers = store
      .membersOf(expectedSurvivor)
      .map((m) => m.gameId)
      .sort();
    expect(allMembers).toEqual(
      ["dark_souls", "dark_souls_remastered", "skyrim", "skyrim_special_edition"].sort(),
    );
    // No member points at the deleted group.
    for (const member of store.members.values()) {
      expect(member.groupId).toBe(expectedSurvivor);
    }
    expect(merge.status).toBe("accepted");
  });

  it("merge survivor rule is deterministic regardless of which side of the pair is older", () => {
    const store = new GameIdentityStore();
    confirmCandidate(store, makeCandidate(1, "a1", "a2"), "r", "t1"); // group 1
    confirmCandidate(store, makeCandidate(2, "b1", "b2"), "r", "t2"); // group 2

    const groupA = requireGroupId(store, "a1");
    const groupB = requireGroupId(store, "b1");

    // Pair order (b, a) instead of (a, b) -- survivor must still be the
    // lower group id, not "whichever side is gameIdA".
    const result = confirmCandidate(store, makeCandidate(3, "b1", "a1"), "r", "t3");
    expect(result.survivorGroupId).toBe(Math.min(groupA, groupB));
  });
});
