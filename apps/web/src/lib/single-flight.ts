const inFlight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, task: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = Promise.resolve()
    .then(task)
    .finally(() => {
      if (inFlight.get(key) === promise) inFlight.delete(key);
    });
  inFlight.set(key, promise);
  return promise;
}

export function peekInFlight<T>(key: string): Promise<T> | null {
  return (inFlight.get(key) as Promise<T> | undefined) ?? null;
}
