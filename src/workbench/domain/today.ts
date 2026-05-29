import type { GameRecord } from "../data/schema";
import { getContextualScore } from "./scoring";

const FRESH_RECOMMENDATION_STATUSES = new Set(["backlog", "interested_not_started"]);

const RISK_THRESHOLD = 68;

export interface TodayDecisionModel {
  currentRun: GameRecord | null;
  nextUp: GameRecord | null;
  resume: GameRecord | null;
  avoid: GameRecord | null;
  activeRunCount: number;
  nextUpCount: number;
  resumeCount: number;
  avoidCount: number;
}

function byContextualScore(
  left: GameRecord,
  right: GameRecord,
  energyLevel: "high" | "low" | "normal",
) {
  return getContextualScore(right, energyLevel) - getContextualScore(left, energyLevel);
}

function byRisk(left: GameRecord, right: GameRecord) {
  return right.watchRiskScore + right.trapRiskScore - (left.watchRiskScore + left.trapRiskScore);
}

function byActiveRunPriority(left: GameRecord, right: GameRecord) {
  const touchCompare = (right.lastTouched ?? "").localeCompare(left.lastTouched ?? "");
  return touchCompare !== 0 ? touchCompare : right.gameId.localeCompare(left.gameId);
}

function isAvoidCandidate(record: GameRecord) {
  return (
    record.watchRiskScore >= RISK_THRESHOLD ||
    record.trapRiskScore >= RISK_THRESHOLD ||
    record.watchRiskScore + record.trapRiskScore >= 140
  );
}

export function buildTodayDecisionModel(
  records: GameRecord[],
  energyLevel: "high" | "low" | "normal",
  ignoredGameIds: Set<string>,
): TodayDecisionModel {
  const currentRun =
    [...records].filter((record) => record.status === "playing").sort(byActiveRunPriority)[0] ??
    null;

  const freshCandidates = [...records]
    .filter(
      (record) =>
        FRESH_RECOMMENDATION_STATUSES.has(record.status) && !ignoredGameIds.has(record.gameId),
    )
    .sort((left, right) => byContextualScore(left, right, energyLevel));

  const resumeCandidates = [...records]
    .filter((record) => record.status === "on_hold")
    .sort((left, right) => byContextualScore(left, right, energyLevel));

  const avoidCandidates = freshCandidates.filter(isAvoidCandidate);
  const used = new Set<string>();

  if (currentRun) {
    used.add(currentRun.gameId);
  }

  const nextUp = freshCandidates.find((record) => !used.has(record.gameId)) ?? null;
  if (nextUp) {
    used.add(nextUp.gameId);
  }

  const resume = resumeCandidates.find((record) => !used.has(record.gameId)) ?? null;
  if (resume) {
    used.add(resume.gameId);
  }

  const avoid =
    [...avoidCandidates].filter((record) => !used.has(record.gameId)).sort(byRisk)[0] ?? null;

  return {
    currentRun,
    nextUp,
    resume,
    avoid,
    activeRunCount: currentRun ? 1 : 0,
    nextUpCount: freshCandidates.length,
    resumeCount: resumeCandidates.length,
    avoidCount: avoidCandidates.length,
  };
}
