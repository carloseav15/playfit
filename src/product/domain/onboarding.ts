import type {
  ProductInterviewAnswers,
  ProductOnboardingDraft,
  ProductPriority,
  ProductProfile,
  ProductProfileSignal,
  SeedGame,
} from "../types";

export const ONBOARDING_PRIORITY_CHIPS = [
  { id: "strong_story", label: "Strong story" },
  { id: "clear_progression", label: "Clear progression" },
  { id: "fast_early_hook", label: "Fast early hook" },
  { id: "atmosphere_style", label: "Atmosphere and style" },
  { id: "emotional_payoff", label: "Emotional payoff" },
  { id: "combat_depth", label: "Combat depth" },
] as const;

export const ONBOARDING_FRICTION_CHIPS = [
  { id: "slow_start", label: "Slow start" },
  { id: "repetition_or_grind", label: "Repetition or grind" },
  { id: "confusing_systems_or_direction", label: "Confusing systems or direction" },
  { id: "weak_emotional_pull", label: "Weak emotional pull" },
  { id: "shallow_combat_feel", label: "Shallow combat feel" },
] as const;

export const ONBOARDING_PLAY_PATTERN_CHIPS = [
  { id: "push_through", label: "I push through if the fit is close" },
  { id: "pause_and_retry", label: "I pause and try again later" },
  { id: "drop_quickly", label: "I drop quickly if it does not click" },
  { id: "watch_instead", label: "I watch the rest instead of playing" },
] as const;

function keywords(text: string) {
  return text.toLowerCase();
}

function bumpPriority(
  current: ProductPriority,
  next: ProductPriority,
): ProductPriority {
  const rank = { low: 0, medium: 1, high: 2 } as const;
  return rank[next] > rank[current] ? next : current;
}

function uniqueSignals(signals: ProductProfileSignal[]) {
  return [...new Map(signals.map((signal) => [signal.id, signal])).values()];
}

function countGenres(gameIds: string[], gamesById: Map<string, SeedGame>) {
  const counts = new Map<string, number>();

  gameIds.forEach((gameId) => {
    const genre = gamesById.get(gameId)?.primaryGenre;

    if (!genre) {
      return;
    }

    counts.set(genre, (counts.get(genre) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([genre]) => genre);
}

export function canAdvanceOnboarding(draft: ProductOnboardingDraft) {
  switch (draft.step) {
    case "platforms":
      return draft.platforms.length > 0;
    case "anchors":
      return draft.likedGameIds.length >= 3 && draft.dislikedGameIds.length >= 3;
    case "interview":
      return Boolean(
        draft.answers.selectedPriorities.length > 0 &&
          draft.answers.selectedFrictionSignals.length > 0 &&
          draft.answers.selectedPlayPattern,
      );
    case "confirm":
      return draft.draftProfile !== null;
    default:
      return false;
  }
}

export function buildFallbackProfile(
  draft: ProductOnboardingDraft,
  gamesById: Map<string, SeedGame>,
): ProductProfile {
  const likedGenres = countGenres(draft.likedGameIds, gamesById).slice(0, 3);
  const avoidedGenres = countGenres(draft.dislikedGameIds, gamesById).slice(0, 2);
  const love = keywords(draft.answers.love);
  const frustration = keywords(draft.answers.frustration);
  const priorities = keywords(draft.answers.priorities);
  const playPattern = keywords(draft.answers.playPattern);
  const signalDrafts: ProductProfileSignal[] = [];
  const profile: ProductProfile = {
    summary:
      "This first profile leans on a few anchors and a short interview. It should improve as more play feedback is added.",
    priorities: {
      story: "medium",
      progression: "medium",
      hook: "medium",
      aesthetic: "medium",
      emotional: "medium",
      combat: "low",
      pace: "medium",
    },
    avoidPatterns: {
      slowStart: false,
      repetition: false,
      confusingSystems: false,
      weakEmotionalPull: false,
      shallowCombat: false,
    },
    likedGenres,
    avoidedGenres,
    watchVsPlayRisk:
      draft.answers.selectedPlayPattern === "watch_instead" ||
      playPattern.includes("watch") ||
      playPattern.includes("youtube")
        ? "high"
        : draft.answers.selectedPlayPattern === "push_through"
          ? "low"
          : "medium",
    signals: [],
  };

  if (draft.answers.selectedPriorities.includes("strong_story")) {
    profile.priorities.story = "high";
    signalDrafts.push({
      id: "story-fit",
      tone: "positive",
      label: "Strong story matters",
      reason: "Story was selected as a primary fit signal during onboarding.",
    });
  }

  if (draft.answers.selectedPriorities.includes("clear_progression")) {
    profile.priorities.progression = "high";
    signalDrafts.push({
      id: "progression-fit",
      tone: "positive",
      label: "Clear progression matters",
      reason: "Progress clarity was explicitly selected as part of the ideal fit.",
    });
  }

  if (draft.answers.selectedPriorities.includes("fast_early_hook")) {
    profile.priorities.hook = "high";
    profile.priorities.pace = bumpPriority(profile.priorities.pace, "high");
    signalDrafts.push({
      id: "hook-fit",
      tone: "positive",
      label: "Fast engagement matters",
      reason: "Early momentum was selected as a core requirement.",
    });
  }

  if (draft.answers.selectedPriorities.includes("atmosphere_style")) {
    profile.priorities.aesthetic = "high";
    signalDrafts.push({
      id: "aesthetic-fit",
      tone: "positive",
      label: "Atmosphere and identity matter",
      reason: "Presentation and style were selected as part of the ideal fit.",
    });
  }

  if (draft.answers.selectedPriorities.includes("emotional_payoff")) {
    profile.priorities.emotional = "high";
    signalDrafts.push({
      id: "emotional-fit",
      tone: "positive",
      label: "Emotional payoff matters",
      reason: "Emotional pull was selected as part of what makes a game land.",
    });
  }

  if (draft.answers.selectedPriorities.includes("combat_depth")) {
    profile.priorities.combat = "high";
    signalDrafts.push({
      id: "combat-fit",
      tone: "positive",
      label: "Combat depth matters",
      reason: "Combat feedback and depth were selected as part of the ideal fit.",
    });
  }

  if (draft.answers.selectedFrictionSignals.includes("slow_start")) {
    profile.avoidPatterns.slowStart = true;
    signalDrafts.push({
      id: "slow-start-risk",
      tone: "negative",
      label: "Slow starts are risky",
      reason: "Slow starts were explicitly selected as a momentum breaker.",
    });
  }

  if (draft.answers.selectedFrictionSignals.includes("repetition_or_grind")) {
    profile.avoidPatterns.repetition = true;
    signalDrafts.push({
      id: "repetition-risk",
      tone: "negative",
      label: "Repetition hurts fit",
      reason: "Repetition or grind was explicitly selected as a friction pattern.",
    });
  }

  if (draft.answers.selectedFrictionSignals.includes("confusing_systems_or_direction")) {
    profile.avoidPatterns.confusingSystems = true;
    signalDrafts.push({
      id: "systems-risk",
      tone: "negative",
      label: "Confusing systems create friction",
      reason: "Unclear systems or direction were selected as a momentum breaker.",
    });
  }

  if (draft.answers.selectedFrictionSignals.includes("weak_emotional_pull")) {
    profile.avoidPatterns.weakEmotionalPull = true;
    signalDrafts.push({
      id: "emotional-risk",
      tone: "negative",
      label: "Weak emotional pull is risky",
      reason: "Lack of connection was selected as a clear failure mode.",
    });
  }

  if (draft.answers.selectedFrictionSignals.includes("shallow_combat_feel")) {
    profile.avoidPatterns.shallowCombat = true;
    signalDrafts.push({
      id: "combat-risk",
      tone: "negative",
      label: "Shallow combat can break fit",
      reason: "Combat feel was selected as a momentum breaker.",
    });
  }

  if (love.includes("story") || priorities.includes("story")) {
    profile.priorities.story = "high";
    signalDrafts.push({
      id: "story-fit",
      tone: "positive",
      label: "Strong story matters",
      reason: "Story kept appearing as a primary reason why games worked.",
    });
  }

  if (love.includes("progress") || priorities.includes("progress")) {
    profile.priorities.progression = "high";
    signalDrafts.push({
      id: "progression-fit",
      tone: "positive",
      label: "Clear progression matters",
      reason: "Progression clarity came through as part of the ideal fit.",
    });
  }

  if (love.includes("fast") || priorities.includes("pace") || priorities.includes("hook")) {
    profile.priorities.hook = "high";
    profile.priorities.pace = bumpPriority(profile.priorities.pace, "high");
    signalDrafts.push({
      id: "hook-fit",
      tone: "positive",
      label: "Fast engagement matters",
      reason: "The ideal experience seems to hook early and keep momentum visible.",
    });
  }

  if (love.includes("atmos") || love.includes("music") || love.includes("style")) {
    profile.priorities.aesthetic = "high";
    signalDrafts.push({
      id: "aesthetic-fit",
      tone: "positive",
      label: "Atmosphere and identity matter",
      reason: "Presentation and identity came up as part of what makes a game memorable.",
    });
  }

  if (love.includes("emotion") || love.includes("character") || love.includes("ending")) {
    profile.priorities.emotional = "high";
    signalDrafts.push({
      id: "emotional-fit",
      tone: "positive",
      label: "Emotional pull matters",
      reason: "Games seem to land best when characters or payoff create emotional weight.",
    });
  }

  if (priorities.includes("combat") || love.includes("combat")) {
    profile.priorities.combat = "medium";
  }

  if (frustration.includes("slow") || frustration.includes("boring")) {
    profile.avoidPatterns.slowStart = true;
    signalDrafts.push({
      id: "slow-start-risk",
      tone: "negative",
      label: "Slow starts are risky",
      reason: "Pacing friction was described as a recurring failure mode.",
    });
  }

  if (frustration.includes("repeat") || frustration.includes("repet")) {
    profile.avoidPatterns.repetition = true;
    signalDrafts.push({
      id: "repetition-risk",
      tone: "negative",
      label: "Repetition hurts fit",
      reason: "Repeated loops were flagged as a strong reason to disengage.",
    });
  }

  if (frustration.includes("confus") || frustration.includes("lost") || frustration.includes("unclear")) {
    profile.avoidPatterns.confusingSystems = true;
    signalDrafts.push({
      id: "systems-risk",
      tone: "negative",
      label: "Confusing systems create friction",
      reason: "The model should watch for opaque progression and hard-to-read systems.",
    });
  }

  if (frustration.includes("emotion") || frustration.includes("care") || frustration.includes("connect")) {
    profile.avoidPatterns.weakEmotionalPull = true;
  }

  if (frustration.includes("combat") || frustration.includes("basic") || frustration.includes("simple")) {
    profile.avoidPatterns.shallowCombat = true;
    signalDrafts.push({
      id: "combat-risk",
      tone: "negative",
      label: "Shallow combat can break fit",
      reason: "Combat depth or feedback appears to matter more than generic action styling.",
    });
  }

  if (likedGenres.length > 0) {
    signalDrafts.push({
      id: "genre-fit",
      tone: "positive",
      label: `Affinity is already visible in ${likedGenres[0]}`,
      reason: "Liked anchors show an early genre pattern the system can use immediately.",
    });
  }

  profile.signals = uniqueSignals(signalDrafts).slice(0, 6);

  return profile;
}

export function nextOnboardingStep(current: ProductOnboardingDraft["step"]) {
  switch (current) {
    case "platforms":
      return "anchors";
    case "anchors":
      return "interview";
    case "interview":
      return "confirm";
    case "confirm":
    default:
      return "confirm";
  }
}

export function summarizeInterviewAnswers(answers: ProductInterviewAnswers) {
  return [answers.love, answers.frustration, answers.priorities, answers.playPattern]
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(" ");
}
