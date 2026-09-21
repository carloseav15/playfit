import type { ProductState } from "@playfit/core/types";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadProductState: vi.fn(),
  createInitialState: vi.fn(),
  takeStartupPrefetch: vi.fn(),
  ensureGamesCached: vi.fn(),
  clearGameCache: vi.fn(),
}));

vi.mock("@playfit/core/store", () => ({
  loadProductState: mocks.loadProductState,
  createInitialState: mocks.createInitialState,
}));

vi.mock("@/lib/startup-prefetch", () => ({ takeStartupPrefetch: mocks.takeStartupPrefetch }));

vi.mock("@/lib/game-cache", () => ({
  ensureGamesCached: mocks.ensureGamesCached,
  clearGameCache: mocks.clearGameCache,
}));

function makeState(stateVersion: string): ProductState {
  return {
    version: 2,
    stateVersion,
    user: {
      onboarding: { step: "platforms", platforms: [], likedGameIds: [], dislikedGameIds: [] },
      onboardingCompletedAt: null,
      profile: null,
      gameStates: {},
      lastUpdatedAt: null,
    },
  };
}

async function boot() {
  vi.resetModules();
  const { usePlayfitBoot } = await import("./use-playfit-boot");
  const setState = vi.fn();
  const setUi = vi.fn();
  renderHook(() =>
    usePlayfitBoot({
      authUser: { id: "user-1", email: "a@b.c", isAnonymous: false },
      useLocalProfile: false,
      platforms: [],
      enqueueSave: vi.fn(),
      setState,
      setUi,
    }),
  );
  return { setState };
}

describe("usePlayfitBoot startup prefetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
    mocks.createInitialState.mockReturnValue(makeState("0"));
    mocks.loadProductState.mockResolvedValue(makeState("from-network"));
    mocks.takeStartupPrefetch.mockReturnValue(null);
    mocks.ensureGamesCached.mockResolvedValue(undefined);
  });

  it("uses the profile that was requested while the app was starting", async () => {
    mocks.takeStartupPrefetch.mockReturnValue(Promise.resolve(makeState("prefetched")));

    const { setState } = await boot();

    await waitFor(() => expect(setState).toHaveBeenCalled());
    expect(setState.mock.calls[0][0].stateVersion).toBe("prefetched");
    expect(mocks.loadProductState).not.toHaveBeenCalled();
  });

  it("starts from a fresh profile when the early request found none", async () => {
    mocks.takeStartupPrefetch.mockReturnValue(Promise.resolve(null));

    const { setState } = await boot();

    await waitFor(() => expect(setState).toHaveBeenCalled());
    expect(setState.mock.calls[0][0].stateVersion).toBe("0");
    expect(mocks.loadProductState).not.toHaveBeenCalled();
  });

  it("loads the profile normally when the early request failed", async () => {
    mocks.takeStartupPrefetch.mockReturnValue(Promise.reject(new Error("offline")));

    const { setState } = await boot();

    await waitFor(() => expect(setState).toHaveBeenCalled());
    expect(setState.mock.calls[0][0].stateVersion).toBe("from-network");
    expect(mocks.loadProductState).toHaveBeenCalledTimes(1);
  });

  it("loads the profile normally when nothing was prefetched", async () => {
    const { setState } = await boot();

    await waitFor(() => expect(setState).toHaveBeenCalled());
    expect(setState.mock.calls[0][0].stateVersion).toBe("from-network");
    expect(mocks.loadProductState).toHaveBeenCalledTimes(1);
  });
});
