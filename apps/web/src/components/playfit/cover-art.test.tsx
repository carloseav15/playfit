import type { SeedGame } from "@playfit/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CoverArt } from "./cover-art";

const game: SeedGame = {
  gameId: "hades",
  title: "Hades",
  aliases: [],
  series: "",
  source: "catalog",
  primaryGenre: "roguelike",
  tags: [],
  notes: "",
  coverPath: "",
  externalCoverUrl: "https://images.igdb.com/igdb/image/upload/t_cover_big/cob9kr.jpg",
  availablePlatformIds: [],
  availablePlatformNames: [],
  releaseState: "released",
};

function stubImageLoadState(complete: boolean) {
  Object.defineProperty(HTMLImageElement.prototype, "complete", {
    configurable: true,
    get: () => complete,
  });
}

describe("CoverArt", () => {
  beforeEach(() => stubImageLoadState(false));
  afterEach(cleanup);

  it("upgrades IGDB covers to the high-resolution derivative", () => {
    render(<CoverArt game={game} />);

    expect(screen.getByRole("img", { name: "Hades cover art" }).getAttribute("src")).toContain(
      "t_1080p",
    );
  });

  it("swaps a failed cover for the initials placeholder", () => {
    render(<CoverArt game={game} />);

    fireEvent.error(screen.getByRole("img", { name: "Hades cover art" }));

    const placeholder = screen.getByRole("img", { name: "Hades cover art" });
    expect(placeholder.tagName).toBe("DIV");
    expect(placeholder.textContent).toBe("H");
  });

  it("keeps the decorative placeholder hidden from assistive tech after a failure", () => {
    const { container } = render(<CoverArt game={game} decorative />);

    fireEvent.error(container.querySelector("img") as HTMLImageElement);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe("H");
  });

  it("falls back when the image already failed before hydration", () => {
    stubImageLoadState(true);
    const { container } = render(<CoverArt game={game} />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Hades cover art" }).textContent).toBe("H");
  });

  it("renders the placeholder without an image when the game has no cover", () => {
    const { container } = render(<CoverArt game={{ ...game, externalCoverUrl: "" }} />);

    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByRole("img", { name: "Hades cover art" }).textContent).toBe("H");
  });
});
