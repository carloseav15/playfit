import {
  HIGH_FRICTION_THRESHOLD,
  PROMISING_FIT_THRESHOLD,
  type ProductPlayStatus,
  type RankedSeedGame,
  STRONG_FIT_THRESHOLD,
} from "@playfit/core";

export interface StatusOption {
  value: ProductPlayStatus | "";
  label: string;
  description: string;
}

const statusOrder: Record<ProductPlayStatus, number> = {
  completed: 0,
  beaten: 1,
  playing: 2,
  want_to_play: 3,
  on_hold: 4,
  shelved: 5,
  abandoned: 6,
};

export function statusPriority(status: ProductPlayStatus | undefined): number {
  if (!status) return 7;
  return statusOrder[status] ?? 7;
}

export const statusOptions: StatusOption[] = [
  { value: "", label: "No status", description: "" },
  { value: "playing", label: "Playing", description: "Currently playing" },
  { value: "on_hold", label: "On hold", description: "Paused, will return later" },
  { value: "shelved", label: "Shelved", description: "Put aside, maybe return" },
  { value: "beaten", label: "Finished story", description: "Completed the main objective" },
  { value: "completed", label: "Completed 100%", description: "All quests, items, collectibles" },
  { value: "abandoned", label: "Abandoned", description: "Given up on, won't play again" },
  { value: "want_to_play", label: "Want to play", description: "On my list to play next" },
];

export function formatGenre(value: string) {
  return value.replaceAll("_", " ");
}

export function confidenceLabel(value: RankedSeedGame["confidence"]) {
  if (value === "high") return "Strong match";
  if (value === "medium") return "Good match";
  return "Needs more data";
}

export function decisionTone(entry: RankedSeedGame): "positive" | "warning" | "negative" | "info" {
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD) return "negative";
  if (entry.affinityScore >= STRONG_FIT_THRESHOLD && entry.riskScore <= 35) return "positive";
  if (entry.affinityScore >= PROMISING_FIT_THRESHOLD) return "info";
  return "warning";
}

export function decisionLabel(entry: RankedSeedGame) {
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD) return "Watch out";
  if (entry.affinityScore >= STRONG_FIT_THRESHOLD) return "Strong fit";
  if (entry.affinityScore >= PROMISING_FIT_THRESHOLD) return "Promising fit";
  return "Inconclusive";
}

export function primaryReason(entry: RankedSeedGame) {
  if (entry.riskScore >= HIGH_FRICTION_THRESHOLD && entry.cautionReasons[0]) {
    return entry.cautionReasons[0];
  }
  return entry.fitReasons[0] ?? "Playfit needs more signal before making a confident call.";
}
