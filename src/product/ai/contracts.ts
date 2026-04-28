import type {
  CheckinInterpretation,
  FinderInsight,
  ProductConfidence,
  ProductPriority,
  ProductProfile,
  ProductProfileSignal,
} from "../types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPriority(value: unknown): value is ProductPriority {
  return value === "low" || value === "medium" || value === "high";
}

function isConfidence(value: unknown): value is ProductConfidence {
  return value === "low" || value === "medium" || value === "high";
}

function validateStringArray(value: unknown, field: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`Invalid ${field} response shape.`);
  }

  return value;
}

function validateSignal(value: unknown): ProductProfileSignal {
  if (!isObject(value)) {
    throw new Error("Invalid profile signal.");
  }

  if (
    typeof value.id !== "string" ||
    (value.tone !== "positive" && value.tone !== "negative") ||
    typeof value.label !== "string" ||
    typeof value.reason !== "string"
  ) {
    throw new Error("Invalid profile signal fields.");
  }

  return {
    id: value.id,
    tone: value.tone,
    label: value.label,
    reason: value.reason,
  };
}

function validateSignalArray(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Invalid signals response shape.");
  }

  return value.map(validateSignal);
}

export function validateProfileResponse(payload: unknown): ProductProfile {
  if (!isObject(payload)) {
    throw new Error("Invalid onboarding profile response.");
  }

  if (typeof payload.summary !== "string") {
    throw new Error("Missing onboarding profile summary.");
  }

  if (!isObject(payload.priorities)) {
    throw new Error("Missing onboarding priorities.");
  }

  if (!isObject(payload.avoidPatterns)) {
    throw new Error("Missing onboarding avoid patterns.");
  }

  const priorities = {
    story: payload.priorities.story,
    progression: payload.priorities.progression,
    hook: payload.priorities.hook,
    aesthetic: payload.priorities.aesthetic,
    emotional: payload.priorities.emotional,
    combat: payload.priorities.combat,
    pace: payload.priorities.pace,
  };

  if (!Object.values(priorities).every(isPriority)) {
    throw new Error("Invalid onboarding priorities.");
  }
  const typedPriorities = priorities as ProductProfile["priorities"];

  const avoidPatterns = {
    slowStart: payload.avoidPatterns.slowStart,
    repetition: payload.avoidPatterns.repetition,
    confusingSystems: payload.avoidPatterns.confusingSystems,
    weakEmotionalPull: payload.avoidPatterns.weakEmotionalPull,
    shallowCombat: payload.avoidPatterns.shallowCombat,
  };

  if (!Object.values(avoidPatterns).every((value) => typeof value === "boolean")) {
    throw new Error("Invalid onboarding avoid patterns.");
  }
  const typedAvoidPatterns = avoidPatterns as ProductProfile["avoidPatterns"];

  if (!isConfidence(payload.watchVsPlayRisk)) {
    throw new Error("Invalid watch-vs-play risk.");
  }

  return {
    summary: payload.summary,
    priorities: typedPriorities,
    avoidPatterns: typedAvoidPatterns,
    likedGenres: validateStringArray(payload.likedGenres, "likedGenres"),
    avoidedGenres: validateStringArray(payload.avoidedGenres, "avoidedGenres"),
    watchVsPlayRisk: payload.watchVsPlayRisk,
    signals: validateSignalArray(payload.signals),
  };
}

export function validateFinderInsight(payload: unknown): FinderInsight {
  if (!isObject(payload) || typeof payload.summary !== "string" || !isConfidence(payload.confidence)) {
    throw new Error("Invalid finder insight response.");
  }

  return {
    summary: payload.summary,
    fitReasons: validateStringArray(payload.fitReasons, "fitReasons"),
    cautionReasons: validateStringArray(payload.cautionReasons, "cautionReasons"),
    confidence: payload.confidence,
  };
}

export function validateCheckinInterpretation(payload: unknown): CheckinInterpretation {
  if (!isObject(payload) || typeof payload.summary !== "string") {
    throw new Error("Invalid check-in interpretation response.");
  }

  return {
    summary: payload.summary,
    tags: validateStringArray(payload.tags, "tags"),
  };
}
