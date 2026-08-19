import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authenticatedFetchMock = vi.fn((_url: string, _init: RequestInit) =>
  Promise.resolve(new Response(null, { status: 204 })),
);

vi.mock("@playfit/core/store", () => ({
  authenticatedFetch: (url: string, init: RequestInit) => authenticatedFetchMock(url, init),
}));

import { recordRecommendationClientEvent } from "./core-loop-analytics";

function lastRequestBody() {
  const call = authenticatedFetchMock.mock.calls.at(-1) as [string, { body: string }] | undefined;
  if (!call) throw new Error("authenticatedFetch was not called");
  return JSON.parse(call[1].body) as { eventId: string };
}

// This test environment's happy-dom `window.localStorage` is a bare object,
// not a real Storage (no get/setItem), so the source's persistence branch is
// exercised against a minimal in-memory stand-in instead.
function installLocalStorageStub() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  });
}

describe("recordRecommendationClientEvent", () => {
  beforeEach(() => {
    authenticatedFetchMock.mockClear();
    installLocalStorageStub();
  });
  afterEach(() => {
    window.localStorage.clear();
  });

  it("reuses the same eventId for the same logical exposure across separate calls (simulated reload)", () => {
    recordRecommendationClientEvent({
      eventName: "recommendation_shown",
      stateVersion: "7",
      gameId: "game-a",
      rank: 1,
    });
    const first = lastRequestBody().eventId;

    // A page reload re-executes the "shown" effect from scratch: no shared
    // in-memory state, only whatever survives in localStorage.
    recordRecommendationClientEvent({
      eventName: "recommendation_shown",
      stateVersion: "7",
      gameId: "game-a",
      rank: 1,
    });
    const second = lastRequestBody().eventId;

    expect(second).toBe(first);
  });

  it("mints a different eventId for a genuinely different exposure (new stateVersion)", () => {
    recordRecommendationClientEvent({
      eventName: "recommendation_shown",
      stateVersion: "7",
      gameId: "game-a",
      rank: 1,
    });
    const first = lastRequestBody().eventId;

    recordRecommendationClientEvent({
      eventName: "recommendation_shown",
      stateVersion: "8",
      gameId: "game-a",
      rank: 1,
    });
    const second = lastRequestBody().eventId;

    expect(second).not.toBe(first);
  });

  it("keeps recommendation_shown, recommendation_skipped and recommendation_saved independently keyed", () => {
    recordRecommendationClientEvent({
      eventName: "recommendation_shown",
      stateVersion: "7",
      gameId: "game-a",
      rank: 1,
    });
    const shown = lastRequestBody().eventId;

    recordRecommendationClientEvent({
      eventName: "recommendation_skipped",
      stateVersion: "7",
      gameId: "game-a",
      rank: 1,
    });
    const skipped = lastRequestBody().eventId;

    expect(skipped).not.toBe(shown);
  });
});
