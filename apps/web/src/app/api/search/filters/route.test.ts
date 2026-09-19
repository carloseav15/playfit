import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ result: vi.fn() }));
vi.mock("@/lib/supabase/platforms", () => ({ fetchPlatforms: async () => [] }));
vi.mock("@/lib/supabase/server", () => ({
  createAnonClient: () => ({
    schema: () => ({ from: () => ({ select: () => ({ not: mocks.result }) }) }),
  }),
}));

import { GET } from "./route";

describe("search filters", () => {
  it("returns a retryable error instead of caching a failed genre query", async () => {
    mocks.result.mockResolvedValue({ data: null, error: { message: "private database detail" } });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBeNull();
    expect(await response.json()).toEqual({ error: "Search filters could not load." });
  });
  it("allows a successful empty catalog", async () => {
    mocks.result.mockResolvedValue({ data: [], error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ platforms: [], genres: [] });
  });
});
