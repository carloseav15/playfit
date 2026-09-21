import { describe, expect, it, vi } from "vitest";
import { peekInFlight, singleFlight } from "./single-flight";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("singleFlight", () => {
  it("runs one task for concurrent callers with the same key and shares the result", async () => {
    const gate = deferred<string>();
    const task = vi.fn(() => gate.promise);

    const first = singleFlight("same", task);
    const second = singleFlight("same", task);
    const third = singleFlight("same", task);
    gate.resolve("model");

    await expect(Promise.all([first, second, third])).resolves.toEqual(["model", "model", "model"]);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("keeps different keys independent", async () => {
    const task = vi.fn(async () => "ok");

    await Promise.all([singleFlight("a", task), singleFlight("b", task)]);

    expect(task).toHaveBeenCalledTimes(2);
  });

  it("runs the task again once the previous call has settled", async () => {
    const task = vi.fn(async () => "ok");

    await singleFlight("again", task);
    await singleFlight("again", task);

    expect(task).toHaveBeenCalledTimes(2);
  });

  it("shares a failure with concurrent callers and then allows a retry", async () => {
    const gate = deferred<string>();
    const failing = vi.fn(() => gate.promise);
    const first = singleFlight("fails", failing);
    const second = singleFlight("fails", failing);
    gate.reject(new Error("scoring failed"));

    await expect(first).rejects.toThrow("scoring failed");
    await expect(second).rejects.toThrow("scoring failed");
    expect(failing).toHaveBeenCalledTimes(1);

    await expect(singleFlight("fails", async () => "recovered")).resolves.toBe("recovered");
  });

  it("does not let a synchronous throw leave the key stuck", async () => {
    await expect(
      singleFlight("throws", () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(singleFlight("throws", async () => "fine")).resolves.toBe("fine");
  });

  it("lets a reader join a running task without starting a new one", async () => {
    const gate = deferred<string>();
    const running = singleFlight("peek", () => gate.promise);

    expect(peekInFlight<string>("peek")).not.toBeNull();
    gate.resolve("shared");

    await expect(peekInFlight<string>("peek")).resolves.toBe("shared");
    await running;
    expect(peekInFlight("peek")).toBeNull();
  });
});
