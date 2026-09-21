import type {
  ProductPlayNextModel,
  ProductTasteActionClientResult,
  RankedSeedGame,
} from "@playfit/core/types";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolveStablePrimaryId,
  updateRecommendationPool,
  useDecisionRecommendations,
  visibleRecommendationPool,
} from "./use-decision-recommendations";

const mocks = vi.hoisted(() => ({
  usePlayNextRecommendations: vi.fn(),
  refreshRecommendations: vi.fn(),
}));

vi.mock("./use-play-next-recommendations", () => ({
  usePlayNextRecommendations: mocks.usePlayNextRecommendations,
}));

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

  it("hides only the candidates the user already decided on", () => {
    const result = visibleRecommendationPool({
      pool: [entry("old-a"), entry("old-b"), entry("old-c")],
      excludedIds: new Set(["old-a"]),
    });

    expect(result.map((candidate) => candidate.game.gameId)).toEqual(["old-b", "old-c"]);
  });
});

describe("resolveStablePrimaryId", () => {
  const pool = [entry("a"), entry("b"), entry("c")];

  it("keeps the candidate the user is looking at while it is still available", () => {
    expect(resolveStablePrimaryId({ pool, excludedIds: new Set(["a"]), currentId: "b" })).toBe("b");
  });

  it("falls back to the first visible candidate when the current one is gone or decided", () => {
    expect(resolveStablePrimaryId({ pool, excludedIds: new Set(["a"]), currentId: "z" })).toBe("b");
    expect(resolveStablePrimaryId({ pool, excludedIds: new Set(["b"]), currentId: "b" })).toBe("a");
  });

  it("returns null when nothing is left to show", () => {
    expect(
      resolveStablePrimaryId({ pool, excludedIds: new Set(["a", "b", "c"]), currentId: "a" }),
    ).toBeNull();
  });
});

describe("optimistic canonical decisions", () => {
  function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((res) => {
      resolve = res;
    });
    return { promise, resolve };
  }

  const okResult = (next: ProductPlayNextModel) =>
    ({
      ok: true,
      canonical: true,
      response: { recommendationModel: next },
    }) as unknown as ProductTasteActionClientResult;

  function setup(initial: ProductPlayNextModel) {
    mocks.usePlayNextRecommendations.mockReturnValue({
      model: initial,
      loading: false,
      refreshing: false,
      loadError: null,
      refreshRecommendations: mocks.refreshRecommendations,
    });
    const pending: Array<{
      resolve: (value: ProductTasteActionClientResult) => void;
      onUndo?: (result: ProductTasteActionClientResult) => void;
    }> = [];
    const applyDecisionFeedback = vi.fn(
      (
        _gameId: string,
        _feedback: string,
        onUndo?: (result: ProductTasteActionClientResult) => void,
      ) => {
        const gate = deferred<ProductTasteActionClientResult>();
        pending.push({ resolve: gate.resolve, onUndo });
        return gate.promise;
      },
    );
    const hook = renderHook(() =>
      useDecisionRecommendations({
        profileReady: true,
        stateVersion: initial.stateVersion,
        saveStatus: "idle",
        applyDecisionFeedback: applyDecisionFeedback as never,
        setPlayfitPick: vi.fn(),
        resetLocalState: vi.fn(),
      }),
    );
    return { hook, pending, applyDecisionFeedback };
  }

  const ids = (hook: ReturnType<typeof setup>["hook"]) =>
    hook.result.current.visiblePool.map((candidate) => candidate.game.gameId);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the next candidate right away and waits for the server in the background", async () => {
    const { hook, pending } = setup(model("1", ["a", "b", "c", "d"]));
    expect(hook.result.current.primary?.game.gameId).toBe("a");

    let decision!: Promise<void>;
    act(() => {
      decision = hook.result.current.handleFeedback(entry("a"), "not_for_me");
    });

    expect(hook.result.current.primary?.game.gameId).toBe("b");
    expect(ids(hook)).toEqual(["b", "c", "d"]);
    expect(hook.result.current.isWaitingForCandidates).toBe(true);

    await act(async () => {
      pending[0].resolve(okResult(model("2", ["b", "c", "d", "e"])));
      await decision;
    });

    expect(hook.result.current.primary?.game.gameId).toBe("b");
    expect(ids(hook)).toEqual(["b", "c", "d", "e"]);
    expect(hook.result.current.isWaitingForCandidates).toBe(false);
  });

  it("does not fall back to the loading screen when the server ranking is newer than the fetched model", async () => {
    const { hook, pending } = setup(model("1", ["a", "b", "c", "d"]));
    expect(hook.result.current.isTransient).toBe(false);

    let decision!: Promise<void>;
    act(() => {
      decision = hook.result.current.handleFeedback(entry("a"), "not_for_me");
    });
    expect(hook.result.current.isTransient).toBe(false);

    await act(async () => {
      pending[0].resolve(okResult(model("2", ["b", "c", "d", "e"])));
      await decision;
    });

    expect(hook.result.current.isTransient).toBe(false);
    expect(hook.result.current.isInitialLoading).toBe(false);
    expect(hook.result.current.primary?.game.gameId).toBe("b");
  });

  it("moves to the first new candidate if the one on screen is gone from the ranking", async () => {
    const { hook, pending } = setup(model("1", ["a", "b", "c"]));
    let decision!: Promise<void>;
    act(() => {
      decision = hook.result.current.handleFeedback(entry("a"), "not_for_me");
    });

    await act(async () => {
      pending[0].resolve(okResult(model("2", ["c", "d"])));
      await decision;
    });

    expect(hook.result.current.primary?.game.gameId).toBe("c");
  });

  it("brings the game back when the decision could not be saved", async () => {
    const { hook, pending } = setup(model("1", ["a", "b", "c"]));
    let decision!: Promise<void>;
    act(() => {
      decision = hook.result.current.handleFeedback(entry("a"), "not_for_me");
    });
    expect(hook.result.current.primary?.game.gameId).toBe("b");

    await act(async () => {
      pending[0].resolve({
        ok: false,
        canonical: true,
        decisionSaved: false,
        error: "Failed to save decision",
      } as unknown as ProductTasteActionClientResult);
      await decision;
    });

    expect(hook.result.current.primary?.game.gameId).toBe("a");
    expect(ids(hook)).toEqual(["a", "b", "c"]);
  });

  it("keeps the game hidden and explains it when only the new ranking is unavailable", async () => {
    const { hook, pending } = setup(model("1", ["a", "b", "c"]));
    let decision!: Promise<void>;
    act(() => {
      decision = hook.result.current.handleFeedback(entry("a"), "not_for_me");
    });

    await act(async () => {
      pending[0].resolve({
        ok: false,
        canonical: true,
        decisionSaved: true,
        stateVersion: "2",
        error: "ranking unavailable",
      } as unknown as ProductTasteActionClientResult);
      await decision;
    });

    expect(hook.result.current.loadError).toContain("Your decision was saved");
    expect(ids(hook)).toEqual([]);
  });

  it("keeps earlier decisions hidden when several are made before the server answers", async () => {
    const { hook, pending } = setup(model("1", ["a", "b", "c", "d"]));
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = hook.result.current.handleFeedback(entry("a"), "not_for_me");
    });
    act(() => {
      second = hook.result.current.handleFeedback(entry("b"), "not_for_me");
    });
    expect(hook.result.current.primary?.game.gameId).toBe("c");

    await act(async () => {
      pending[0].resolve(okResult(model("2", ["b", "c", "d", "e"])));
      await first;
    });

    expect(hook.result.current.primary?.game.gameId).toBe("c");
    expect(ids(hook)).toEqual(["c", "d", "e"]);
    expect(hook.result.current.isWaitingForCandidates).toBe(true);

    await act(async () => {
      pending[1].resolve(okResult(model("3", ["c", "d", "e", "f"])));
      await second;
    });

    expect(ids(hook)).toEqual(["c", "d", "e", "f"]);
    expect(hook.result.current.isWaitingForCandidates).toBe(false);
  });

  it("puts the game back in front when the decision is undone", async () => {
    const { hook, pending } = setup(model("1", ["a", "b", "c"]));
    let decision!: Promise<void>;
    act(() => {
      decision = hook.result.current.handleFeedback(entry("a"), "not_for_me");
    });
    await act(async () => {
      pending[0].resolve(okResult(model("2", ["b", "c", "d"])));
      await decision;
    });
    expect(ids(hook)).toEqual(["b", "c", "d"]);

    act(() => {
      pending[0].onUndo?.(okResult(model("3", ["a", "b", "c"])));
    });

    expect(hook.result.current.primary?.game.gameId).toBe("a");
    expect(ids(hook)).toEqual(["a", "b", "c"]);
  });
});
