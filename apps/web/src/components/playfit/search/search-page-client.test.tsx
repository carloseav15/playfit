import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/search",
}));

vi.mock("@/components/playfit/use-game-search", () => ({
  useGameSearch: () => ({
    results: [],
    total: 0,
    pending: false,
    error: null,
    resolvedKey: "",
    retry: vi.fn(),
  }),
}));

async function renderSearch(initialQuery = "") {
  const { SearchPageClient } = await import("./search-page-client");
  return render(
    <SearchPageClient
      platforms={[]}
      genres={[]}
      initialQuery={initialQuery}
      initialFamily="playstation"
      initialGenre="jrpg"
    />,
  );
}

describe("SearchPageClient", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("./search-config", () => ({
      SEARCH_FILTERS_ENABLED: false,
      SEARCH_SUBTITLE: "Find any game in Playfit's library by title.",
    }));
    window.history.replaceState(null, "", "/search");
  });
  afterEach(cleanup);

  it("focuses the search input once it becomes interactive", async () => {
    await renderSearch();

    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Search by title" }));
  });

  it("places the cursor at the end of a restored query", async () => {
    await renderSearch("chrono");
    const input = screen.getByRole("textbox", { name: "Search by title" }) as HTMLInputElement;

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe("chrono".length);
    expect(input.selectionEnd).toBe("chrono".length);
  });

  it("asks mobile keyboards for a search layout", async () => {
    await renderSearch();
    const input = screen.getByRole("textbox", { name: "Search by title" });

    expect(input.getAttribute("inputmode")).toBe("search");
    expect(input.getAttribute("enterkeyhint")).toBe("search");
  });

  it("hides the platform and genre filters and ignores filter params while disabled", async () => {
    await renderSearch();

    expect(screen.queryByText("Platform")).toBeNull();
    expect(screen.queryByText("Genre")).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Search by title" }), {
      target: { value: "zelda" },
    });
    expect(window.location.search).toBe("?q=zelda");
  });
});
