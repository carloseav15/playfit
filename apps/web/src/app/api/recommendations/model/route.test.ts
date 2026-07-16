import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  captureApiError: vi.fn(),
  loadRecommendationState: vi.fn(),
  scoreTodayModel: vi.fn(),
}));

vi.mock("@/lib/monitoring", () => ({ captureApiError: mocks.captureApiError }));
vi.mock("../shared", () => ({
  loadRecommendationState: mocks.loadRecommendationState,
  scoreTodayModel: mocks.scoreTodayModel,
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("model recommendations API route", () => {
  afterEach(() => vi.clearAllMocks());

  it("requires a recommendation session", async () => {
    mocks.loadRecommendationState.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Recommendation session required",
    });
    const { POST } = await loadRoute();
    const request = new Request("http://playfit.test/api/recommendations/model", {
      method: "POST",
    });

    const response = await POST(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Recommendation session required" });
    expect(mocks.scoreTodayModel).not.toHaveBeenCalled();
  });

  it("returns the scored model and its cache scope", async () => {
    const state = { user: { profile: { ratedCount: 3 } } };
    const model = { primary: null, alternatives: [], savedPickIds: [], stateVersion: "v1" };
    mocks.loadRecommendationState.mockResolvedValue({
      ok: true,
      userId: "user-1",
      state,
      stateVersion: "v1",
    });
    mocks.scoreTodayModel.mockResolvedValue(model);
    const { POST } = await loadRoute();
    const request = new Request("http://playfit.test/api/recommendations/model", {
      method: "POST",
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(model);
    expect(mocks.scoreTodayModel).toHaveBeenCalledWith({
      state,
      stateVersion: "v1",
      userId: "user-1",
      cacheScope: "model",
    });
  });

  it("converts scoring failures to a stable API error", async () => {
    mocks.loadRecommendationState.mockResolvedValue({
      ok: true,
      userId: "user-1",
      state: {},
      stateVersion: "v1",
    });
    mocks.scoreTodayModel.mockRejectedValue(new Error("database unavailable"));
    const { POST } = await loadRoute();

    const response = await POST(
      new Request("http://playfit.test/api/recommendations/model", { method: "POST" }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to score recommendations" });
    expect(mocks.captureApiError).toHaveBeenCalledOnce();
  });
});
