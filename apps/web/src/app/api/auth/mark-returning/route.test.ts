import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearReturningVisitor: vi.fn(),
  createRequestSupabaseContext: vi.fn(),
  markReturningVisitor: vi.fn(),
}));

vi.mock("@/lib/returning-visitor", () => ({
  clearReturningVisitor: mocks.clearReturningVisitor,
  markReturningVisitor: mocks.markReturningVisitor,
}));

vi.mock("@/lib/supabase/server", () => ({
  createRequestSupabaseContext: mocks.createRequestSupabaseContext,
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("returning visitor API route", () => {
  afterEach(() => vi.clearAllMocks());

  it("requires an authenticated context before marking a visitor", async () => {
    mocks.createRequestSupabaseContext.mockResolvedValue(null);
    const { POST } = await loadRoute();

    const response = await POST(
      new Request("http://playfit.test/api/auth/mark-returning", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Authentication required" });
    expect(mocks.markReturningVisitor).not.toHaveBeenCalled();
  });

  it("marks and clears the returning visitor cookie", async () => {
    mocks.createRequestSupabaseContext.mockResolvedValue({ userId: "user-1" });
    const { POST, DELETE } = await loadRoute();

    const postResponse = await POST(
      new Request("http://playfit.test/api/auth/mark-returning", { method: "POST" }),
    );
    const deleteResponse = await DELETE();

    expect(postResponse.status).toBe(200);
    expect(deleteResponse.status).toBe(200);
    await expect(postResponse.json()).resolves.toEqual({ ok: true });
    await expect(deleteResponse.json()).resolves.toEqual({ ok: true });
    expect(mocks.markReturningVisitor).toHaveBeenCalledOnce();
    expect(mocks.clearReturningVisitor).toHaveBeenCalledOnce();
  });
});
