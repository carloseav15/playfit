import { afterEach, describe, expect, it, vi } from "vitest";

async function loadPlatforms() {
  vi.resetModules();
  return import("./platforms");
}

describe("fetchPlatforms", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps platform rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([
          {
            id: "switch_2",
            name: "Nintendo Switch 2",
            family: "nintendo",
            kind: "hybrid",
            gen: 9,
          },
        ]),
      }),
    );

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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue([]),
      }),
    );
    const { fetchPlatforms } = await loadPlatforms();

    await expect(fetchPlatforms()).resolves.toEqual([]);
  });

  it("throws when Supabase fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        text: vi.fn().mockResolvedValue("invalid api key"),
      }),
    );
    const { fetchPlatforms } = await loadPlatforms();

    await expect(fetchPlatforms()).rejects.toThrow("Failed to load platforms: invalid api key");
  });
});
