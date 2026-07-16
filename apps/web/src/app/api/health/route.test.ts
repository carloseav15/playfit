import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAnonClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createAnonClient: mocks.createAnonClient,
}));

async function loadRoute() {
  vi.resetModules();
  return import("./route");
}

describe("health API route", () => {
  afterEach(() => vi.clearAllMocks());

  it("reports a connected catalog", async () => {
    const select = vi.fn().mockResolvedValue({ count: 65118, error: null });
    mocks.createAnonClient.mockReturnValue({
      schema: vi.fn(() => ({ from: vi.fn(() => ({ select })) })),
    });
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        ok: true,
        app: "playfit",
        checks: { database: "connected (65,118 games)" },
      }),
    );
  });

  it("reports a database error without throwing", async () => {
    const select = vi.fn().mockResolvedValue({ count: null, error: { message: "db offline" } });
    mocks.createAnonClient.mockReturnValue({
      schema: vi.fn(() => ({ from: vi.fn(() => ({ select })) })),
    });
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({ ok: false, checks: { database: "error: db offline" } }),
    );
  });
});
