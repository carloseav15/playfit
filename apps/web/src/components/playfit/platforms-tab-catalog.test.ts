import type { ProductPlatformOption } from "@playfit/core/types";
import { describe, expect, it } from "vitest";
import {
  formatTastePlatformFamily,
  platformKindLabels,
  tastePlatformPresets,
} from "./platforms-tab-catalog";

function createPlatform(
  platformId: string,
  family: string,
  kind: ProductPlatformOption["kind"] = "console",
): ProductPlatformOption {
  return {
    platformId,
    displayName: platformId,
    family,
    kind,
    activeStatus: "active",
    sortOrder: 1,
  };
}

describe("platforms-tab-catalog", () => {
  it("matches the expected platform presets", () => {
    const current = tastePlatformPresets.find((preset) => preset.id === "current");
    const pc = tastePlatformPresets.find((preset) => preset.id === "pc");
    const retro = tastePlatformPresets.find((preset) => preset.id === "retro");

    expect(current?.matches(createPlatform("ps5", "playstation"))).toBe(true);
    expect(current?.matches(createPlatform("ps2", "playstation"))).toBe(false);
    expect(pc?.matches(createPlatform("steam", "other", "computer"))).toBe(true);
    expect(retro?.matches(createPlatform("snes", "nintendo"))).toBe(true);
  });

  it("formats family labels and platform kinds", () => {
    expect(formatTastePlatformFamily("playstation")).toBe("PlayStation");
    expect(formatTastePlatformFamily("super_custom_family")).toBe("Super Custom Family");
    expect(platformKindLabels.console).toBe("Console");
    expect(platformKindLabels.computer).toBe("Computer");
  });
});
