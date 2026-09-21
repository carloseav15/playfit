import type { ProductState, RankedSeedGame } from "@playfit/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContext: vi.fn(),
  rpc: vi.fn(),
  createAnonClient: vi.fn(),
  getCache: vi.fn(),
  setCache: vi.fn(),
  fetchGamesByIds: vi.fn(),
  mapRowsToSeedGames: vi.fn(),
  buildLikedTagsFromProfile: vi.fn(),
  buildDislikedTagsFromProfile: vi.fn(),
  scoreSeedGame: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestSupabaseContext: mocks.createContext,
  createAnonClient: mocks.createAnonClient,
}));
vi.mock("@/lib/api-cache", () => ({
  getCache: mocks.getCache,
  setCache: mocks.setCache,
}));
vi.mock("@/lib/games-db", () => ({
  fetchGamesByIds: mocks.fetchGamesByIds,
  mapRowsToSeedGames: mocks.mapRowsToSeedGames,
}));
vi.mock("@playfit/core/domain", () => ({
  buildLikedTagsFromProfile: mocks.buildLikedTagsFromProfile,
  buildDislikedTagsFromProfile: mocks.buildDislikedTagsFromProfile,
  scoreSeedGame: mocks.scoreSeedGame,
}));

const authenticatedUserId = "550e8400-e29b-41d4-a716-446655440000";
const client = { rpc: mocks.rpc };

describe("loadRecommendationState", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createContext.mockResolvedValue({ client, userId: authenticatedUserId });
  });

  it("requires a verified Supabase session even when device_id is present", async () => {
    mocks.createContext.mockResolvedValue(null);
    const { loadRecommendationState } = await import("./shared");

    const result = await loadRecommendationState(
      new Request(
        "http://playfit.test/api/recommendations/game/hades?device_id=660e8400-e29b-41d4-a716-446655440000",
      ),
    );

    expect(result).toEqual({
      ok: false,
      status: 401,
      error: "Recommendation session required",
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("loads recommendation state with the authenticated RPC client", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        game_states: {},
        profile: null,
        onboarding: {
          step: "platforms",
          platforms: [],
          likedGameIds: [],
          dislikedGameIds: [],
          onboardingCompletedAt: null,
        },
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
        state_version: 7,
      },
      error: null,
    });
    const { loadRecommendationState } = await import("./shared");

    const result = await loadRecommendationState(
      new Request(
        "http://playfit.test/api/recommendations/game/hades?device_id=660e8400-e29b-41d4-a716-446655440000",
      ),
    );

    expect(mocks.rpc).toHaveBeenCalledWith("get_profile", {
      p_user_id: authenticatedUserId,
    });
    expect(result).toMatchObject({
      ok: true,
      userId: authenticatedUserId,
      stateVersion: "7",
    });
  });

  it("reports a profile RPC failure without falling back to device_id", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "not authorized" } });
    const { loadRecommendationState } = await import("./shared");

    const result = await loadRecommendationState(
      new Request(
        "http://playfit.test/api/recommendations/game/hades?device_id=660e8400-e29b-41d4-a716-446655440000",
      ),
    );

    expect(result).toEqual({
      ok: false,
      status: 500,
      error: "Failed to load recommendation state",
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});

const game = {
  gameId: "hades",
  title: "Hades",
  aliases: [],
  series: "Hades",
  source: "catalog",
  primaryGenre: "action",
  tags: ["roguelike"],
  notes: "",
  coverPath: "/covers/hades.jpg",
  availablePlatformIds: ["switch"],
  availablePlatformNames: ["Switch"],
  releaseState: "released",
} as const;

const profile = {
  summary: "Likes action games",
  likedGenres: ["action"],
  avoidedGenres: [],
  likedTags: {},
  dislikedTags: {},
  ratedCount: 3,
  signals: [],
};

const state = {
  version: 2,
  user: {
    onboarding: {
      step: "dislikes",
      platforms: [{ platformId: "switch", status: "available" }],
      likedGameIds: [],
      dislikedGameIds: [],
    },
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
    profile,
    gameStates: {
      saved: {
        gameId: "saved",
        title: "Saved",
        inPlayfitPicks: true,
        inBacklog: false,
        inWishlist: false,
        status: "playing",
        source: "manual",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      completed: {
        gameId: "completed",
        title: "Completed",
        inPlayfitPicks: true,
        inBacklog: false,
        inWishlist: false,
        status: "completed",
        source: "manual",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    },
    lastUpdatedAt: "2026-01-01T00:00:00.000Z",
  },
} as unknown as ProductState;

const ranked = {
  game,
  affinityScore: 0.8,
  riskScore: 0.1,
  confidence: "high",
  fitReasons: ["genre"],
  cautionReasons: [],
  platformAvailability: "available",
  accessStatus: "playable",
  inBacklog: false,
  inWishlist: false,
  inPlayfitPicks: false,
  similarGames: [],
} as unknown as RankedSeedGame;

function scoringCalls() {
  return mocks.rpc.mock.calls.filter(([name]) => name === "score_today_recommendations").length;
}

describe("recommendation scoring helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createAnonClient.mockReturnValue({ rpc: mocks.rpc });
    mocks.getCache.mockResolvedValue(null);
    mocks.setCache.mockReset();
    mocks.setCache.mockResolvedValue(undefined);
    mocks.buildLikedTagsFromProfile.mockReturnValue({ action: 2 });
    mocks.buildDislikedTagsFromProfile.mockReturnValue({ horror: 1 });
    mocks.fetchGamesByIds.mockResolvedValue({ ok: true, rows: [{ id: "hades" }] });
    mocks.mapRowsToSeedGames.mockResolvedValue([game]);
    mocks.scoreSeedGame.mockReturnValue(ranked);
  });

  it("deduplicates IDs and maps full games", async () => {
    const { fetchFullGamesById } = await import("./shared");
    await expect(fetchFullGamesById(["hades", "hades", ""])).resolves.toEqual(
      new Map([["hades", game]]),
    );
    expect(mocks.fetchGamesByIds).toHaveBeenCalledWith(expect.anything(), ["hades"]);
  });

  it("returns an empty map when the catalog lookup fails", async () => {
    mocks.fetchGamesByIds.mockResolvedValue({ ok: false, rows: [] });
    const { fetchFullGamesById } = await import("./shared");
    await expect(fetchFullGamesById(["hades"])).resolves.toEqual(new Map());
  });

  it("returns an empty model before onboarding is complete", async () => {
    const { scoreTodayModel } = await import("./shared");
    const incomplete = { ...state, user: { ...state.user, onboardingCompletedAt: null } };
    await expect(
      scoreTodayModel({ state: incomplete, stateVersion: "v1", userId: "u", cacheScope: "model" }),
    ).resolves.toEqual({ currentRun: [], nextUp: [], resume: [], picks: [] });
    expect(mocks.getCache).not.toHaveBeenCalled();
  });

  it("uses cached today models", async () => {
    const cached = { currentRun: [], nextUp: [], resume: [], picks: [] };
    mocks.getCache.mockResolvedValue(cached);
    const { scoreTodayModel } = await import("./shared");
    await expect(
      scoreTodayModel({ state, stateVersion: "v1", userId: "u", cacheScope: "model" }),
    ).resolves.toBe(cached);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("calls scoring RPC and hydrates today buckets", async () => {
    mocks.rpc.mockResolvedValue({
      data: { currentRun: [ranked], nextUp: [], resume: [], picks: [] },
      error: null,
    });
    const { scoreTodayModel } = await import("./shared");
    const result = await scoreTodayModel({
      state,
      stateVersion: "v1",
      userId: "u",
      cacheScope: "model",
    });
    expect(result.currentRun[0].game).toBe(game);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "score_today_recommendations",
      expect.objectContaining({
        p_liked_tags: { action: 2 },
        p_accessible_platform_ids: ["switch"],
        p_skip_buckets: [],
      }),
    );
    expect(mocks.setCache).toHaveBeenCalled();
  });

  it("returns play-next primary, alternatives, and active saved IDs", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        currentRun: [],
        nextUp: [ranked, { ...ranked, game: { ...game, gameId: "other" } }],
        resume: [],
        picks: [],
      },
      error: null,
    });
    mocks.mapRowsToSeedGames.mockResolvedValue([game]);
    const { buildPlayNextModel } = await import("./shared");
    const result = await buildPlayNextModel({ state, stateVersion: "v1", userId: "u" });
    expect(result.primary?.game).toBe(game);
    expect(result.alternatives).toHaveLength(1);
    expect(result.savedPickIds).toEqual(["saved"]);
    expect(result.stateVersion).toBe("v1");
    expect(result.rankingMetadata).toEqual({
      profileStateVersion: "v1",
      candidates: [
        { gameId: "hades", rank: 1 },
        { gameId: "other", rank: 2 },
      ],
    });
  });

  it("scores once when several requests ask for the same play-next model at the same time", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.rpc.mockImplementation(async () => {
      await gate;
      return { data: { currentRun: [], nextUp: [ranked], resume: [], picks: [] }, error: null };
    });
    const { buildPlayNextModel } = await import("./shared");

    const pending = [1, 2, 3, 4].map(() =>
      buildPlayNextModel({ state, stateVersion: "v1", userId: "u" }),
    );
    release();
    const results = await Promise.all(pending);

    expect(scoringCalls()).toBe(1);
    expect(new Set(results).size).toBe(1);
  });

  it("finishes writing the play-next cache before returning the model", async () => {
    let finishWrite!: () => void;
    mocks.setCache.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishWrite = resolve;
        }),
    );
    mocks.rpc.mockResolvedValue({
      data: { currentRun: [], nextUp: [ranked], resume: [], picks: [] },
      error: null,
    });
    const { buildPlayNextModel } = await import("./shared");

    let returned = false;
    const building = buildPlayNextModel({ state, stateVersion: "v1", userId: "u" }).then(
      (model) => {
        returned = true;
        return model;
      },
    );
    await vi.waitFor(() => expect(mocks.setCache).toHaveBeenCalled());
    await Promise.resolve();
    expect(returned).toBe(false);

    finishWrite();
    await building;
    expect(returned).toBe(true);
  });

  it("scores separately for different state versions", async () => {
    mocks.rpc.mockResolvedValue({
      data: { currentRun: [], nextUp: [ranked], resume: [], picks: [] },
      error: null,
    });
    const { buildPlayNextModel } = await import("./shared");

    await Promise.all([
      buildPlayNextModel({ state, stateVersion: "v1", userId: "u" }),
      buildPlayNextModel({ state, stateVersion: "v2", userId: "u" }),
    ]);

    expect(scoringCalls()).toBe(2);
  });

  it("scores once when several requests ask for the same today model at the same time", async () => {
    mocks.rpc.mockResolvedValue({
      data: { currentRun: [], nextUp: [ranked], resume: [], picks: [] },
      error: null,
    });
    const { scoreTodayModel } = await import("./shared");

    await Promise.all(
      [1, 2, 3].map(() =>
        scoreTodayModel({ state, stateVersion: "v1", userId: "u", cacheScope: "model" }),
      ),
    );

    expect(scoringCalls()).toBe(1);
  });

  it("reads a cached play-next model without scoring", async () => {
    const cached = { primary: null, alternatives: [], savedPickIds: [], stateVersion: "v1" };
    mocks.getCache.mockResolvedValue(cached);
    const { getCachedPlayNextModel } = await import("./shared");

    await expect(getCachedPlayNextModel({ userId: "u", stateVersion: "v1" })).resolves.toBe(cached);
    expect(mocks.getCache).toHaveBeenCalledWith("recs:play-next:u:v1:20260912-shared-sql");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns null when no play-next model is cached and never starts scoring", async () => {
    const { getCachedPlayNextModel } = await import("./shared");

    await expect(getCachedPlayNextModel({ userId: "u", stateVersion: "v9" })).resolves.toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("lets a cached-model reader join a play-next computation that is already running", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    mocks.rpc.mockImplementation(async () => {
      await gate;
      return { data: { currentRun: [], nextUp: [ranked], resume: [], picks: [] }, error: null };
    });
    const { buildPlayNextModel, getCachedPlayNextModel } = await import("./shared");

    const building = buildPlayNextModel({ state, stateVersion: "v1", userId: "u" });
    const reading = getCachedPlayNextModel({ userId: "u", stateVersion: "v1" });
    release();

    await expect(reading).resolves.toBe(await building);
    expect(scoringCalls()).toBe(1);
  });

  it("returns empty play-next model when scoring has no next-up entries", async () => {
    mocks.rpc.mockResolvedValue({
      data: { currentRun: [], nextUp: [], resume: [], picks: [] },
      error: null,
    });
    const { buildPlayNextModel } = await import("./shared");
    await expect(
      buildPlayNextModel({ state, stateVersion: "v1", userId: "u" }),
    ).resolves.toMatchObject({
      primary: null,
      alternatives: [],
      savedPickIds: ["saved"],
    });
  });

  it("scores one game and returns null for missing profile or game", async () => {
    const { scoreOneGame } = await import("./shared");
    mocks.rpc.mockResolvedValue({ data: [ranked], error: null });
    await expect(scoreOneGame({ gameId: "hades", state })).resolves.toEqual(ranked);
    const noProfile = { ...state, user: { ...state.user, profile: null } };
    await expect(scoreOneGame({ gameId: "hades", state: noProfile })).resolves.toBeNull();
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(scoreOneGame({ gameId: "unknown", state })).resolves.toBeNull();
  });
  it("preserves SQL scores when explanation hydration produces different local scores", async () => {
    const sqlEntry = { ...ranked, affinityScore: 91, riskScore: 17 };
    mocks.rpc.mockResolvedValue({ data: [sqlEntry], error: null });
    mocks.scoreSeedGame.mockReturnValue({ ...ranked, affinityScore: 20, riskScore: 90 });
    const { scoreGamesByIds } = await import("./shared");
    const result = await scoreGamesByIds(["hades"], state);
    expect(result[0]).toMatchObject({
      affinityScore: 91,
      riskScore: 17,
      fitReasons: ranked.fitReasons,
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "score_recommendation_games",
      expect.objectContaining({
        p_game_ids: ["hades"],
        p_rated_count: profile.ratedCount,
      }),
    );
  });

  it("does not silently substitute local scoring when SQL fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    const { scoreGamesByIds } = await import("./shared");
    await expect(scoreGamesByIds(["hades"], state)).rejects.toThrow("unavailable");
  });
});
