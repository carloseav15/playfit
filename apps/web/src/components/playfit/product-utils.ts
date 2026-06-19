import {
  HIGH_FRICTION_THRESHOLD,
  PROMISING_FIT_THRESHOLD,
  STRONG_FIT_THRESHOLD,
} from "@playfit/core/domain";
import type {
  ProductPlayStatus,
  ProductUserState,
  RankedSeedGame,
  SeedGame,
} from "@playfit/core/types";
import {
  AlertTriangle,
  Archive,
  Award,
  BookmarkPlus,
  Check,
  Flag,
  HelpCircle,
  Pause,
  Play,
  TrendingUp,
  XCircle,
} from "lucide-react";
import type { ComponentType } from "react";

export interface StatusOption {
  value: ProductPlayStatus | "";
  label: string;
  description: string;
}

const statusOrder: Record<ProductPlayStatus, number> = {
  playing: 0,
  want_to_play: 1,
  on_hold: 2,
  shelved: 3,
  beaten: 4,
  completed: 5,
  abandoned: 6,
};

export function statusPriority(status: ProductPlayStatus | undefined): number {
  if (!status) return 7;
  return statusOrder[status] ?? 7;
}

export const statusOptions: StatusOption[] = [
  { value: "playing", label: "Playing", description: "Currently playing" },
  { value: "on_hold", label: "On hold", description: "Paused, will return later" },
  { value: "shelved", label: "Shelved", description: "Put aside, maybe return" },
  { value: "beaten", label: "Finished story", description: "Completed the main objective" },
  { value: "completed", label: "Completed 100%", description: "All quests, items, collectibles" },
  { value: "abandoned", label: "Abandoned", description: "Given up on, won't play again" },
  { value: "want_to_play", label: "Want to play", description: "On my list to play next" },
];

export function formatGenre(value: string) {
  const cleaned = value
    .replace(/[;_/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned || cleaned.toLowerCase() === "unknown") {
    return "Metadata pending";
  }

  return cleaned;
}

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

export function formatGameDescriptor(game: SeedGame) {
  if (game.series && game.series.toLowerCase() !== "unknown") return game.series;
  return formatGenre(game.primaryGenre);
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

export function recommendationGroupCopy(entries: RankedSeedGame[]) {
  if (entries.length > 0 && entries.every((entry) => entry.confidence === "low")) {
    return "First signals from what you shared. Every rating sharpens the read.";
  }

  return "Games with the strongest signal right now.";
}

export function buildPlatformsKey(user: ProductUserState): string {
  return user.onboarding.platforms
    .map((entry) => entry.platformId)
    .sort()
    .join(",");
}

export type BadgeTone = "positive" | "warning" | "negative" | "info" | "default";

export const decisionIcons = {
  positive: Check,
  info: TrendingUp,
  warning: HelpCircle,
  negative: AlertTriangle,
} as const;

export const statusIconMap: Record<ProductPlayStatus, ComponentType<{ className?: string }>> = {
  playing: Play,
  on_hold: Pause,
  shelved: Archive,
  beaten: Flag,
  completed: Award,
  abandoned: XCircle,
  want_to_play: BookmarkPlus,
};

export const statusBadgeTone: Record<ProductPlayStatus, BadgeTone> = {
  playing: "positive",
  on_hold: "warning",
  shelved: "default",
  beaten: "info",
  completed: "positive",
  abandoned: "negative",
  want_to_play: "info",
};
