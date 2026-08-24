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

    expect(html).toContain("Save to Picks");
    expect(html).not.toContain("Maybe later");
    expect(html).not.toContain("I&#x27;ll play this");
  });

  it("renders the existing picked state as a disabled save action", () => {
    const html = renderToStaticMarkup(
      <PlayNextCard
        entry={entry}
        primary
        inPlayfitPicks
        onAddPick={vi.fn()}
        onAlreadyPlayed={vi.fn()}
        onNotForMe={vi.fn()}
      />,
    );

    expect(html).toContain("Saved in Playfit Picks");
    expect(html).toMatch(/<button[^>]*disabled[^>]*>.*Saved in Playfit Picks/s);
  });

  it("says 'Play this next' with no close-call note when the top pick is clearly ahead", () => {
    const html = renderToStaticMarkup(
      <PlayNextCard
        entry={entry}
        primary
        closestAlternativeScore={30}
        onAddPick={vi.fn()}
        onAlreadyPlayed={vi.fn()}
        onNotForMe={vi.fn()}
      />,
    );

    expect(html).toContain("Play this next");
    expect(html).not.toContain("Close call");
    expect(html).not.toContain("score almost as high");
    // Normal clear-lead case: an unqualified "Strong match" is correct here
    // since nothing next to it claims otherwise.
    expect(html).toContain("Strong match");
    expect(html).not.toContain("Strong match (close call)");
  });

  it("flags a close call instead of 'Play this next' when scores are nearly tied (e.g. 82 vs 80)", () => {
    const html = renderToStaticMarkup(
      <PlayNextCard
        entry={entry}
        primary
        closestAlternativeScore={80}
        onAddPick={vi.fn()}
        onAlreadyPlayed={vi.fn()}
        onNotForMe={vi.fn()}
      />,
    );

    expect(html).toContain("Close call");
    expect(html).toContain("score almost as high");
    expect(html).not.toContain("Play this next");
  });

  it("does not pair 'Close call' with an unqualified 'Strong match' badge (P1 #4)", () => {
    // Reproduces the exact reported contradiction: entry.affinityScore=82
    // already clears STRONG_FIT_THRESHOLD (78), and closestAlternativeScore=80
    // is a thin 2-point gap, so both the header badge (decisionLabel) and the
    // Match tile (matchQualityLabel) used to render plain "Strong match"
    // right alongside the "Close call" headline -- two badges asserting
    // unqualified certainty next to a headline saying the #1 spot is a toss-up.
    const html = renderToStaticMarkup(
      <PlayNextCard
        entry={entry}
        primary
        closestAlternativeScore={80}
        onAddPick={vi.fn()}
        onAlreadyPlayed={vi.fn()}
        onNotForMe={vi.fn()}
      />,
    );

    expect(html).toContain("Close call");
    expect(html).toContain("Strong match (close call)");
    expect(html).not.toMatch(/Strong match(?!\s*\(close call\))/);
  });

  it("does not claim 'Play this next' for a low-evidence / cold-start pick, avoiding a contradiction with 'Too early to tell'", () => {
    const coldStartEntry = { ...entry, confidence: "low" as const };
    const html = renderToStaticMarkup(
      <PlayNextCard
        entry={coldStartEntry}
        primary
        closestAlternativeScore={30}
        onAddPick={vi.fn()}
        onAlreadyPlayed={vi.fn()}
        onNotForMe={vi.fn()}
      />,
    );

    expect(html).toContain("Exploratory pick");
    expect(html).toContain("Too early to tell");
    expect(html).not.toContain("Play this next");
  });

  it("does not pair 'Exploratory pick' with an unqualified 'Strong match' badge for a high-affinity cold-start pick", () => {
    // affinityScore=82 is above STRONG_FIT_THRESHOLD, so the Match tile would
    // otherwise say plain "Strong match" -- asserting certainty the headline
    // ("Exploratory pick") explicitly says Playfit doesn't have yet.
    const coldStartEntry = { ...entry, confidence: "low" as const };
    const html = renderToStaticMarkup(
      <PlayNextCard
        entry={coldStartEntry}
        primary
        closestAlternativeScore={30}
        onAddPick={vi.fn()}
        onAlreadyPlayed={vi.fn()}
        onNotForMe={vi.fn()}
      />,
    );

    expect(html).toContain("Exploratory pick");
    expect(html).toContain("Strong match (early)");
    expect(html).not.toMatch(/Strong match(?!\s*\(early\))/);
  });

  it("uses 'Not for me' consistently for the reject action, not 'No, skip this'", () => {
    const html = renderToStaticMarkup(
      <PlayNextCard
        entry={entry}
        primary
        closestAlternativeScore={30}
        onAddPick={vi.fn()}
        onAlreadyPlayed={vi.fn()}
        onNotForMe={vi.fn()}
      />,
    );

    expect(html).toContain("Not for me");
    expect(html).not.toContain("No, skip this");
  });

  it("still surfaces the watch-outs score for a close-call pick instead of hiding risk behind confidence", () => {
    const riskyEntry = { ...entry, riskScore: 50 };
    const html = renderToStaticMarkup(
      <PlayNextCard
        entry={riskyEntry}
        primary
        closestAlternativeScore={80}
        onAddPick={vi.fn()}
        onAlreadyPlayed={vi.fn()}
        onNotForMe={vi.fn()}
      />,
    );

    expect(html).toContain("Watch-outs");
    expect(html).toContain("50/100");
  });

  it("keeps fit reasons rendered alongside the trust-signal note", () => {
    const html = renderToStaticMarkup(
      <PlayNextCard
        entry={entry}
        primary
        closestAlternativeScore={80}
        onAddPick={vi.fn()}
        onAlreadyPlayed={vi.fn()}
        onNotForMe={vi.fn()}
      />,
    );

    expect(html).toContain("Matches your early taste signals.");
  });
});
