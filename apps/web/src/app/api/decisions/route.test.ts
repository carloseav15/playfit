import {
  applyProductStartedAction,
  applyProductTasteAction,
  buildAdaptiveProfile,
} from "@playfit/core/domain";
import type {
  ProductPlayNextModel,
  ProductProfile,
  ProductState,
  ProductTasteActionType,
  SeedGame,
} from "@playfit/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContext: vi.fn(),
  rpc: vi.fn(),
  loadState: vi.fn(),
  fetchGames: vi.fn(),
  buildModel: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestSupabaseContext: mocks.createContext,
}));

vi.mock("../recommendations/shared", () => ({
  loadRecommendationStateFromContext: mocks.loadState,
  fetchFullGamesById: mocks.fetchGames,
  buildPlayNextModel: mocks.buildModel,
}));

const userId = "550e8400-e29b-41d4-a716-446655440000";
const operationId = "660e8400-e29b-41d4-a716-446655440000";
const undoOperationId = "770e8400-e29b-41d4-a716-446655440000";
const client = { rpc: mocks.rpc };

const game: SeedGame = {
  gameId: "hades",
  title: "Hades",
  aliases: [],
  series: "Hades",
  source: "catalog",
  primaryGenre: "action",
  genreId: "action",
  tags: ["roguelike"],
  notes: "",
  coverPath: "",
  availablePlatformIds: ["switch"],
  availablePlatformNames: ["Switch"],
  releaseState: "released",
};

const profile: ProductProfile = {
  summary: "Likes action games.",
  likedGenres: ["action"],
  avoidedGenres: [],
  likedTags: { roguelike: 2 },
  dislikedTags: {},
  ratedCount: 3,
  signals: [],
};

function state(version: string): ProductState {
  return {
    version: 2,
    stateVersion: version,
    user: {
      onboarding: {
        step: "dislikes",
        platforms: [{ platformId: "switch", status: "available" }],
        likedGameIds: [],
        dislikedGameIds: [],
      },
      onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
      profile: structuredClone(profile),
      gameStates: {},
      lastUpdatedAt: "2026-01-01T00:00:00.000Z",
    },
  };
}

function rankedModel(version: string): ProductPlayNextModel {
  return {
    primary: null,
    alternatives: [],
    savedPickIds: [],
    stateVersion: version,
    rankingMetadata: { profileStateVersion: version, candidates: [] },
  };
}

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function request(actionType: ProductTasteActionType, played?: boolean) {
  return new Request("http://playfit.test/api/decisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operationId,
      expectedStateVersion: "5",
      actionType,
      gameId: game.gameId,
      played,
    }),
  });
}

function startedRequest() {
  return new Request("http://playfit.test/api/decisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operationId,
      expectedStateVersion: "5",
      actionType: "started",
      gameId: game.gameId,
    }),
  });
}

function undoRequest(expectedStateVersion = "6") {
  return new Request("http://playfit.test/api/decisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      operationId: undoOperationId,
      expectedStateVersion,
      actionType: "undo_decision",
      targetOperationId: operationId,
    }),
  });
}

function persistedSnapshot(value: ProductState) {
  return {
    game_states: value.user.gameStates,
    profile: value.user.profile,
    onboarding: {
      ...value.user.onboarding,
      onboardingCompletedAt: value.user.onboardingCompletedAt,
    },
    state_version: value.stateVersion,
    updated_at: value.user.lastUpdatedAt,
  };
}

describe("canonical decision API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createContext.mockResolvedValue({ client, userId });
    mocks.fetchGames.mockResolvedValue(new Map([[game.gameId, game]]));
    mocks.rpc.mockResolvedValue({ data: { status: "applied", state_version: 6 }, error: null });
    mocks.buildModel.mockResolvedValue(rankedModel("6"));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["not_for_me", undefined, 2, true, undefined],
    ["loved", undefined, 5, false, undefined],
    ["liked", true, 4, false, "completed"],
    ["mixed", true, 3, false, "completed"],
    ["dropped", true, 2, true, "abandoned"],
  ] as const)("persists and ranks canonical %s against the incremented version", async (actionType, played, rating, excluded, status) => {
    const before = state("5");
    const after = structuredClone(before);
    applyProductTasteAction({
      state: after,
      game,
      gamesById: new Map([[game.gameId, game]]),
      actionType,
      played,
      timestamp: "2026-01-02T00:00:00.000Z",
    });
    after.stateVersion = "6";
    mocks.loadState
      .mockResolvedValueOnce({ ok: true, userId, state: before, stateVersion: "5" })
      .mockResolvedValueOnce({ ok: true, userId, state: after, stateVersion: "6" });

    const { POST } = await loadRoute();
    const response = await POST(request(actionType, played));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stateVersion).toBe("6");
    expect(body.gameState).toMatchObject({ rating, excluded });
    if (status) expect(body.gameState.status).toBe(status);
    expect(body.profile.stateVersion).toBe("6");
    expect(body.recommendationModel.stateVersion).toBe("6");
    expect(body.recommendationModel.rankingMetadata.profileStateVersion).toBe("6");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_profile_transition",
      expect.objectContaining({
        p_expected_state_version: "5",
        p_operation_id: operationId,
        p_game_id: game.gameId,
        p_game_states: expect.objectContaining({
          hades: expect.objectContaining({ rating }),
        }),
      }),
    );
    expect(mocks.buildModel).toHaveBeenCalledWith({
      state: after,
      stateVersion: "6",
      userId,
    });
  });

  it("keeps the profile semantics unchanged for canonical Mixed while advancing N+1", async () => {
    const before = state("5");
    before.user.profile = buildAdaptiveProfile(
      before.user.onboarding,
      new Map([[game.gameId, game]]),
      before.user.gameStates,
    );
    const after = structuredClone(before);
    applyProductTasteAction({
      state: after,
      game,
      gamesById: new Map([[game.gameId, game]]),
      actionType: "mixed",
      played: true,
      timestamp: "2026-01-02T00:00:00.000Z",
    });
    after.stateVersion = "6";
    mocks.loadState
      .mockResolvedValueOnce({ ok: true, userId, state: before, stateVersion: "5" })
      .mockResolvedValueOnce({ ok: true, userId, state: after, stateVersion: "6" });

    const { POST } = await loadRoute();
    const response = await POST(request("mixed", true));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.gameState).toMatchObject({ status: "completed", rating: 3, excluded: false });
    expect(body.profile).toEqual({ ...before.user.profile, stateVersion: "6" });
    expect(body.recommendationModel.rankingMetadata.profileStateVersion).toBe("6");
  });

  it("persists Started at N+1 without rebuilding taste evidence", async () => {
    const before = state("5");
    before.user.gameStates[game.gameId] = {
      gameId: game.gameId,
      title: game.title,
      inBacklog: true,
      inWishlist: false,
      inPlayfitPicks: true,
      excluded: true,
      source: "manual",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const after = structuredClone(before);
    applyProductStartedAction({ state: after, game, timestamp: "2026-01-02T00:00:00.000Z" });
    after.stateVersion = "6";
    mocks.loadState
      .mockResolvedValueOnce({ ok: true, userId, state: before, stateVersion: "5" })
      .mockResolvedValueOnce({ ok: true, userId, state: after, stateVersion: "6" });

    const { POST } = await loadRoute();
    const response = await POST(startedRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.gameState).toMatchObject({
      status: "playing",
      inBacklog: false,
      inPlayfitPicks: false,
      excluded: false,
    });
    expect(body.gameState.rating).toBeUndefined();
    expect(body.profile).toEqual({ ...before.user.profile, stateVersion: "6" });
    expect(body.recommendationModel.stateVersion).toBe("6");
    expect(mocks.rpc).toHaveBeenCalledWith(
      "apply_profile_transition",
      expect.objectContaining({
        p_operation_fingerprint: JSON.stringify({ actionType: "started", gameId: game.gameId }),
      }),
    );
  });

  it("returns a stale-version conflict without ranking or overwriting", async () => {
    mocks.loadState.mockResolvedValueOnce({
      ok: true,
      userId,
      state: state("5"),
      stateVersion: "5",
    });
    mocks.rpc.mockResolvedValueOnce({
      data: { status: "conflict", state_version: 7 },
      error: null,
    });
    const { POST } = await loadRoute();

    const response = await POST(request("not_for_me"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      conflict: true,
      needsResync: true,
      currentStateVersion: "7",
    });
    expect(mocks.buildModel).not.toHaveBeenCalled();
  });

  it("ranks the locked snapshot returned by the persistence transaction", async () => {
    const before = state("5");
    const after = state("6");
    after.user.gameStates.hades = {
      gameId: "hades",
      title: "Hades",
      rating: 5,
      inBacklog: false,
      inWishlist: false,
      inPlayfitPicks: false,
      source: "manual",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    mocks.loadState.mockResolvedValueOnce({
      ok: true,
      userId,
      state: before,
      stateVersion: "5",
    });
    mocks.rpc.mockResolvedValueOnce({
      data: {
        status: "applied",
        state_version: 6,
        profile_snapshot: {
          game_states: after.user.gameStates,
          profile: after.user.profile,
          onboarding: {
            ...after.user.onboarding,
            onboardingCompletedAt: after.user.onboardingCompletedAt,
          },
          state_version: 6,
          updated_at: after.user.lastUpdatedAt,
        },
      },
      error: null,
    });
    const { POST } = await loadRoute();

    const response = await POST(request("loved"));

    expect(response.status).toBe(200);
    expect(mocks.loadState).toHaveBeenCalledTimes(1);
    expect(mocks.buildModel).toHaveBeenCalledWith({
      state: expect.objectContaining({ stateVersion: "6" }),
      stateVersion: "6",
      userId,
    });
  });

  it("re-reads and ranks the persisted snapshot when an operation is replayed", async () => {
    const before = state("6");
    const after = state("6");
    after.user.gameStates.hades = {
      gameId: "hades",
      title: "Hades",
      rating: 2,
      excluded: true,
      inBacklog: false,
      inWishlist: false,
      inPlayfitPicks: false,
      source: "manual",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    mocks.loadState
      .mockResolvedValueOnce({ ok: true, userId, state: before, stateVersion: "6" })
      .mockResolvedValueOnce({ ok: true, userId, state: after, stateVersion: "6" });
    mocks.rpc.mockResolvedValueOnce({
      data: { status: "replayed", state_version: 6 },
      error: null,
    });
    const { POST } = await loadRoute();

    const response = await POST(request("not_for_me"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      stateVersion: "6",
      gameState: { rating: 2, excluded: true },
    });
    expect(mocks.buildModel).toHaveBeenCalledWith({
      state: after,
      stateVersion: "6",
      userId,
    });
  });

  it("reports saved-but-not-ranked when model metadata uses another version", async () => {
    const before = state("5");
    const after = state("6");
    after.user.gameStates.hades = {
      gameId: "hades",
      title: "Hades",
      rating: 5,
      inBacklog: false,
      inWishlist: false,
      inPlayfitPicks: false,
      source: "manual",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    mocks.loadState
      .mockResolvedValueOnce({ ok: true, userId, state: before, stateVersion: "5" })
      .mockResolvedValueOnce({ ok: true, userId, state: after, stateVersion: "6" });
    mocks.buildModel.mockResolvedValueOnce(rankedModel("5"));
    const { POST } = await loadRoute();

    const response = await POST(request("loved"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      decisionSaved: true,
      stateVersion: "6",
      error: "Decision was saved, but ranking version verification failed",
    });
  });

  it("undoes the immediately preceding canonical decision and ranks N+2", async () => {
    const afterDecision = state("6");
    afterDecision.user.gameStates.hades = {
      gameId: "hades",
      title: "Hades",
      rating: 2,
      excluded: true,
      inBacklog: false,
      inWishlist: false,
      inPlayfitPicks: false,
      source: "manual",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };
    const afterUndo = state("7");
    mocks.loadState.mockResolvedValueOnce({
      ok: true,
      userId,
      state: afterDecision,
      stateVersion: "6",
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          status: "available",
          state_version: 6,
          game_id: game.gameId,
          previous_game_state_exists: false,
          previous_game_state: null,
          previous_profile: afterUndo.user.profile,
          profile_snapshot: persistedSnapshot(afterDecision),
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          status: "applied",
          state_version: 7,
          game_id: game.gameId,
          restored_previous_state: false,
          profile_snapshot: persistedSnapshot(afterUndo),
        },
        error: null,
      });
    mocks.buildModel.mockResolvedValueOnce(rankedModel("7"));
    const { POST } = await loadRoute();

    const response = await POST(undoRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      operationId: undoOperationId,
      stateVersion: "7",
      gameState: null,
      profile: { stateVersion: "7" },
      recommendationModel: {
        stateVersion: "7",
        rankingMetadata: { profileStateVersion: "7" },
      },
      undo: {
        targetOperationId: operationId,
        gameId: game.gameId,
        restoredPreviousState: false,
      },
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "apply_profile_undo", {
      p_user_id: userId,
      p_expected_state_version: "6",
      p_operation_id: undoOperationId,
      p_operation_fingerprint: JSON.stringify({
        actionType: "undo_decision",
        targetOperationId: operationId,
      }),
      p_target_operation_id: operationId,
      p_rebuilt_profile: expect.any(Object),
    });
  });

  it("rejects stale Undo before rebuilding or ranking", async () => {
    const current = state("7");
    mocks.loadState.mockResolvedValueOnce({ ok: true, userId, state: current, stateVersion: "7" });
    mocks.rpc.mockResolvedValueOnce({
      data: { status: "conflict", state_version: 7 },
      error: null,
    });
    const { POST } = await loadRoute();

    const response = await POST(undoRequest("6"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      conflict: true,
      needsResync: true,
      currentStateVersion: "7",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.buildModel).not.toHaveBeenCalled();
  });

  it("rejects Undo after another operation even when the supplied version is current", async () => {
    const current = state("7");
    mocks.loadState.mockResolvedValueOnce({ ok: true, userId, state: current, stateVersion: "7" });
    mocks.rpc.mockResolvedValueOnce({
      data: { status: "undo_unavailable", state_version: 7 },
      error: null,
    });
    const { POST } = await loadRoute();

    const response = await POST(undoRequest("7"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      undoUnavailable: true,
      needsResync: true,
      currentStateVersion: "7",
    });
    expect(mocks.buildModel).not.toHaveBeenCalled();
  });

  it("replays the same Undo without incrementing its version", async () => {
    const afterUndo = state("7");
    mocks.loadState.mockResolvedValueOnce({
      ok: true,
      userId,
      state: afterUndo,
      stateVersion: "7",
    });
    mocks.rpc
      .mockResolvedValueOnce({
        data: {
          status: "replayable",
          state_version: 7,
          game_id: game.gameId,
          previous_game_state_exists: false,
          profile_snapshot: persistedSnapshot(afterUndo),
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          status: "replayed",
          state_version: 7,
          game_id: game.gameId,
          restored_previous_state: false,
          profile_snapshot: persistedSnapshot(afterUndo),
        },
        error: null,
      });
    mocks.buildModel.mockResolvedValueOnce(rankedModel("7"));
    const { POST } = await loadRoute();

    const response = await POST(undoRequest("6"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      stateVersion: "7",
      undo: { targetOperationId: operationId },
    });
    expect(mocks.fetchGames).not.toHaveBeenCalled();
  });
});
