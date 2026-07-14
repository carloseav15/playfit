import { describe, expect, it } from "vitest";
import { withPlatformSelectionGuard } from "./onboarding-helpers";

describe("withPlatformSelectionGuard", () => {
  it("allows shrinking a selection as long as at least one platform remains", () => {
    const current = [{ platformId: "ps5" }, { platformId: "pc" }];
    const next = [{ platformId: "ps5" }];

    expect(withPlatformSelectionGuard(current, next)).toBe(next);
  });

  it("blocks a change that would drop the selection to 0", () => {
    const current = [{ platformId: "ps5" }];
    const next: Array<{ platformId: string }> = [];

    expect(withPlatformSelectionGuard(current, next)).toBe(current);
  });

  it("allows staying at 0 when the selection was already empty", () => {
    const current: Array<{ platformId: string }> = [];
    const next: Array<{ platformId: string }> = [];

    expect(withPlatformSelectionGuard(current, next)).toBe(next);
  });

  it("allows growing a selection", () => {
    const current = [{ platformId: "ps5" }];
    const next = [{ platformId: "ps5" }, { platformId: "pc" }];

    expect(withPlatformSelectionGuard(current, next)).toBe(next);
  });
});
