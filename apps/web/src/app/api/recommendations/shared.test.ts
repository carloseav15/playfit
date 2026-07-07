import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContext: vi.fn(),
  rpc: vi.fn(),
  createAnonClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestSupabaseContext: mocks.createContext,
  createAnonClient: mocks.createAnonClient,
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
      stateVersion: "2026-01-02T00:00:00.000Z",
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
