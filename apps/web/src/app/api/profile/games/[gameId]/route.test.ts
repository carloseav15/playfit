import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContext: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestSupabaseContext: mocks.createContext,
}));

const authenticatedUserId = "550e8400-e29b-41d4-a716-446655440000";
const client = { rpc: mocks.rpc };

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("profile game states API route", () => {
  beforeEach(() => {
    mocks.createContext.mockResolvedValue({ client, userId: authenticatedUserId });
    mocks.rpc.mockImplementation((functionName: string) => {
      if (functionName === "check_rate_limit") {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("updates game state for the authenticated session identity", async () => {
    const { PATCH } = await loadRoute();
    const request = new Request(
      "http://playfit.test/api/profile/games/zelda_tears?device_id=other-device",
      {
        method: "PATCH",
        headers: {
          authorization: "Bearer valid-jwt",
          "content-type": "application/json",
        },
        body: JSON.stringify({ status: "playing", rating: 4.5, inPlayfitPicks: true }),
      },
    );
    const response = await PATCH(request, {
      params: Promise.resolve({ gameId: "zelda_tears" }),
    });

    expect(response.status).toBe(200);
    expect(mocks.createContext).toHaveBeenCalledWith(request);
    expect(mocks.rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_ip_address: "unknown",
      p_endpoint: "/api/profile/games",
      p_max_requests: 60,
      p_window_seconds: 60,
      p_user_id: authenticatedUserId,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("upsert_game_state", {
      p_user_id: authenticatedUserId,
      p_game_id: "zelda_tears",
      p_status: "playing",
      p_rating: 4.5,
      p_in_backlog: null,
      p_in_wishlist: null,
      p_in_playfit_picks: true,
      p_excluded: null,
      p_source: "manual",
    });
  });

  it("ignores device_id when a valid session exists", async () => {
    const { PATCH } = await loadRoute();
    const response = await PATCH(
      new Request("http://playfit.test/api/profile/games/zelda_tears?device_id=not-a-uuid", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "want_to_play" }),
      }),
      { params: Promise.resolve({ gameId: "zelda_tears" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "upsert_game_state",
      expect.objectContaining({ p_user_id: authenticatedUserId }),
    );
  });

  it("rejects device-only requests without a Supabase session", async () => {
    mocks.createContext.mockResolvedValue(null);
    const { PATCH } = await loadRoute();
    const response = await PATCH(
      new Request(
        "http://playfit.test/api/profile/games/zelda_tears?device_id=550e8400-e29b-41d4-a716-446655440000",
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ status: "want_to_play" }),
        },
      ),
      { params: Promise.resolve({ gameId: "zelda_tears" }) },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns 429 only when the game-state rate limit is exhausted", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    const { DELETE } = await loadRoute();
    const response = await DELETE(
      new Request("http://playfit.test/api/profile/games/zelda_tears", { method: "DELETE" }),
      { params: Promise.resolve({ gameId: "zelda_tears" }) },
    );

    expect(response.status).toBe(429);
  });

  it("returns 503 when the game-state rate limiter fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });
    const { DELETE } = await loadRoute();
    const response = await DELETE(
      new Request("http://playfit.test/api/profile/games/zelda_tears", { method: "DELETE" }),
      { params: Promise.resolve({ gameId: "zelda_tears" }) },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Rate limiter unavailable" });
  });

  it("deletes game state for the authenticated session identity", async () => {
    const { DELETE } = await loadRoute();
    const response = await DELETE(
      new Request("http://playfit.test/api/profile/games/zelda_tears", { method: "DELETE" }),
      { params: Promise.resolve({ gameId: "zelda_tears" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("delete_game_state", {
      p_user_id: authenticatedUserId,
      p_game_id: "zelda_tears",
    });
  });
});
