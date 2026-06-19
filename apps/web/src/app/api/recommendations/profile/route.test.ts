import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  schema: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAnonClient: vi.fn(() => ({
    schema: mocks.schema,
  })),
}));

function emptyValidPayload() {
  return {
    onboarding: {
      step: "platforms",
      platforms: [],
      likedGameIds: [],
      dislikedGameIds: [],
    },
    gameStates: {},
  };
}

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("profile recommendations API route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("builds a fallback profile for an empty valid payload", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/recommendations/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(emptyValidPayload()),
      }),
    );

    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.profile).toEqual(expect.objectContaining({ ratedCount: 0 }));
    expect(mocks.schema).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/recommendations/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON payload" });
    expect(response.status).toBe(400);
    expect(mocks.schema).not.toHaveBeenCalled();
  });

  it("rejects payloads outside the recommendations profile schema", async () => {
    const { POST } = await loadRoute();
    const response = await POST(
      new Request("http://playfit.test/api/recommendations/profile", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ onboarding: null, gameStates: {} }),
      }),
    );

    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json.error).toBe("Invalid recommendations profile payload");
    expect(mocks.schema).not.toHaveBeenCalled();
  });
});
