import type { ProductPlayNextModel } from "@playfit/core/types";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlayNextRecommendations } from "./use-play-next-recommendations";

const mocks = vi.hoisted(() => ({
  authenticatedFetch: vi.fn(),
  getCachedAuthUserId: vi.fn(),
  addGamesToCache: vi.fn(),
  addRecommendationsToSessionCache: vi.fn(),
  getLastPlayNextModel: vi.fn(),
  setLastPlayNextModel: vi.fn(),
  clearLastPlayNextModel: vi.fn(),
}));

vi.mock("@playfit/core/store", () => ({
  authenticatedFetch: mocks.authenticatedFetch,
  getCachedAuthUserId: mocks.getCachedAuthUserId,
}));

vi.mock("@/lib/game-cache", () => ({
  addGamesToCache: mocks.addGamesToCache,
}));

vi.mock("./recommendation-cache", () => ({
  addRecommendationsToSessionCache: mocks.addRecommendationsToSessionCache,
  getLastPlayNextModel: mocks.getLastPlayNextModel,
  setLastPlayNextModel: mocks.setLastPlayNextModel,
  clearLastPlayNextModel: mocks.clearLastPlayNextModel,
}));

const USER_A = "user-a";
const USER_B = "user-b";

function model(stateVersion: string): ProductPlayNextModel {
  return {
    primary: null,
    alternatives: [],
    savedPickIds: [],
    stateVersion,
    rankingMetadata: { profileStateVersion: stateVersion, candidates: [] },
  };
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function failResponse(status: number) {
  return { ok: false, status, json: async () => ({}) } as Response;
}

function renderPlayNext(overrides: { stateVersion?: string; errorMessage?: string } = {}) {
  return renderHook(() =>
    usePlayNextRecommendations({
      enabled: true,
      stateVersion: overrides.stateVersion ?? "7",
      errorMessage: overrides.errorMessage ?? "Play Next could not be refreshed.",
    }),
  );
}

describe("usePlayNextRecommendations: stateVersion/user identity invariant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedAuthUserId.mockReturnValue(USER_A);
    mocks.getLastPlayNextModel.mockReturnValue(null);
  });

  // Case A
  it("1) same user + same stateVersion: reuses the cached model and renders it immediately", () => {
    mocks.getLastPlayNextModel.mockImplementation((userId: string, stateVersion: string) =>
      userId === USER_A && stateVersion === "7" ? model("7") : null,
    );
    mocks.authenticatedFetch.mockReturnValue(new Promise(() => {})); // in-flight refresh, irrelevant here

    const { result } = renderPlayNext({ stateVersion: "7" });

    expect(mocks.getLastPlayNextModel).toHaveBeenCalledWith(USER_A, "7");
    expect(result.current.model?.stateVersion).toBe("7");
    expect(result.current.loading).toBe(false);
  });

  // Case B
  it("2) same user, cached stateVersion 7 but canonical is now 12: the stale model is never rendered", () => {
    mocks.getLastPlayNextModel.mockImplementation((userId: string, stateVersion: string) =>
      userId === USER_A && stateVersion === "7" ? model("7") : null,
    );
    mocks.authenticatedFetch.mockReturnValue(new Promise(() => {})); // never resolves in this assertion window

    const { result } = renderPlayNext({ stateVersion: "12" });

    // The lookup is keyed by the *current* canonical stateVersion (12), not the cached one (7).
    expect(mocks.getLastPlayNextModel).toHaveBeenCalledWith(USER_A, "12");
    // No hit for stateVersion 12 -> no seed at all, at any point, including the very first render.
    expect(result.current.model).toBeNull();
  });

  // Case C
  it("3) cache belongs to a different user: never rendered, even transiently", () => {
    mocks.getCachedAuthUserId.mockReturnValue(USER_B);
    mocks.getLastPlayNextModel.mockImplementation((userId: string, stateVersion: string) =>
      userId === USER_A && stateVersion === "7" ? model("7") : null,
    );
    mocks.authenticatedFetch.mockReturnValue(new Promise(() => {}));

    const { result } = renderPlayNext({ stateVersion: "7" });

    expect(mocks.getLastPlayNextModel).toHaveBeenCalledWith(USER_B, "7");
    expect(result.current.model).toBeNull();
  });

  // Case: no valid cache at all (true cold start)
  it("4) no valid current-user/current-stateVersion cache: a first scoring timeout is recovered by the bounded retry", async () => {
    mocks.authenticatedFetch
      .mockResolvedValueOnce(failResponse(500))
      .mockResolvedValueOnce(okResponse(model("7")));

    const { result } = renderPlayNext({ stateVersion: "7" });

    await waitFor(() => expect(result.current.model?.stateVersion).toBe("7"));

    expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(2);
    expect(result.current.loadError).toBeNull();
  });

  // Case A + refresh failure
  it("5) valid same-version cache: a failed returning fetch keeps the valid cached model, not an error", async () => {
    mocks.getLastPlayNextModel.mockImplementation((userId: string, stateVersion: string) =>
      userId === USER_A && stateVersion === "7" ? model("7") : null,
    );
    mocks.authenticatedFetch
      .mockResolvedValueOnce(failResponse(500))
      .mockResolvedValueOnce(failResponse(500));

    const { result } = renderPlayNext({ stateVersion: "7" });
    // Seeded synchronously, before any network call resolves.
    expect(result.current.model?.stateVersion).toBe("7");

    await waitFor(() => expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(2));

    expect(result.current.loadError).toBeNull();
    expect(result.current.model?.stateVersion).toBe("7");
  });

  // Case: fresh fetch replaces the cache
  it("6) a successful current-stateVersion fetch replaces the cache under the current user", async () => {
    mocks.authenticatedFetch.mockResolvedValueOnce(okResponse(model("12")));

    const { result } = renderPlayNext({ stateVersion: "12" });

    await waitFor(() => expect(result.current.model?.stateVersion).toBe("12"));

    expect(mocks.setLastPlayNextModel).toHaveBeenCalledWith(USER_A, model("12"));
  });

  it("does not persist to the cache when identity is unresolved", async () => {
    mocks.getCachedAuthUserId.mockReturnValue(null);
    mocks.authenticatedFetch.mockResolvedValueOnce(okResponse(model("7")));

    const { result } = renderPlayNext({ stateVersion: "7" });

    await waitFor(() => expect(result.current.model?.stateVersion).toBe("7"));

    expect(mocks.setLastPlayNextModel).not.toHaveBeenCalled();
    expect(mocks.getLastPlayNextModel).not.toHaveBeenCalled();
  });

  // Case: sign-out / account transition
  it("7) clears the cache when the hook becomes disabled (sign-out)", () => {
    const { rerender } = renderHook(
      ({ enabled }) =>
        usePlayNextRecommendations({
          enabled,
          stateVersion: "7",
          errorMessage: "Could not load",
        }),
      { initialProps: { enabled: true } },
    );

    rerender({ enabled: false });

    expect(mocks.clearLastPlayNextModel).toHaveBeenCalled();
  });

  it("does not retry a background refresh, since it already has a stale pool to fall back on", async () => {
    mocks.authenticatedFetch.mockResolvedValueOnce(okResponse(model("7")));

    const { result } = renderPlayNext({ stateVersion: "7" });

    await waitFor(() => expect(result.current.model?.stateVersion).toBe("7"));
    mocks.authenticatedFetch.mockClear();
    mocks.authenticatedFetch.mockResolvedValueOnce(failResponse(500));

    act(() => {
      result.current.refreshRecommendations();
    });

    await waitFor(() => expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(1));
    expect(result.current.model?.stateVersion).toBe("7");
  });

  it("surfaces the error when both the cold-start fetch and its retry fail", async () => {
    mocks.authenticatedFetch
      .mockResolvedValueOnce(failResponse(500))
      .mockResolvedValueOnce(failResponse(500));

    const { result } = renderPlayNext({ stateVersion: "7" });

    await waitFor(() => expect(result.current.loadError).toBe("Play Next could not be refreshed."));

    expect(mocks.authenticatedFetch).toHaveBeenCalledTimes(2);
    expect(result.current.model).toBeNull();
  });

  it("has no channel to mutate profile-save UI state -- a refresh failure cannot touch it", async () => {
    // usePlayNextRecommendations takes no setUi (or any UI-mutation callback) at all, so a
    // recommendation-refresh failure is structurally incapable of writing to
    // ui.saveStatus/statusMessage -- those belong exclusively to useQueuedProfileSave's own
    // doSave. This locks in that surface: if a future change ever threads a UI setter into
    // this hook, this test starts failing and calls out the coupling explicitly.
    mocks.authenticatedFetch
      .mockResolvedValueOnce(failResponse(500))
      .mockResolvedValueOnce(failResponse(500));

    const { result } = renderPlayNext({ stateVersion: "7" });
    await waitFor(() => expect(result.current.loadError).not.toBeNull());

    const returnedKeys = Object.keys(result.current);
    expect(returnedKeys).not.toContain("setUi");
    expect(returnedKeys).not.toContain("saveStatus");
    expect(returnedKeys).not.toContain("statusMessage");
    expect(returnedKeys.sort()).toEqual(
      ["loadError", "loading", "model", "refreshRecommendations", "refreshing"].sort(),
    );
  });
});
