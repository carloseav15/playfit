import type { ProductState } from "@playfit/core/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  loadProductStateOrNull: vi.fn(),
  setCachedAuth: vi.fn(),
  getCachedAuthUserId: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

vi.mock("@playfit/core/store", () => ({
  loadProductStateOrNull: mocks.loadProductStateOrNull,
  setCachedAuth: mocks.setCachedAuth,
  getCachedAuthUserId: mocks.getCachedAuthUserId,
}));

const session = { access_token: "token-1", user: { id: "user-1" } };
const profileState = { stateVersion: "7" } as ProductState;

async function loadModule() {
  vi.resetModules();
  return import("./startup-prefetch");
}

describe("startup prefetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session } });
    mocks.loadProductStateOrNull.mockResolvedValue(profileState);
    mocks.getCachedAuthUserId.mockReturnValue("user-1");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("requests the profile and today's recommendations together once there is a session", async () => {
    const { startStartupPrefetch, takeStartupPrefetch } = await loadModule();

    await startStartupPrefetch({ includeToday: true, headers: { "x-playfit-flow-id": "flow-1" } });

    expect(mocks.setCachedAuth).toHaveBeenCalledWith("token-1", "user-1");
    expect(mocks.loadProductStateOrNull).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/recommendations/today",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer token-1",
          "x-playfit-flow-id": "flow-1",
        }),
      }),
    );
    await expect(takeStartupPrefetch("state")).resolves.toBe(profileState);
    expect(await takeStartupPrefetch("today")).toBeInstanceOf(Response);
  });

  it("skips today's recommendations away from the home route", async () => {
    const { startStartupPrefetch, takeStartupPrefetch } = await loadModule();

    await startStartupPrefetch({ includeToday: false });

    expect(fetch).not.toHaveBeenCalled();
    expect(takeStartupPrefetch("today")).toBeNull();
    expect(takeStartupPrefetch("state")).not.toBeNull();
  });

  it("does nothing without a session", async () => {
    mocks.getSession.mockResolvedValue({ data: { session: null } });
    const { startStartupPrefetch, takeStartupPrefetch } = await loadModule();

    await startStartupPrefetch({ includeToday: true });

    expect(mocks.loadProductStateOrNull).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(takeStartupPrefetch("state")).toBeNull();
  });

  it("only starts once per page load", async () => {
    const { startStartupPrefetch } = await loadModule();

    await startStartupPrefetch({ includeToday: true });
    await startStartupPrefetch({ includeToday: true });

    expect(mocks.loadProductStateOrNull).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("hands each prefetched request out only once", async () => {
    const { startStartupPrefetch, takeStartupPrefetch } = await loadModule();
    await startStartupPrefetch({ includeToday: true });

    expect(takeStartupPrefetch("state")).not.toBeNull();
    expect(takeStartupPrefetch("state")).toBeNull();
  });

  it("drops a prefetch that is too old", async () => {
    vi.useFakeTimers();
    const { startStartupPrefetch, takeStartupPrefetch } = await loadModule();
    await startStartupPrefetch({ includeToday: true });

    vi.advanceTimersByTime(16_000);

    expect(takeStartupPrefetch("state")).toBeNull();
  });

  it("drops a prefetch that belongs to a different user", async () => {
    const { startStartupPrefetch, takeStartupPrefetch } = await loadModule();
    await startStartupPrefetch({ includeToday: true });

    mocks.getCachedAuthUserId.mockReturnValue("someone-else");

    expect(takeStartupPrefetch("state")).toBeNull();
    expect(takeStartupPrefetch("today")).toBeNull();
  });

  it("does not raise unhandled rejections when a prefetched request fails", async () => {
    mocks.loadProductStateOrNull.mockRejectedValue(new Error("offline"));
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    const { startStartupPrefetch, takeStartupPrefetch } = await loadModule();

    await startStartupPrefetch({ includeToday: true });

    await expect(takeStartupPrefetch("state")).rejects.toThrow("offline");
    await expect(takeStartupPrefetch("today")).rejects.toThrow("offline");
  });

  it("can be reset for a new session", async () => {
    const { startStartupPrefetch, resetStartupPrefetch, takeStartupPrefetch } = await loadModule();
    await startStartupPrefetch({ includeToday: true });

    resetStartupPrefetch();

    expect(takeStartupPrefetch("state")).toBeNull();
    await startStartupPrefetch({ includeToday: true });
    expect(mocks.loadProductStateOrNull).toHaveBeenCalledTimes(2);
  });
});
