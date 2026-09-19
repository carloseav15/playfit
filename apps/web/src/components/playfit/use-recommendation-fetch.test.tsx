import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRecommendationFetch } from "./use-recommendation-fetch";

describe("background recommendation refresh", () => {
  it("keeps visible data through a delayed refresh and exposes a recoverable error", async () => {
    const previous = ["saved pick"];
    const { result } = renderHook(() => useRecommendationFetch("Refresh failed", previous));
    let reject!: (reason: Error) => void;
    let operation!: Promise<void>;
    act(() => {
      operation = result.current.execute(
        () =>
          new Promise((_, fail) => {
            reject = fail;
          }),
        {
          background: true,
          keepStaleOnError: true,
          reportStaleError: true,
        },
      );
    });
    expect(result.current.data).toBe(previous);
    expect(result.current.loading).toBe(false);
    expect(result.current.refreshing).toBe(true);
    await act(async () => {
      reject(new Error("Offline"));
      await operation;
    });
    expect(result.current.data).toBe(previous);
    expect(result.current.refreshing).toBe(false);
    expect(result.current.loadError).toBe("Offline");
    await act(async () => {
      await result.current.execute(async () => ["updated pick"], { background: true });
    });
    expect(result.current.data).toEqual(["updated pick"]);
    expect(result.current.loadError).toBeNull();
  });
});
