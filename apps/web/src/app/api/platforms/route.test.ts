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

function mockQuery(result: unknown) {
  const order = vi.fn().mockResolvedValue(result);
  const select = vi.fn(() => ({ order }));
  mocks.createAnonClient.mockReturnValue({
    schema: vi.fn(() => ({ from: vi.fn(() => ({ select })) })),
  });
  return { order, select };
}

describe("platforms API route", () => {
  afterEach(() => vi.clearAllMocks());

  it("maps catalog platform rows to the public DTO", async () => {
    const { order } = mockQuery({
      data: [
        { id: "switch_2", name: "Nintendo Switch 2", family: "nintendo", kind: "hybrid", gen: 9 },
      ],
      error: null,
    });
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      platforms: [
        {
          platformId: "switch_2",
          displayName: "Nintendo Switch 2",
          family: "nintendo",
          kind: "hybrid",
          activeStatus: "active",
          sortOrder: 9,
        },
      ],
    });
    expect(order).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("returns a controlled database error", async () => {
    mockQuery({ data: null, error: { message: "platforms unavailable" } });
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "platforms unavailable" });
  });
});
