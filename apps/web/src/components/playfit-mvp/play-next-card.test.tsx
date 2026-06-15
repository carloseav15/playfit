import type { RankedSeedGame } from "@playfit/core/types";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PlayNextCard } from "./play-next-card";

vi.mock("../playfit/cover-art", () => ({
  CoverArt: () => "Cover",
}));

vi.mock("../playfit/metric", () => ({
  Metric: ({ label, value }: { label: string; value: number | string }) => `${label}: ${value}`,
}));

const entry: RankedSeedGame = {
  game: {
    gameId: "final_fantasy_vi",
    title: "Final Fantasy VI",
    aliases: [],
    series: "Final Fantasy",
    source: "catalog",
    primaryGenre: "jrpg",
    tags: ["story_rich", "turn_based"],
    notes: "",
    coverPath: "",
    availablePlatformIds: ["switch_2"],
    availablePlatformNames: ["Nintendo Switch 2"],
    releaseState: "released",
  },
  affinityScore: 82,
  riskScore: 12,
  confidence: "medium",
  fitReasons: ["Matches your early taste signals."],
  cautionReasons: [],
  platformAvailability: "available",
  accessStatus: "playable",
  inBacklog: false,
  inWishlist: false,
  inPlayfitPicks: false,
  similarGames: [],
};

describe("PlayNextCard", () => {
  it("uses Playfit Picks as the primary save action", () => {
    const html = renderToStaticMarkup(
      <PlayNextCard
        entry={entry}
        primary
        onAddPick={vi.fn()}
        onAlreadyPlayed={vi.fn()}
        onNotForMe={vi.fn()}
        onShowAnother={vi.fn()}
      />,
    );

    expect(html).toContain("Add to Playfit Picks");
    expect(html).not.toContain("Maybe later");
    expect(html).not.toContain("I&#x27;ll play this");
  });
});
