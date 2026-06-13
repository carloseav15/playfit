import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mocks.from,
  })),
}));

async function loadPlatforms() {
  vi.resetModules();
  return import("./platforms");
}

describe("fetchPlatforms", () => {
  beforeEach(() => {
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ order: mocks.order });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("maps platform rows", async () => {
    mocks.order.mockResolvedValue({
      data: [
        {
          id: "switch_2",
          name: "Nintendo Switch 2",
          family: "nintendo",
          kind: "hybrid",
          gen: 9,
        },
      ],
      error: null,
    });

    const { fetchPlatforms } = await loadPlatforms();

    await expect(fetchPlatforms()).resolves.toEqual([
      {
        platformId: "switch_2",
        displayName: "Nintendo Switch 2",
        family: "nintendo",
        kind: "hybrid",
        activeStatus: "active",
        sortOrder: 9,
      },
    ]);
  });

  it("allows an empty platform list", async () => {
    mocks.order.mockResolvedValue({ data: [], error: null });
    const { fetchPlatforms } = await loadPlatforms();

    await expect(fetchPlatforms()).resolves.toEqual([]);
  });

  it("throws when Supabase fails", async () => {
    mocks.order.mockResolvedValue({ data: null, error: { message: "invalid api key" } });
    const { fetchPlatforms } = await loadPlatforms();

    await expect(fetchPlatforms()).rejects.toThrow("Failed to load platforms: invalid api key");
  });
});
