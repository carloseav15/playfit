import type { SeedGame } from "@playfit/core/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SearchResultRow } from "./search-result-row";

function game(gameId: string, title = gameId): SeedGame {
  return {
    gameId,
    title,
    aliases: [],
    series: "",
    source: "catalog",
    primaryGenre: "action",
    tags: [],
    notes: "",
    coverPath: "",
    availablePlatformIds: [],
    availablePlatformNames: [],
    releaseState: "released",
  };
}

describe("SearchResultRow: stale-result selection guard", () => {
  it("is clickable and fires onSelect by default (not stale)", () => {
    const onSelect = vi.fn();
    render(<SearchResultRow game={game("hades", "Hades")} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /Hades/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("blocks selection when marked disabled (a fresher search is in flight)", () => {
    const onSelect = vi.fn();
    render(<SearchResultRow game={game("hades", "Hades")} onSelect={onSelect} disabled />);

    const row = screen.getByRole("button", { name: /Hades/ });
    expect(row).toBeDisabled();

    fireEvent.click(row);

    expect(onSelect).not.toHaveBeenCalled();
  });

  it("combines staleness with an existing selectionState.isDisabled reason -- either blocks selection", () => {
    const onSelect = vi.fn();
    render(
      <SearchResultRow
        game={game("hades", "Hades")}
        onSelect={onSelect}
        disabled={false}
        selectionState={{
          isCurrentSelection: false,
          isDisabled: true,
          statusLabel: "Already selected as loved",
          tone: "accent",
        }}
      />,
    );

    const row = screen.getByRole("button", { name: /Hades/ });
    expect(row).toBeDisabled();
    fireEvent.click(row);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
