import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  isValidDeviceId: vi.fn(() => true),
}));

vi.mock("@/lib/device-id", () => ({
  isValidDeviceId: mocks.isValidDeviceId,
}));

vi.mock("@/lib/supabase/server", () => ({
  createAnonClient: vi.fn(() => {
    return {
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc,
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn(),
          insert: vi.fn(),
        })),
      })),
    };
  }),
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("profile game states API route", () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
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

  it("updates game state for authenticated user", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "550e8400-e29b-41d4-a716-446655440000" } },
    });

    const { PATCH } = await loadRoute();
    const response = await PATCH(
      new Request("http://playfit.test/api/profile/games/zelda_tears", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "playing", rating: 4.5 }),
      }),
      { params: Promise.resolve({ gameId: "zelda_tears" }) },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("upsert_game_state", {
      p_user_id: "550e8400-e29b-41d4-a716-446655440000",
      p_game_id: "zelda_tears",
      p_status: "playing",
      p_rating: 4.5,
      p_in_backlog: null,
      p_in_wishlist: null,
      p_excluded: null,
      p_source: "manual",
    });
  });

  it("updates game state for anonymous user with valid device ID", async () => {
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

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("upsert_game_state", {
      p_user_id: "550e8400-e29b-41d4-a716-446655440000",
      p_game_id: "zelda_tears",
      p_status: "want_to_play",
      p_rating: null,
      p_in_backlog: null,
      p_in_wishlist: null,
      p_excluded: null,
      p_source: "manual",
    });
  });

  it("rejects malformed device ID in query param", async () => {
    mocks.isValidDeviceId.mockReturnValueOnce(false);
    const { PATCH } = await loadRoute();
    const response = await PATCH(
      new Request("http://playfit.test/api/profile/games/zelda_tears?device_id=invalid-device-id", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "want_to_play" }),
      }),
      { params: Promise.resolve({ gameId: "zelda_tears" }) },
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Invalid device identifier");
    expect(mocks.rpc).not.toHaveBeenCalledWith("upsert_game_state", expect.anything());
  });

  it("rejects request without user identifier", async () => {
    const { PATCH } = await loadRoute();
    const response = await PATCH(
      new Request("http://playfit.test/api/profile/games/zelda_tears", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "playing" }),
      }),
      { params: Promise.resolve({ gameId: "zelda_tears" }) },
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("No user identifier");
  });

  it("deletes game state for authenticated user", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "550e8400-e29b-41d4-a716-446655440000" } },
    });

    const { DELETE } = await loadRoute();
    const response = await DELETE(
      new Request("http://playfit.test/api/profile/games/zelda_tears", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ gameId: "zelda_tears" }) },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("delete_game_state", {
      p_user_id: "550e8400-e29b-41d4-a716-446655440000",
      p_game_id: "zelda_tears",
    });
  });

  it("deletes game state for anonymous user with valid device ID", async () => {
    const { DELETE } = await loadRoute();
    const response = await DELETE(
      new Request(
        "http://playfit.test/api/profile/games/zelda_tears?device_id=550e8400-e29b-41d4-a716-446655440000",
        {
          method: "DELETE",
        },
      ),
      { params: Promise.resolve({ gameId: "zelda_tears" }) },
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("delete_game_state", {
      p_user_id: "550e8400-e29b-41d4-a716-446655440000",
      p_game_id: "zelda_tears",
    });
  });
});
