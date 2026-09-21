import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRequestSupabaseContext: vi.fn(),
  loadRecommendationStateFromContext: vi.fn(),
  getCachedPlayNextModel: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestSupabaseContext: mocks.createRequestSupabaseContext,
}));

vi.mock("../recommendations/shared", () => ({
  loadRecommendationStateFromContext: mocks.loadRecommendationStateFromContext,
  getCachedPlayNextModel: mocks.getCachedPlayNextModel,
}));

const event = {
  eventId: "550e8400-e29b-41d4-a716-446655440000",
  eventName: "recommendation_shown",
  clientPlatform: "web",
  recommendationId: "play-next:7",
  stateVersion: "7",
  gameId: "hades",
  rank: 1,
};

function post(body: unknown) {
  return new Request("http://localhost/api/core-loop-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("core-loop events API route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRequestSupabaseContext.mockResolvedValue({
      userId: "user-1",
      client: { rpc: mocks.rpc },
    });
    mocks.loadRecommendationStateFromContext.mockResolvedValue({
      ok: true,
      userId: "user-1",
      state: {},
      stateVersion: "7",
    });
    mocks.getCachedPlayNextModel.mockResolvedValue({
      rankingMetadata: { candidates: [{ gameId: "hades", rank: 1 }] },
    });
    mocks.rpc.mockResolvedValue({ error: null });
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records an event whose game and rank are in the cached model", async () => {
    const { POST } = await loadRoute();

    const response = await POST(post(event));

    expect(response.status).toBe(204);
    expect(mocks.getCachedPlayNextModel).toHaveBeenCalledWith({
      userId: "user-1",
      stateVersion: "7",
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      "record_client_core_loop_event",
      expect.objectContaining({ p_user_id: "user-1", p_game_id: "hades", p_rank: 1 }),
    );
  });

  it("does not score recommendations to validate an event", async () => {
    mocks.getCachedPlayNextModel.mockResolvedValue(null);
    const { POST } = await loadRoute();

    const response = await POST(post(event));

    expect(response.status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an event for a game and rank the model does not contain", async () => {
    const { POST } = await loadRoute();

    const response = await POST(post({ ...event, rank: 3 }));

    expect(response.status).toBe(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an event for a stale state version before reading any model", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      post({ ...event, stateVersion: "6", recommendationId: "play-next:6" }),
    );

    expect(response.status).toBe(409);
    expect(mocks.getCachedPlayNextModel).not.toHaveBeenCalled();
  });

  it("requires authentication and a valid payload", async () => {
    const { POST } = await loadRoute();
    mocks.createRequestSupabaseContext.mockResolvedValueOnce(null);

    expect((await POST(post(event))).status).toBe(401);
    expect((await POST(post({ eventName: "nope" }))).status).toBe(400);
  });

  it("reports a failure to record the event", async () => {
    mocks.rpc.mockResolvedValue({ error: new Error("insert failed") });
    const { POST } = await loadRoute();

    const response = await POST(post(event));

    expect(response.status).toBe(500);
  });
});
