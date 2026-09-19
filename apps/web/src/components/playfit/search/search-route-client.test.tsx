import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./search-page-client", () => ({
  SearchPageClient: ({
    filtersReady,
    filtersError,
    onRetryFilters,
  }: {
    filtersReady: boolean;
    filtersError: boolean;
    onRetryFilters: () => void;
  }) => (
    <div>
      <input aria-label="Search by title" />
      <p>{filtersReady ? "Filters ready" : filtersError ? "Filters failed" : "Filters pending"}</p>
      <button type="button" onClick={onRetryFilters}>
        Retry
      </button>
    </div>
  ),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("SearchRouteClient", () => {
  it("shows the search input while metadata is pending and can recover from a failure", async () => {
    let complete!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch")
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ platforms: [], genres: [] })));
    const { SearchRouteClient } = await import("./search-route-client");
    render(<SearchRouteClient initialQuery="" initialFamily={null} initialGenre={null} />);
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByText("Filters pending")).toBeTruthy();
    await act(async () => complete(new Response("", { status: 503 })));
    expect(screen.getByRole("textbox")).toBeTruthy();
    expect(screen.getByText("Filters failed")).toBeTruthy();
    fireEvent.click(screen.getByText("Retry"));
    await screen.findByText("Filters ready");
  });
});
