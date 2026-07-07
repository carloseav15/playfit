import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createContext: vi.fn(),
  rpc: vi.fn(),
  insert: vi.fn(() => ({
    maybeSingle: vi.fn().mockResolvedValue({ error: null, data: null }),
  })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestSupabaseContext: mocks.createContext,
}));

const authenticatedUserId = "550e8400-e29b-41d4-a716-446655440000";
const client = {
  rpc: mocks.rpc,
  schema: vi.fn(() => ({
    from: vi.fn(() => ({ insert: mocks.insert })),
  })),
};

function validPayload() {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    deviceId: "660e8400-e29b-41d4-a716-446655440000",
    gameStates: {
      chrono_trigger: {
        gameId: "chrono_trigger",
        title: "Chrono Trigger",
        rating: 5,
        inBacklog: false,
        inWishlist: false,
        inPlayfitPicks: false,
        excluded: false,
        source: "manual",
        createdAt: now,
        updatedAt: now,
      },
    },
    profile: null,
    onboarding: {
      step: "anchors",
      platforms: [{ platformId: "switch_2", status: "available" }],
      likedGameIds: ["chrono_trigger", "metroid_prime", "zelda_tears"],
      dislikedGameIds: ["horror_game"],
      onboardingCompletedAt: now,
    },
  };
}

function emptyPayload() {
  return {
    deviceId: "660e8400-e29b-41d4-a716-446655440000",
    gameStates: {},
    profile: null,
    onboarding: {
      step: "platforms",
      platforms: [],
      likedGameIds: [],
      dislikedGameIds: [],
      onboardingCompletedAt: null,
    },
  };
}

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

function mockRpcWithProfileResponses(responses: { data: unknown; error: null }[]) {
  const profileResponses = [...responses];
  mocks.rpc.mockImplementation((functionName: string) => {
    if (functionName === "check_rate_limit") {
      return Promise.resolve({ data: true, error: null });
    }
    if (functionName === "get_profile") {
      return Promise.resolve(profileResponses.shift() ?? { data: null, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });
}

describe("profile API route", () => {
  beforeEach(() => {
    mocks.createContext.mockResolvedValue({ client, userId: authenticatedUserId });
    mockRpcWithProfileResponses([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses the authenticated session identity and ignores the compatibility deviceId", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/profile?device_id=other-device", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-jwt",
          "content-type": "application/json",
        },
        body: JSON.stringify(validPayload()),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_ip_address: "unknown",
      p_endpoint: "/api/profile",
      p_max_requests: 60,
      p_window_seconds: 60,
      p_user_id: authenticatedUserId,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("upsert_profile", {
      p_user_id: authenticatedUserId,
      p_game_states: expect.objectContaining({
        chrono_trigger: expect.objectContaining({ title: "Chrono Trigger" }),
      }),
      p_profile: null,
      p_onboarding: expect.objectContaining({ step: "anchors" }),
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith(
      "upsert_profile",
      expect.objectContaining({ p_user_id: validPayload().deviceId }),
    );
  });

  it("rejects requests without a verified Supabase session", async () => {
    mocks.createContext.mockResolvedValue(null);
    const { GET } = await loadRoute();
    const response = await GET(
      new Request("http://playfit.test/api/profile?device_id=550e8400-e29b-41d4-a716-446655440000"),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns 429 only when the rate limit is exhausted", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    const { GET } = await loadRoute();
    const response = await GET(new Request("http://playfit.test/api/profile"));

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "Too many requests" });
  });

  it("returns 503 when the rate limiter RPC fails", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "database unavailable" } });
    const { GET } = await loadRoute();
    const response = await GET(new Request("http://playfit.test/api/profile"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Rate limiter unavailable" });
  });

  it("loads only the authenticated user's profile", async () => {
    const state = { game_states: {}, profile: null, onboarding: {} };
    mockRpcWithProfileResponses([{ data: state, error: null }]);
    const { GET } = await loadRoute();
    const response = await GET(
      new Request("http://playfit.test/api/profile?device_id=660e8400-e29b-41d4-a716-446655440000"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ state });
    expect(mocks.rpc).toHaveBeenCalledWith("get_profile", { p_user_id: authenticatedUserId });
  });

  it("does not hide a profile RPC failure as an empty profile", async () => {
    mocks.rpc.mockImplementation((functionName: string) => {
      if (functionName === "check_rate_limit") {
        return Promise.resolve({ data: true, error: null });
      }
      return Promise.resolve({ data: null, error: { message: "not authorized" } });
    });
    const { GET } = await loadRoute();
    const response = await GET(new Request("http://playfit.test/api/profile"));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to load profile" });
  });

  it("rejects malformed JSON", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON payload" });
  });

  it("rejects payloads outside the profile schema", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: "device-123", profile: null }),
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid profile payload");
  });

  it("rejects an empty overwrite when the authenticated user has existing data", async () => {
    mockRpcWithProfileResponses([
      {
        data: { game_states: { chrono_trigger: {} }, profile: { summary: "test" } },
        error: null,
      },
    ]);
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(emptyPayload()),
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Cannot overwrite non-empty profile with empty data",
    );
  });

  it("allows an empty save when the authenticated user has no profile", async () => {
    mockRpcWithProfileResponses([{ data: null, error: null }]);
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(emptyPayload()),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "upsert_profile",
      expect.objectContaining({ p_user_id: authenticatedUserId }),
    );
  });

  it("deletes only the authenticated user's profile", async () => {
    const { DELETE } = await loadRoute();
    const response = await DELETE(
      new Request("http://playfit.test/api/profile?device_id=other-device", { method: "DELETE" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("delete_profile", {
      p_user_id: authenticatedUserId,
    });
  });
});
