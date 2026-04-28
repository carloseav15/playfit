import type { BaseGameRecord, Level, Pace } from "../data/schema";

const FIT_GENRES = new Set([
  "jrpg",
  "action_rpg",
  "metroidvania",
  "survival_horror",
  "detective_adventure",
  "arcade_racing",
  "third_person_shooter",
  "stealth_action",
  "tactical_rpg",
  "strategy_rpg",
  "action_adventure",
]);

const TIGHT_MOMENTUM_GENRES = new Set([
  "action_adventure",
  "third_person_shooter",
  "survival_horror",
  "metroidvania",
  "platformer",
  "arcade_racing",
]);

const STORY_FORWARD_GENRES = new Set([
  "jrpg",
  "detective_adventure",
  "stealth_action",
  "survival_horror",
  "third_person_shooter",
]);

const ACTIONABLE_STATUSES = new Set([
  "backlog",
  "on_hold",
  "playing",
  "interested_not_started",
]);

function levelScore(value: Level) {
  switch (value) {
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function paceScore(value: Pace) {
  switch (value) {
    case "fast":
      return 3;
    case "medium":
      return 2;
    case "slow":
      return 1;
    default:
      return 0;
  }
}

function sessionSignalScore(value: Level) {
  switch (value) {
    case "high":
      return 2;
    case "medium":
      return 1;
    case "low":
      return 0;
    default:
      return 0;
  }
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function uniqueReasons(reasons: string[]) {
  return [...new Set(reasons)].slice(0, 4);
}

export function getProfileMatchReasons(record: BaseGameRecord) {
  const reasons: string[] = [];

  if (record.storyStrength === "high") {
    reasons.push("Strong story fit");
  }
  if (record.progressionClarity === "high") {
    reasons.push("Clear progression");
  }
  if (record.earlyHook === "high") {
    reasons.push("Fast early hook");
  }
  if (record.aestheticFit === "high") {
    reasons.push("Strong aesthetic identity");
  }
  if (record.emotionalComplexity === "high") {
    reasons.push("High emotional complexity");
  }
  if (record.pacingSpeed === "fast") {
    reasons.push("Good campaign momentum");
  }
  if (record.endgameRepetitionRisk === "low") {
    reasons.push("Low repetition risk");
  }
  if (FIT_GENRES.has(record.primaryGenre)) {
    reasons.push("Matches a genre that already lands well");
  }
  if (record.fitEstimate !== undefined && record.fitEstimate >= 4) {
    reasons.push("Backed by a strong recommendation fit");
  }
  if (record.overallScore !== undefined && record.overallScore >= 4) {
    reasons.push("Supported by your own past score");
  }

  return uniqueReasons(reasons);
}

export function scoreProfileMatch(record: BaseGameRecord) {
  let score = 0;

  score += levelScore(record.storyStrength) * 8;
  score += levelScore(record.progressionClarity) * 8;
  score += levelScore(record.earlyHook) * 6;
  score += levelScore(record.aestheticFit) * 7;
  score += levelScore(record.emotionalComplexity) * 6;
  score += levelScore(record.combatDepth) * 4;
  score += paceScore(record.pacingSpeed) * 6;
  score -= levelScore(record.endgameRepetitionRisk) * 5;

  if (FIT_GENRES.has(record.primaryGenre)) {
    score += 6;
  }

  if (TIGHT_MOMENTUM_GENRES.has(record.primaryGenre)) {
    score += 4;
  }

  if (record.fitEstimate !== undefined) {
    score += record.fitEstimate * 5;
  }

  if (record.overallScore !== undefined) {
    score = score * 0.7 + record.overallScore * 12;
  }

  if (record.status === "dropped" || record.status === "dropped_then_watched") {
    score -= 18;
  }

  if (record.status === "completed" && (record.overallScore ?? 0) >= 4) {
    score += 10;
  }

  return clampScore(score);
}

export function getTrapRiskReasons(record: BaseGameRecord) {
  const reasons: string[] = [];

  if (record.aestheticFit === "high" && record.storyStrength !== "high") {
    reasons.push("Style may outweigh emotional pull");
  }
  if (record.endgameRepetitionRisk === "high") {
    reasons.push("High repetition risk");
  }
  if (record.pacingSpeed === "slow") {
    reasons.push("Slow pacing");
  }
  if (record.earlyHook === "low") {
    reasons.push("Weak early hook");
  }
  if (
    record.combatDepth === "high" &&
    record.storyStrength !== "high" &&
    record.emotionalComplexity !== "high"
  ) {
    reasons.push("Systems-first with a weaker narrative anchor");
  }
  if (record.currentFriction === "high") {
    reasons.push("Recent sessions felt sticky");
  }
  if (record.currentGuideUsage === "heavy") {
    reasons.push("Heavy guide reliance");
  }
  if (record.status === "dropped" || record.status === "dropped_then_watched") {
    reasons.push("Already stalled once");
  }

  return uniqueReasons(reasons);
}

export function scoreTrapRisk(record: BaseGameRecord) {
  let risk = 0;

  if (record.aestheticFit === "high" && record.storyStrength !== "high") {
    risk += 8;
  }

  if (record.endgameRepetitionRisk === "high") {
    risk += 22;
  } else if (record.endgameRepetitionRisk === "medium") {
    risk += 12;
  }

  if (record.pacingSpeed === "slow") {
    risk += 18;
  }

  if (record.earlyHook === "low") {
    risk += 16;
  }

  if (
    record.combatDepth === "high" &&
    record.storyStrength !== "high" &&
    record.emotionalComplexity !== "high"
  ) {
    risk += 10;
  }

  if (record.currentFriction === "high") {
    risk += 10;
  }

  if (record.currentGuideUsage === "heavy") {
    risk += 6;
  }

  if (record.status === "dropped" || record.status === "dropped_then_watched") {
    risk += 35;
  }

  if (record.status === "completed" && (record.overallScore ?? 0) >= 4) {
    risk -= 28;
  }

  return clampScore(risk);
}

export function getWatchRiskReasons(record: BaseGameRecord) {
  const reasons: string[] = [];

  if (record.storyStrength === "high") {
    reasons.push("Strong narrative pull");
  }
  if (record.aestheticFit === "high") {
    reasons.push("Strong presentation pull");
  }
  if (record.progressionClarity === "low") {
    reasons.push("Opaque progression");
  }
  if (record.endgameRepetitionRisk === "high") {
    reasons.push("Repetition may outlast the hook");
  }
  if (record.pacingSpeed === "slow") {
    reasons.push("Slow pacing");
  }
  if (
    STORY_FORWARD_GENRES.has(record.primaryGenre) &&
    record.earlyHook !== "high"
  ) {
    reasons.push("Story promise may arrive too slowly");
  }
  if (
    record.status === "dropped_then_watched" ||
    record.status === "completed_or_watched"
  ) {
    reasons.push("Already followed a play-then-watch pattern");
  }
  if (record.currentFriction === "high") {
    reasons.push("Recent sessions had high friction");
  }
  if (record.currentGuideUsage === "heavy") {
    reasons.push("Recent sessions leaned on a guide");
  }
  if (["later", "unsure"].includes(record.currentReturnIntent)) {
    reasons.push("Return intent is weak right now");
  }

  return uniqueReasons(reasons);
}

export function scoreYoutubeRisk(record: BaseGameRecord) {
  let risk = 0;

  if (record.storyStrength === "high") {
    risk += 10;
  }

  if (record.aestheticFit === "high") {
    risk += 10;
  }

  if (record.progressionClarity === "low") {
    risk += 14;
  }

  if (record.endgameRepetitionRisk === "high") {
    risk += 16;
  }

  if (record.pacingSpeed === "slow") {
    risk += 14;
  }

  if (
    STORY_FORWARD_GENRES.has(record.primaryGenre) &&
    record.earlyHook !== "high"
  ) {
    risk += 10;
  }

  if (
    record.status === "dropped_then_watched" ||
    record.status === "completed_or_watched"
  ) {
    risk += 45;
  }

  if (record.currentFriction === "high") {
    risk += 14;
  }

  if (record.currentGuideUsage === "heavy") {
    risk += 10;
  }

  if (
    ACTIONABLE_STATUSES.has(record.status) &&
    record.currentMomentum === "low"
  ) {
    risk += 8;
  }

  if (["later", "unsure"].includes(record.currentReturnIntent)) {
    risk += 8;
  }

  if (record.status === "completed" && (record.overallScore ?? 0) >= 4) {
    risk -= 30;
  }

  return clampScore(risk);
}

export function getBacklogPriorityReasons(record: BaseGameRecord) {
  const reasons: string[] = [];
  const profileMatch = scoreProfileMatch(record);
  const trapRisk = scoreTrapRisk(record);
  const watchRisk = scoreYoutubeRisk(record);

  if (profileMatch >= 70) {
    reasons.push("High overall match");
  }
  if (record.status === "playing") {
    reasons.push("Already in progress");
  }
  if (record.status === "on_hold") {
    reasons.push("Good resume candidate");
  }
  if (record.fitEstimate !== undefined && record.fitEstimate >= 4) {
    reasons.push("Strong recommendation support");
  }
  if (trapRisk <= 35) {
    reasons.push("Low trap risk");
  }
  if (watchRisk <= 35) {
    reasons.push("Low watch risk");
  }
  if (record.currentMomentum === "high") {
    reasons.push("Recent sessions have good momentum");
  }
  if (record.currentFriction === "low") {
    reasons.push("Recent sessions feel clean");
  }
  if (["immediate", "soon"].includes(record.currentReturnIntent)) {
    reasons.push("You want to return soon");
  }
  if (record.overallScore !== undefined && record.overallScore >= 4) {
    reasons.push("Already proven to land well");
  }

  return uniqueReasons(reasons);
}

export function scoreBacklogPriority(record: BaseGameRecord) {
  if (!ACTIONABLE_STATUSES.has(record.status)) {
    return 0;
  }

  let score = scoreProfileMatch(record);
  score += (record.fitEstimate ?? 0) * 4;
  score -= scoreTrapRisk(record) * 0.35;
  score -= scoreYoutubeRisk(record) * 0.2;

  if (record.status === "playing") {
    score += 12;
  }

  if (record.status === "on_hold") {
    score += 7;
  }

  if (record.status === "backlog") {
    score += 4;
  }

  if (record.status === "interested_not_started") {
    score -= 5;
  }

  score += sessionSignalScore(record.currentMomentum) * 3;

  if (record.currentFriction === "low") {
    score += 5;
  } else if (record.currentFriction === "medium") {
    score -= 2;
  } else if (record.currentFriction === "high") {
    score -= 12;
  }

  if (record.currentSessionOutcome === "good_session") {
    score += 6;
  } else if (record.currentSessionOutcome === "stalled") {
    score -= 10;
  } else if (record.currentSessionOutcome === "stopped") {
    score -= 16;
  }

  if (record.currentReturnIntent === "immediate") {
    score += 7;
  } else if (record.currentReturnIntent === "soon") {
    score += 4;
  } else if (record.currentReturnIntent === "later") {
    score -= 4;
  } else if (record.currentReturnIntent === "unsure") {
    score -= 8;
  }

  if (record.currentGuideUsage === "heavy") {
    score -= 4;
  }

  if (record.overallScore !== undefined && record.overallScore >= 4) {
    score += 8;
  }

  return clampScore(score);
}

export function getContextualScore(record: import("../data/schema").GameRecord, energyLevel: "high" | "low" | "normal") {
  let score = record.backlogPriorityScore;
  if (energyLevel === "low") {
    if (record.pacingSpeed === "slow") score -= 25;
    if (record.storyStrength === "high") score -= 15;
    if (record.emotionalComplexity === "high") score -= 15;
    if (record.pacingSpeed === "fast") score += 30;
    if (record.currentMomentum === "high") score += 10;
  } else if (energyLevel === "high") {
    if (record.storyStrength === "high") score += 15;
    if (record.pacingSpeed === "slow") score += 10; // high energy means patience for slow pacing
  }
  return clampScore(score);
}
