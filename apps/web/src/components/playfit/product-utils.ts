import {
  HIGH_FRICTION_THRESHOLD,
  PROMISING_FIT_THRESHOLD,
  STRONG_FIT_THRESHOLD,
} from "@playfit/core/domain";
import type { RankedSeedGame } from "@playfit/core/types";

export function formatDisplayGenre(genre?: string): string {
  if (!genre || genre.toLowerCase() === "unknown") return "";

  const words = genre
    .replace(/[;_/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ");

  return words
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === "jrpg") return "JRPG";
      if (lower === "rpg") return "RPG";
      if (lower === "fps") return "FPS";
      if (lower === "mmo") return "MMO";
      if (lower === "rts") return "RTS";
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

export function isValidReleaseYear(year?: string): boolean {
  if (!year) return false;
  return /^\d{4}$/.test(year) && year !== "0000";
}

export function confidenceLabel(value: RankedSeedGame["confidence"]) {
  if (value === "high") return "Strong signal";
  if (value === "medium") return "Building signal";
  return "First look";
}

export function decisionTone(entry: RankedSeedGame): "positive" | "warning" | "negative" | "info" {
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD) return "negative";
  if (entry.confidence === "low") return "warning";
  if (entry.affinityScore >= STRONG_FIT_THRESHOLD && entry.riskScore <= 35) return "positive";
  if (entry.affinityScore >= PROMISING_FIT_THRESHOLD) return "info";
  return "warning";
}

/**
 * `signal` is optional and only passed for the primary Play Next card. There,
 * this label sits in the same header row as the trust-signal headline
 * (playNextHeadline) -- without qualifying it, a near-tied top pick would
 * show "Close call" right next to an unqualified "Strong match" badge,
 * reading as two contradictory verdicts about the same recommendation. A
 * low-confidence ("exploratory") entry never reaches the Strong-match branch
 * here: it already returns "Too early to tell" via the confidence check above.
 */
export function decisionLabel(entry: RankedSeedGame, signal?: PlayNextTrustSignal) {
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD) return "Watch out";
  if (entry.confidence === "low") return "Too early to tell";
  if (entry.affinityScore >= STRONG_FIT_THRESHOLD) {
    return signal === "close_call" ? "Strong match (close call)" : "Strong match";
  }
  if (entry.affinityScore >= PROMISING_FIT_THRESHOLD) return "Promising";
  return "Still learning";
}

/**
 * `signal` is optional and only passed for the primary Play Next card, where
 * a trust-signal headline ("Exploratory pick" or "Close call") sits right
 * next to this label. Without it:
 * - a high-affinity match under low confidence would read as "Strong match"
 *   -- asserting the exact certainty the "Exploratory pick" headline says
 *   Playfit doesn't have yet;
 * - a high-affinity match that's nearly tied with the next-best candidate
 *   would read as an unqualified "Strong match" right next to "Close call",
 *   which a reasonable user reads as two conflicting verdicts about the same
 *   pick, even though the two labels measure different things (this
 *   candidate's own fit vs. how decisively it beats the runner-up).
 */
export function matchQualityLabel(score: number, signal?: PlayNextTrustSignal) {
  if (score >= STRONG_FIT_THRESHOLD) {
    if (signal === "exploratory") return "Strong match (early)";
    if (signal === "close_call") return "Strong match (close call)";
    return "Strong match";
  }
  if (score >= PROMISING_FIT_THRESHOLD) return "Promising";
  if (score >= 35) return "Moderate match";
  return "Early match";
}

export function watchOutLabel(score: number) {
  if (score >= HIGH_FRICTION_THRESHOLD) return "High friction";
  if (score >= 35) return "Some watch-outs";
  if (score >= 15) return "Low watch-out";
  return "Clear read";
}

// Mirrors watchOutLabel's bands so the metric's fill color never contradicts its own
// label (e.g. a "Clear read" score previously rendered in the same warning color as
// "Some watch-outs", reading as cautionary even though it's good news).
export function watchOutColorClass(score: number) {
  if (score >= HIGH_FRICTION_THRESHOLD) return "bg-destructive";
  if (score >= 35) return "bg-warning";
  return "bg-positive";
}

export function primaryReason(entry: RankedSeedGame) {
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD && entry.cautionReasons[0]) {
    return entry.cautionReasons[0];
  }
  return entry.fitReasons[0] ?? "Rate a few more games to strengthen this signal.";
}

export function recommendationGroupTitle(entries: RankedSeedGame[]) {
  if (entries.length > 0 && entries.every((entry) => entry.confidence === "low")) {
    return "First reads";
  }

  return "Best matches";
}

/**
 * How confidently the #1 Play Next pick should be presented, derived purely
 * from data already computed for the ranked list (no new scoring signal):
 * how much evidence Playfit has on this user (entry.confidence) and how far
 * ahead the top pick's affinity is from the next-best visible candidate.
 * A close affinityScore gap means the ranking is mathematically correct but
 * not decisive -- the UI shouldn't claim more certainty than the numbers hold.
 */
export type PlayNextTrustSignal = "clear_lead" | "close_call" | "exploratory";

const CLOSE_CALL_AFFINITY_GAP = 4;

export function playNextTrustSignal(
  primary: RankedSeedGame,
  closestAlternativeScore: number | null | undefined,
): PlayNextTrustSignal {
  if (primary.confidence === "low") return "exploratory";
  if (
    typeof closestAlternativeScore === "number" &&
    primary.affinityScore - closestAlternativeScore <= CLOSE_CALL_AFFINITY_GAP
  ) {
    return "close_call";
  }
  return "clear_lead";
}

export function playNextHeadline(signal: PlayNextTrustSignal) {
  if (signal === "exploratory") return "Exploratory pick";
  if (signal === "close_call") return "Close call";
  return "Play this next";
}

export function playNextTrustNote(signal: PlayNextTrustSignal) {
  if (signal === "close_call") {
    return "A few other options score almost as high -- see Also worth considering.";
  }
  if (signal === "exploratory") {
    return "Limited signal so far. Playfit is still calibrating to your taste.";
  }
  return null;
}

/** Presentation-only fill for the Confidence meter -- confidence is a label,
 * not a score, so this never claims more precision than "low/medium/high". */
export function confidenceMeterValue(value: RankedSeedGame["confidence"]) {
  if (value === "high") return 100;
  if (value === "medium") return 66;
  return 33;
}
