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

export function decisionLabel(entry: RankedSeedGame) {
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD) return "Watch out";
  if (entry.confidence === "low") return "Too early to tell";
  if (entry.affinityScore >= STRONG_FIT_THRESHOLD) return "Strong match";
  if (entry.affinityScore >= PROMISING_FIT_THRESHOLD) return "Promising";
  return "Still learning";
}

export function matchQualityLabel(score: number) {
  if (score >= STRONG_FIT_THRESHOLD) return "Strong match";
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
