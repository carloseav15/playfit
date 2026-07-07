import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServerClient: vi.fn(),
  cookies: vi.fn(),
  validationGetUser: vi.fn(),
  ssrGetUser: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

const validationClient = { auth: { getUser: mocks.validationGetUser } };
const bearerDataClient = { rpc: vi.fn() };
const ssrClient = { auth: { getUser: mocks.ssrGetUser }, rpc: vi.fn() };

describe("createRequestSupabaseContext", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({ getAll: vi.fn(() => []), set: vi.fn() });
    mocks.createServerClient.mockReturnValue(ssrClient);
  });

  it("validates a bearer token and reuses it for data RPCs", async () => {
    mocks.validationGetUser.mockResolvedValue({
      data: { user: { id: "550e8400-e29b-41d4-a716-446655440000" } },
      error: null,
    });
    mocks.createClient.mockReturnValueOnce(validationClient).mockReturnValueOnce(bearerDataClient);
    const { createRequestSupabaseContext } = await import("./server");

    const context = await createRequestSupabaseContext(
      new Request("http://playfit.test/api/profile", {
        headers: { authorization: "Bearer verified-token" },
      }),
    );

    expect(mocks.validationGetUser).toHaveBeenCalledWith("verified-token");
    expect(context).toEqual({
      client: bearerDataClient,
      userId: "550e8400-e29b-41d4-a716-446655440000",
    });
    const dataClientOptions = mocks.createClient.mock.calls[1]?.[2];
    await expect(dataClientOptions.accessToken()).resolves.toBe("verified-token");
  });

  it("uses the cookie-aware SSR client when no bearer token is present", async () => {
    mocks.ssrGetUser.mockResolvedValue({
      data: { user: { id: "660e8400-e29b-41d4-a716-446655440000" } },
      error: null,
    });
    const { createRequestSupabaseContext } = await import("./server");

    const context = await createRequestSupabaseContext(
      new Request("http://playfit.test/api/profile"),
    );

    expect(mocks.ssrGetUser).toHaveBeenCalledWith();
    expect(context).toEqual({
      client: ssrClient,
      userId: "660e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("rejects an invalid bearer token without creating a data client", async () => {
    mocks.validationGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid token" },
    });
    mocks.createClient.mockReturnValueOnce(validationClient);
    const { createRequestSupabaseContext } = await import("./server");

    const context = await createRequestSupabaseContext(
      new Request("http://playfit.test/api/profile", {
        headers: { authorization: "Bearer invalid-token" },
      }),
    );

    expect(context).toBeNull();
    expect(mocks.createClient).toHaveBeenCalledTimes(1);
  });
});
