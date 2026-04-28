import { afterEach, describe, expect, it, vi } from "vitest";

import { detectProductRuntimeMode } from "./client";

describe("detectProductRuntimeMode", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns ai-assisted when health is configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, configured: true, model: "gpt-4o-mini" }),
      }),
    );

    await expect(detectProductRuntimeMode()).resolves.toBe("ai-assisted");
  });

  it("returns local-only when health is missing or disabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, configured: false, model: "gpt-4o-mini" }),
      }),
    );

    await expect(detectProductRuntimeMode()).resolves.toBe("local-only");
  });
});
