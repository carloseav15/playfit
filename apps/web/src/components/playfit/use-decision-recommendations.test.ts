import type { ProductPlayNextModel, RankedSeedGame } from "@playfit/core/types";
import { describe, expect, it } from "vitest";
import {
  updateRecommendationPool,
  visibleRecommendationPool,
} from "./use-decision-recommendations";

function entry(gameId: string): RankedSeedGame {
  return {
    game: {
      gameId,
      title: gameId,
      aliases: [],
      series: "",
      source: "catalog",
      primaryGenre: "action",
      tags: [],
      notes: "",
      coverPath: "",
      availablePlatformIds: [],
      availablePlatformNames: [],
      releaseState: "released",
    },
    affinityScore: 1,
    riskScore: 0,
    confidence: "high",
    fitReasons: [],
    cautionReasons: [],
    platformAvailability: "available",
    accessStatus: "playable",
    inBacklog: false,
    inWishlist: false,
    inPlayfitPicks: false,
    similarGames: [],
  };
}

function model(version: string, ids: string[]): ProductPlayNextModel {
  const entries = ids.map(entry);
  return {
    primary: entries[0] ?? null,
    alternatives: entries.slice(1),
    savedPickIds: [],
    stateVersion: version,
    rankingMetadata: {
      profileStateVersion: version,
      candidates: ids.map((gameId, index) => ({ gameId, rank: index + 1 })),
    },
  };
}

describe("Play Next recommendation pool versions", () => {
  it("replaces the complete N pool with the authoritative N+1 pool", () => {
    const result = updateRecommendationPool({
      previousPool: [entry("old-a"), entry("old-b")],
      previousStateVersion: "8",
      model: model("9", ["new-a", "new-b"]),
    });

    expect(result.map((candidate) => candidate.game.gameId)).toEqual(["new-a", "new-b"]);
  });

  it("only appends unseen candidates while extending the same version", () => {
    const result = updateRecommendationPool({
      previousPool: [entry("same-a")],
      previousStateVersion: "9",
      model: model("9", ["same-a", "same-b"]),
    });

    expect(result.map((candidate) => candidate.game.gameId)).toEqual(["same-a", "same-b"]);
  });

  it("shows no N candidate while the canonical N+1 operation is pending", () => {
    const result = visibleRecommendationPool({
      pool: [entry("old-a"), entry("old-b")],
      excludedIds: new Set(),
      decisionPending: true,
    });

    expect(result).toEqual([]);
  });
});
