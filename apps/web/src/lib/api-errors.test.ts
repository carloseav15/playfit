import { describe, expect, it, vi } from "vitest";
import { apiErrorResponseSchema } from "./api-contracts";
import { jsonData } from "./api-errors";

describe("API response contracts", () => {
  it("returns validated data", async () => {
    const response = jsonData(apiErrorResponseSchema, { error: "Not found" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("returns a generic error when a response violates its contract", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = jsonData(apiErrorResponseSchema, { error: "" });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Invalid API response" });
    expect(errorSpy).toHaveBeenCalledOnce();
    errorSpy.mockRestore();
  });
});
