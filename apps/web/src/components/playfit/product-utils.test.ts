import type { RankedSeedGame } from "@playfit/core/types";
import { describe, expect, it } from "vitest";
import {
  confidenceMeterValue,
  decisionLabel,
  decisionTone,
  matchQualityLabel,
  playNextHeadline,
  playNextTrustNote,
  playNextTrustSignal,
} from "./product-utils";

function entry(overrides: Partial<RankedSeedGame> = {}): RankedSeedGame {
  return {
    game: {
      gameId: "g1",
      title: "Test Game",
      aliases: [],
      series: "Test Game",
      source: "catalog",
      primaryGenre: "action_adventure",
      tags: ["story_rich"],
      notes: "",
      coverPath: "",
      availablePlatformIds: ["pc"],
      availablePlatformNames: ["PC"],
      releaseState: "released",
    },
    affinityScore: 60,
    riskScore: 10,
    confidence: "high",
    fitReasons: [],
    cautionReasons: [],
    platformAvailability: "available",
    accessStatus: "playable",
    inBacklog: false,
    inWishlist: false,
    inPlayfitPicks: false,
    similarGames: [],
    ...overrides,
  };
}

describe("playNextTrustSignal", () => {
  it("returns clear_lead when the top pick is well ahead of the next candidate", () => {
    const signal = playNextTrustSignal(entry({ affinityScore: 87, confidence: "high" }), 35);
    expect(signal).toBe("clear_lead");
    expect(playNextHeadline(signal)).toBe("Play this next");
    expect(playNextTrustNote(signal)).toBeNull();
  });

  it("returns close_call for near-tied scores like 60/59/58, even though the ranking is unaffected", () => {
    const signal = playNextTrustSignal(entry({ affinityScore: 60, confidence: "high" }), 59);
    expect(signal).toBe("close_call");
    expect(playNextHeadline(signal)).toBe("Close call");
    expect(playNextTrustNote(signal)).toMatch(/almost as high/);
  });

  it("treats a small gap (<=4) as close and a larger gap as a clear lead", () => {
    expect(playNextTrustSignal(entry({ affinityScore: 60, confidence: "high" }), 56)).toBe(
      "close_call",
    );
    expect(playNextTrustSignal(entry({ affinityScore: 60, confidence: "high" }), 55)).toBe(
      "clear_lead",
    );
  });

  it("returns exploratory for low-evidence / cold-start users regardless of the score gap", () => {
    const signal = playNextTrustSignal(entry({ affinityScore: 87, confidence: "low" }), 20);
    expect(signal).toBe("exploratory");
    expect(playNextHeadline(signal)).toBe("Exploratory pick");
    expect(playNextTrustNote(signal)).toMatch(/still calibrating/);
  });

  it("prioritizes exploratory over close_call when both conditions hold", () => {
    const signal = playNextTrustSignal(entry({ affinityScore: 62, confidence: "low" }), 60);
    expect(signal).toBe("exploratory");
  });

  it("falls back to clear_lead when there is no alternative to compare against", () => {
    const signal = playNextTrustSignal(entry({ affinityScore: 87, confidence: "high" }), null);
    expect(signal).toBe("clear_lead");
  });

  it("never changes the underlying affinity/risk/confidence scores it reads", () => {
    const source = entry({ affinityScore: 60, riskScore: 10, confidence: "high" });
    playNextTrustSignal(source, 59);
    expect(source.affinityScore).toBe(60);
    expect(source.riskScore).toBe(10);
    expect(source.confidence).toBe("high");
  });
});

describe("matchQualityLabel", () => {
  it("keeps the plain tier label when no trust signal is passed (non-primary cards)", () => {
    expect(matchQualityLabel(90)).toBe("Strong match");
  });

  it("keeps the plain tier label for a clear-lead primary pick", () => {
    expect(matchQualityLabel(90, "clear_lead")).toBe("Strong match");
  });

  it("does not assert unqualified certainty for a high-affinity exploratory pick", () => {
    // This is the exact contradiction reported from production dogfooding:
    // a candidate can score high on affinity while the user's overall
    // confidence is still low, so the top pick reads "Exploratory pick".
    // The Match tile must not simultaneously claim plain "Strong match" --
    // that asserts the certainty the headline says Playfit doesn't have yet.
    const label = matchQualityLabel(90, "exploratory");
    expect(label).toBe("Strong match (early)");
    expect(label).not.toBe("Strong match");
  });

  it("does not pair an unqualified 'Strong match' with a 'Close call' headline (P1 #4)", () => {
    // playNextTrustSignal can independently return close_call (a thin gap to
    // the next-best candidate) for a pick whose own affinityScore already
    // clears STRONG_FIT_THRESHOLD -- e.g. 82 vs 80. Both facts are true and
    // measure different things (this candidate's own fit vs. how decisively
    // it beats the runner-up), but an unqualified "Strong match" badge next
    // to a "Close call" headline reads as two conflicting verdicts.
    const label = matchQualityLabel(90, "close_call");
    expect(label).toBe("Strong match (close call)");
    expect(label).not.toBe("Strong match");
  });

  it("leaves the softer tiers (Promising/Moderate/Early) unchanged under exploratory or close_call", () => {
    expect(matchQualityLabel(65, "exploratory")).toBe("Promising");
    expect(matchQualityLabel(40, "exploratory")).toBe("Moderate match");
    expect(matchQualityLabel(10, "exploratory")).toBe("Early match");
    expect(matchQualityLabel(65, "close_call")).toBe("Promising");
    expect(matchQualityLabel(40, "close_call")).toBe("Moderate match");
    expect(matchQualityLabel(10, "close_call")).toBe("Early match");
  });
});

describe("decisionLabel", () => {
  it("keeps the plain tier label when no trust signal is passed (non-primary cards, dossier)", () => {
    expect(decisionLabel(entry({ affinityScore: 90 }))).toBe("Strong match");
  });

  it("keeps the plain tier label for a clear-lead primary pick", () => {
    expect(decisionLabel(entry({ affinityScore: 90 }), "clear_lead")).toBe("Strong match");
  });

  it("does not pair an unqualified 'Strong match' with a 'Close call' headline (P1 #4)", () => {
    // Same reproduction as the matchQualityLabel case above, but for the
    // header-row badge: entry({affinityScore: 90}) already clears
    // STRONG_FIT_THRESHOLD, and a close_call signal must not let this badge
    // assert plain "Strong match" right next to a "Close call" headline.
    const label = decisionLabel(entry({ affinityScore: 90 }), "close_call");
    expect(label).toBe("Strong match (close call)");
    expect(label).not.toBe("Strong match");
  });

  it("never reaches the close_call branch for a low-confidence entry -- 'Too early to tell' wins first", () => {
    // playNextTrustSignal only ever returns "exploratory" when confidence is
    // "low", and decisionLabel's own confidence check already short-circuits
    // to "Too early to tell" before the Strong-match branch in that case, so
    // no separate exploratory handling is needed here.
    const coldStart = entry({ affinityScore: 90, confidence: "low" });
    expect(decisionLabel(coldStart, "exploratory")).toBe("Too early to tell");
  });

  it("lets a high watch-out score win regardless of the trust signal", () => {
    const risky = entry({ affinityScore: 90, riskScore: 80 });
    expect(decisionLabel(risky, "close_call")).toBe("Watch out");
  });
});

describe("confidenceMeterValue", () => {
  it("never renders a full meter for anything less than high confidence", () => {
    expect(confidenceMeterValue("low")).toBeLessThan(50);
    expect(confidenceMeterValue("medium")).toBeLessThan(100);
    expect(confidenceMeterValue("high")).toBe(100);
  });
});

describe("existing ranking/quality copy is unaffected by the trust signal", () => {
  it("keeps decisionLabel and decisionTone based only on the candidate's own scores", () => {
    const highRisk = entry({ riskScore: 80, affinityScore: 90, confidence: "high" });
    expect(decisionTone(highRisk)).toBe("negative");
    expect(decisionLabel(highRisk)).toBe("Watch out");
  });
});
