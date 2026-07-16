import { describe, expect, it } from "vitest";
import { getTagWeight } from "./recommendations";

describe("getTagWeight", () => {
  it("preserves curated weights", () => {
    expect(getTagWeight("story_rich")).toBe(3);
    expect(getTagWeight("souls_like")).toBe(4);
  });

  it("gives rarer catalog tags more weight than common tags", () => {
    expect(getTagWeight("souls_like")).toBeGreaterThan(getTagWeight("single_player"));
  });

  it("keeps fallback weights within the configured bounds", () => {
    expect(getTagWeight("unknown_future_tag")).toBeGreaterThanOrEqual(1);
    expect(getTagWeight("unknown_future_tag")).toBeLessThanOrEqual(4);
  });
});
