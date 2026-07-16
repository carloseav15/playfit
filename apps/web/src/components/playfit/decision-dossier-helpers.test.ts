import type { SeedGame } from "@playfit/core/types";
import { describe, expect, it } from "vitest";
import { buildAvailablePlatformList, getSafeSearchReturnTo } from "./decision-dossier-helpers";

const game: SeedGame = {
  gameId: "game-1",
  title: "Game One",
  aliases: [],
  series: "",
  source: "catalog",
  primaryGenre: "action",
  genreId: "action",
  tags: [],
  notes: "",
  coverPath: "",
  availablePlatformIds: ["ps5", "switch_2"],
  availablePlatformNames: ["PlayStation 5"],
  releaseState: "released",
};

describe("decision-dossier-helpers", () => {
  it("allows only internal search return paths", () => {
    expect(getSafeSearchReturnTo("/search")).toBe("/search");
    expect(getSafeSearchReturnTo("/search?family=jrpg")).toBe("/search?family=jrpg");
    expect(getSafeSearchReturnTo("https://example.com/redirect")).toBeNull();
    expect(getSafeSearchReturnTo("/settings")).toBeNull();
  });

  it("falls back to platform ids when a display name is missing", () => {
    expect(buildAvailablePlatformList(game)).toEqual([
      { id: "ps5", name: "PlayStation 5" },
      { id: "switch_2", name: "switch_2" },
    ]);
    expect(buildAvailablePlatformList(null)).toEqual([]);
  });
});
