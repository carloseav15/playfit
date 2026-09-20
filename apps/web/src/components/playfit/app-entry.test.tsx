import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppEntry, useAppEntry } from "./app-entry";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("@/app/(play)/layout-client", () => ({
  PlayLayoutClient: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));
vi.mock("./app-header", () => ({ AppHeader: () => <nav>Navigation</nav> }));
vi.mock("./mobile-bottom-nav", () => ({ MobileBottomNav: () => null }));
function EntryContent() {
  const entry = useAppEntry();
  return entry.started ? (
    <p>Application</p>
  ) : (
    <button type="button" onClick={entry.start}>
      Start
    </button>
  );
}

describe("AppEntry", () => {
  beforeEach(() => {
    route.pathname = "/";
    vi.restoreAllMocks();
  });

  it("keeps a cold landing independent of catalog requests", () => {
    const fetcher = vi.spyOn(globalThis, "fetch");
    render(
      <AppEntry initiallyActive={false}>
        <EntryContent />
      </AppEntry>,
    );
    expect(screen.getByText("Start")).toBeTruthy();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    false,
    true,
  ])("leaves public search accessible without creating an app session (returning=%s)", (returning) => {
    route.pathname = "/search";
    const fetcher = vi.spyOn(globalThis, "fetch");
    render(
      <AppEntry initiallyActive={returning}>
        <p>Public search</p>
      </AppEntry>,
    );
    expect(screen.getByText("Public search")).toBeTruthy();
    expect(screen.queryByTestId("app-shell")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps navigation available during a deferred request and reuses the shell across routes", async () => {
    let resolve!: (response: Response) => void;
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const view = render(
      <AppEntry initiallyActive={false}>
        <EntryContent />
      </AppEntry>,
    );
    fireEvent.click(screen.getByText("Start"));
    expect(screen.getByText("Navigation")).toBeTruthy();
    expect(screen.getByText("Getting Playfit ready")).toBeTruthy();
    await act(async () => resolve(new Response(JSON.stringify({ platforms: [] }))));
    const shell = screen.getByTestId("app-shell");
    route.pathname = "/picks";
    view.rerender(
      <AppEntry initiallyActive={false}>
        <p>Picks</p>
      </AppEntry>,
    );
    expect(screen.getByTestId("app-shell")).toBe(shell);
    route.pathname = "/search";
    view.rerender(
      <AppEntry initiallyActive={false}>
        <p>Search</p>
      </AppEntry>,
    );
    expect(screen.getByTestId("app-shell")).toBe(shell);
    route.pathname = "/";
    view.rerender(
      <AppEntry initiallyActive={false}>
        <p>Play Next</p>
      </AppEntry>,
    );
    expect(screen.getByTestId("app-shell")).toBe(shell);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("offers retry without removing navigation after a failed request", async () => {
    const fetcher = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ platforms: [] })));
    render(
      <AppEntry initiallyActive>
        <p>Application</p>
      </AppEntry>,
    );
    await screen.findByText("The catalog could not load");
    expect(screen.getByText("Navigation")).toBeTruthy();
    fireEvent.click(screen.getByText("Try again"));
    await waitFor(() => expect(screen.getByText("Application")).toBeTruthy());
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
