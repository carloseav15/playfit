import type { ProductPlayNextModel } from "@playfit/core/types";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticatedFetch: vi.fn(),
  getCachedAuthUserId: vi.fn(),
  takeStartupPrefetch: vi.fn(),
}));

vi.mock("@playfit/core/store", () => ({
  authenticatedFetch: mocks.authenticatedFetch,
  getCachedAuthUserId: mocks.getCachedAuthUserId,
}));

vi.mock("@/lib/startup-prefetch", () => ({
  takeStartupPrefetch: mocks.takeStartupPrefetch,
}));

vi.mock("@/lib/game-cache", () => ({ addGamesToCache: vi.fn() }));

const model: ProductPlayNextModel = {
  primary: null,
  alternatives: [],
  savedPickIds: [],
  stateVersion: "4",
  rankingMetadata: { profileStateVersion: "4", candidates: [] },
};

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200 });
}

async function loadHook() {
  vi.resetModules();
  const module = await import("./use-play-next-recommendations");
  return module.usePlayNextRecommendations;
}

function render(usePlayNext: Awaited<ReturnType<typeof loadHook>>) {
  return renderHook(() =>
    usePlayNext({ enabled: true, stateVersion: "4", errorMessage: "Play Next failed." }),
  );
}

describe("usePlayNextRecommendations startup prefetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedAuthUserId.mockReturnValue("user-1");
    mocks.takeStartupPrefetch.mockReturnValue(null);
    mocks.authenticatedFetch.mockImplementation(async () => json(model));
  });

  it("uses the recommendations that were requested while the app was starting", async () => {
    mocks.takeStartupPrefetch.mockReturnValue(Promise.resolve(json(model)));
    const usePlayNext = await loadHook();

    const { result } = render(usePlayNext);

    await waitFor(() => expect(result.current.model?.stateVersion).toBe("4"));
    expect(mocks.takeStartupPrefetch).toHaveBeenCalledWith("today");
    expect(mocks.authenticatedFetch).not.toHaveBeenCalled();
  });

  it("requests them normally when the early request failed", async () => {
    mocks.takeStartupPrefetch.mockReturnValue(Promise.reject(new Error("offline")));
    const usePlayNext = await loadHook();

    const { result } = render(usePlayNext);

    await waitFor(() => expect(result.current.model?.stateVersion).toBe("4"));
    expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(1);
  });

  it("requests them normally when nothing was prefetched", async () => {
    const usePlayNext = await loadHook();

    const { result } = render(usePlayNext);

    await waitFor(() => expect(result.current.model?.stateVersion).toBe("4"));
    expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(1);
  });

  it("never hands a background refresh the startup request", async () => {
    const usePlayNext = await loadHook();
    const { result } = render(usePlayNext);
    await waitFor(() => expect(result.current.model).not.toBeNull());
    mocks.takeStartupPrefetch.mockClear();
    mocks.takeStartupPrefetch.mockReturnValue(
      Promise.resolve(json({ ...model, stateVersion: "99" })),
    );

    await result.current.refreshRecommendations();

    expect(mocks.takeStartupPrefetch).not.toHaveBeenCalled();
    expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(2);
  });
});
