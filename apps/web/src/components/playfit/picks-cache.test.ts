import type { RankedSeedGame } from "@playfit/core/types";
import { describe, expect, it } from "vitest";
import { cachePicks, getCachedPicks } from "./recommendation-cache";

describe("Picks session cache", () => {
  it("reuses results only for the same resolved identity and profile version", () => {
    const entries = [] as RankedSeedGame[];
    cachePicks("cache-test-user", "7", entries);
    expect(getCachedPicks("cache-test-user", "7")).toBe(entries);
    expect(getCachedPicks("other-user", "7")).toBeNull();
    expect(getCachedPicks("cache-test-user", "8")).toBeNull();
    expect(getCachedPicks(null, "7")).toBeNull();
  });
});
