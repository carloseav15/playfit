import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  rateLimitGte: vi.fn().mockResolvedValue({ count: 0, data: null, error: null }),
}));

vi.mock("@/lib/device-id", () => ({
  isValidDeviceId: vi.fn(() => true),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(() => {
    const rateLimitEq2 = vi.fn(() => ({ gte: mocks.rateLimitGte }));
    const rateLimitEq1 = vi.fn(() => ({ eq: rateLimitEq2 }));
    const rateLimitSelect = vi.fn(() => ({ eq: rateLimitEq1 }));
    const rateLimitInsert = vi.fn().mockResolvedValue({ error: null });

    return {
      auth: {
        getUser: mocks.getUser,
      },
      rpc: mocks.rpc,
      schema: vi.fn(() => ({
        from: vi.fn((table: string) => {
          if (table === "audit_log") {
            return {
              select: vi.fn(),
              insert: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ error: null, data: null }),
              })),
            };
          }
          return {
            select: rateLimitSelect,
            insert: rateLimitInsert,
          };
        }),
      })),
    };
  }),
}));

function validPayload() {
  const now = "2026-01-01T00:00:00.000Z";
  return {
    deviceId: "device-123",
    gameStates: {
      chrono_trigger: {
        gameId: "chrono_trigger",
        title: "Chrono Trigger",
        rating: 5,
        inBacklog: false,
        inWishlist: false,
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
    deviceId: "device-123",
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

describe("profile API route", () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.rateLimitGte.mockResolvedValue({ count: 0, data: null, error: null });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("saves a valid anonymous device profile", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validPayload()),
      }),
    );

    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("upsert_profile", {
      p_user_id: "device-123",
      p_game_states: expect.objectContaining({
        chrono_trigger: expect.objectContaining({ title: "Chrono Trigger" }),
      }),
      p_profile: null,
      p_onboarding: expect.objectContaining({ step: "anchors" }),
    });
  });

  it("prefers the verified auth user over a client device id", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-user-1" } } });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/profile", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-jwt",
          "content-type": "application/json",
        },
        body: JSON.stringify(validPayload()),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "upsert_profile",
      expect.objectContaining({ p_user_id: "auth-user-1" }),
    );
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

    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON payload" });
    expect(response.status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
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
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid profile payload");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects empty save when authenticated user has existing data", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-user-1" } } });
    mocks.rpc.mockResolvedValue({
      data: { game_states: { chrono_trigger: {} }, profile: { summary: "test" } },
      error: null,
    });

    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/profile", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-jwt",
          "content-type": "application/json",
        },
        body: JSON.stringify(emptyPayload()),
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Cannot overwrite non-empty profile with empty data");
    expect(mocks.rpc).not.toHaveBeenCalledWith("upsert_profile", expect.anything());
  });

  it("migrates device profile data to authenticated user", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-user-1" } } });

    mocks.rpc.mockResolvedValueOnce({ data: null, error: null }).mockResolvedValueOnce({
      data: {
        game_states: { chrono_trigger: { gameId: "chrono_trigger", title: "Chrono Trigger" } },
        profile: { summary: "test" },
      },
      error: null,
    });

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));

    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/profile", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-jwt",
          "content-type": "application/json",
        },
        body: JSON.stringify(validPayload()),
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.migrated).toBe(true);
  });

  it("allows empty save when auth user has no existing profile", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "auth-user-1" } } });
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/profile", {
        method: "POST",
        headers: {
          authorization: "Bearer valid-jwt",
          "content-type": "application/json",
        },
        body: JSON.stringify(emptyPayload()),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("upsert_profile", expect.anything());
  });
});
