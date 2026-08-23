import { describe, expect, it } from "vitest";
import {
  buildCandidateImportRows,
  chunkCandidateImportRows,
} from "./game-identity-candidate-import";
import type { GameIdentityCandidateDraft } from "./game-identity-candidates";

function draft(
  gameIdA: string,
  gameIdB: string,
  overrides: Partial<GameIdentityCandidateDraft> = {},
): GameIdentityCandidateDraft {
  return {
    gameIdA,
    gameIdB,
    confidence: "high",
    source: "heuristic-v1",
    evidence: {
      matchedKeyword: "remaster",
      matchType: "exact_title_after_strip",
      titleSimilarity: 1,
      strippedTitle: gameIdA,
      seriesMatch: null,
      yearKnownBothSides: false,
      yearOrderValid: null,
      gameIdA,
      titleA: gameIdA,
      gameIdB,
      titleB: gameIdB,
    },
    ...overrides,
  };
}

describe("buildCandidateImportRows", () => {
  it("maps each field the RPC expects, one row per candidate", () => {
    const rows = buildCandidateImportRows([
      draft("game_a", "game_b", { confidence: "medium", source: "heuristic-v1" }),
    ]);
    expect(rows).toEqual([
      {
        game_id_a: "game_a",
        game_id_b: "game_b",
        confidence: "medium",
        evidence: rows[0].evidence,
        source: "heuristic-v1",
      },
    ]);
  });

  it("never includes a status field -- the RPC always inserts as pending", () => {
    const [row] = buildCandidateImportRows([draft("game_a", "game_b")]);
    expect(row).not.toHaveProperty("status");
  });

  it("preserves candidate order and count", () => {
    const candidates = [draft("a1", "a2"), draft("b1", "b2"), draft("c1", "c2")];
    const rows = buildCandidateImportRows(candidates);
    expect(rows.map((r) => [r.game_id_a, r.game_id_b])).toEqual([
      ["a1", "a2"],
      ["b1", "b2"],
      ["c1", "c2"],
    ]);
  });

  it("returns an empty array for an empty input", () => {
    expect(buildCandidateImportRows([])).toEqual([]);
  });
});

describe("chunkCandidateImportRows", () => {
  it("splits rows into fixed-size batches without losing or duplicating any", () => {
    const rows = Array.from({ length: 389 }, (_, i) => i);
    const batches = chunkCandidateImportRows(rows, 200);
    expect(batches).toHaveLength(2);
    expect(batches[0]).toHaveLength(200);
    expect(batches[1]).toHaveLength(189);
    expect(batches.flat()).toEqual(rows);
  });

  it("returns one batch when the input is smaller than the batch size", () => {
    const rows = [1, 2, 3];
    expect(chunkCandidateImportRows(rows, 200)).toEqual([[1, 2, 3]]);
  });

  it("returns an empty array for empty input, not a batch of zero rows", () => {
    expect(chunkCandidateImportRows([], 200)).toEqual([]);
  });

  it("treats a batch size of zero or less as a single unbounded batch", () => {
    const rows = [1, 2, 3];
    expect(chunkCandidateImportRows(rows, 0)).toEqual([[1, 2, 3]]);
    expect(chunkCandidateImportRows(rows, -5)).toEqual([[1, 2, 3]]);
  });

  it("handles an exact multiple of the batch size without a trailing empty batch", () => {
    const rows = Array.from({ length: 400 }, (_, i) => i);
    const batches = chunkCandidateImportRows(rows, 200);
    expect(batches).toHaveLength(2);
    expect(batches.every((b) => b.length === 200)).toBe(true);
  });
});
