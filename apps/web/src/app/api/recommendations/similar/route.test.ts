import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAnonClient: vi.fn(),
  resolveGameRedirect: vi.fn(),
}));

vi.mock("@/lib/game-redirects", () => ({ resolveGameRedirect: mocks.resolveGameRedirect }));
vi.mock("@/lib/supabase/server", () => ({ createAnonClient: mocks.createAnonClient }));
vi.mock("../shared", () => ({ fetchFullGamesById: vi.fn() }));
vi.mock("@/lib/monitoring", () => ({ captureApiError: vi.fn() }));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("similar recommendations API route", () => {
  afterEach(() => vi.clearAllMocks());

  it("requires a game id", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      new Request("http://playfit.test/api/recommendations/similar", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "gameId is required" });
    expect(mocks.createAnonClient).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON", async () => {
    const { POST } = await loadRoute();

    const response = await POST(
      new Request("http://playfit.test/api/recommendations/similar", {
        method: "POST",
        body: "not-json",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid JSON payload" });
  });

  it("returns not found when the base game is absent", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    mocks.createAnonClient.mockReturnValue({
      schema: vi.fn(() => ({ from: vi.fn(() => ({ select })) })),
    });
    mocks.resolveGameRedirect.mockResolvedValue({ gameId: "missing-game", error: null });
    const { POST } = await loadRoute();

    const response = await POST(
      new Request("http://playfit.test/api/recommendations/similar", {
        method: "POST",
        body: JSON.stringify({ gameId: "missing-game" }),
      }),
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Game not found" });
  });
});
