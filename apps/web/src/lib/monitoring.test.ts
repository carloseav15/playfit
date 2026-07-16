import { afterEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException }));

describe("API monitoring", () => {
  afterEach(() => vi.restoreAllMocks());

  it("logs status and duration without exposing request data", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { withApiTiming } = await import("./monitoring");
    const request = new Request("https://playfit.test/api/games?secret=hidden");

    const response = await withApiTiming(request, "/api/games", async () =>
      Response.json({ ok: true }),
    );

    expect(response.status).toBe(200);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[0]).toContain('"msg":"api_response"');
    expect(log.mock.calls[0]?.[0]).not.toContain("secret=hidden");
  });

  it("captures unexpected route errors and returns a generic response", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { withApiTiming } = await import("./monitoring");

    const response = await withApiTiming(
      new Request("https://playfit.test/api/games"),
      "/api/games",
      async () => {
        throw new Error("database details");
      },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Internal server error" });
    expect(captureException).toHaveBeenCalledOnce();
    expect(errorLog.mock.calls[0]?.[0]).toContain('"msg":"api_error"');
  });
});
