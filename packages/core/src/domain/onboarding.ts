import type {
  ProductGameState,
  ProductOnboardingDraft,
  ProductPriority,
  ProductProfile,
  ProductProfileOverrides,
  ProductProfileSignal,
  ProductRating,
  SeedGame,
} from "../types";

function bumpPriority(current: ProductPriority, next: ProductPriority): ProductPriority {
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

  return [...counts.entries()].sort((left, right) => right[1] - left[1]).map(([genre]) => genre);
}

const RISK_SIGNAL_FIELDS: Record<string, keyof ProductProfile["avoidPatterns"]> = {
  "slow-start-risk": "slowStart",
  "repetition-risk": "repetition",
  "systems-risk": "confusingSystems",
  "emotional-risk": "weakEmotionalPull",
  "combat-risk": "shallowCombat",
};

function isSlowNarrativeGame(game: SeedGame) {
  return game.storyStrength === "high" && (game.pacingSpeed === "slow" || game.earlyHook === "low");
}

function pushOutcomeSignalsForPositiveGame(
  profile: ProductProfile,
  signals: ProductProfileSignal[],
  game: SeedGame,
) {
  if (game.storyStrength === "high") {
    profile.priorities.story = "high";
    signals.push({
      id: "story-fit",
      tone: "positive",
      label: "Story keeps paying off",
      reason: "Finished games reinforce story as a durable positive signal.",
    });
  }

  if (game.progressionClarity === "high") {
    profile.priorities.progression = "high";
    signals.push({
      id: "progression-fit",
      tone: "positive",
      label: "Clear progression matters",
      reason: "Positive outcomes show that readable progress keeps momentum high.",
    });
  }

  if (game.earlyHook === "high" || game.pacingSpeed === "fast") {
    profile.priorities.hook = "high";
    profile.priorities.pace = bumpPriority(profile.priorities.pace, "high");
    signals.push({
      id: "hook-fit",
      tone: "positive",
      label: "Momentum helps",
      reason: "Games that landed tended to create early forward motion.",
    });
  }

  if (game.combatDepth === "high") {
    profile.priorities.combat = bumpPriority(profile.priorities.combat, "medium");
    signals.push({
      id: "combat-fit",
      tone: "positive",
      label: "Combat depth can sustain interest",
      reason: "Positive outcomes include games with stronger combat texture.",
    });
  }
}

function pushOutcomeSignalsForNegativeGame(
  profile: ProductProfile,
  signals: ProductProfileSignal[],
  game: SeedGame,
) {
  if (game.earlyHook === "low" || game.pacingSpeed === "slow") {
    profile.avoidPatterns.slowStart = true;
    signals.push({
      id: "slow-start-risk",
      tone: "negative",
      label: "Slow starts are risky",
      reason: "Abandoned or disliked games show early momentum can break fit.",
    });
  }

  if (game.endgameRepetitionRisk !== "low") {
    profile.avoidPatterns.repetition = true;
    signals.push({
      id: "repetition-risk",
      tone: "negative",
      label: "Repetition hurts fit",
      reason: "Negative outcomes include games with heavier repetition or grind.",
    });
  }

  if (game.progressionClarity === "low") {
    profile.avoidPatterns.confusingSystems = true;
    signals.push({
      id: "systems-risk",
      tone: "negative",
      label: "Confusing systems create friction",
      reason: "Negative outcomes point to unclear progression as a risk.",
    });
  }

  if (game.storyStrength !== "high" && game.emotionalComplexity !== "high") {
    profile.avoidPatterns.weakEmotionalPull = true;
    signals.push({
      id: "emotional-risk",
      tone: "negative",
      label: "Weak emotional pull is risky",
      reason: "Negative outcomes suggest weaker narrative connection can fail quickly.",
    });
  }

  if (game.combatDepth === "low") {
    profile.avoidPatterns.shallowCombat = true;
    signals.push({
      id: "combat-risk",
      tone: "negative",
      label: "Shallow combat can break fit",
      reason: "Negative outcomes include games with weaker combat depth or feel.",
    });
  }
}

function ratingToOutcome(rating?: ProductRating) {
  if (rating == null) return null;
  if (rating >= 4) return "positive";
  if (rating <= 2) return "negative";
  return "mixed";
}

export function normalizeProfileSignals(profile: ProductProfile): ProductProfile {
  return {
    ...profile,
    signals: profile.signals.filter((signal) => {
      const field = RISK_SIGNAL_FIELDS[signal.id];
      if (field) {
        return profile.avoidPatterns[field];
      }
      if (signal.id === "watch-risk") {
        return profile.watchVsPlayRisk === "high";
      }
      if (signal.id === "watch-play-confidence") {
        return profile.watchVsPlayRisk === "low";
      }
      return true;
    }),
  };
}

export function applyProfileOverrides(
  profile: ProductProfile,
  overrides: ProductProfileOverrides = {},
): ProductProfile {
  return normalizeProfileSignals({
    ...profile,
    priorities: {
      ...profile.priorities,
      ...overrides.priorities,
    },
    avoidPatterns: {
      ...profile.avoidPatterns,
      ...overrides.avoidPatterns,
    },
    watchVsPlayRisk: overrides.watchVsPlayRisk ?? profile.watchVsPlayRisk,
  });
}

export function canAdvanceOnboarding(draft: ProductOnboardingDraft) {
  return draft.platforms.length > 0 && draft.likedGameIds.length >= 3;
}

export function buildFallbackProfile(
  draft: ProductOnboardingDraft,
  gamesById: Map<string, SeedGame>,
): ProductProfile {
  const likedGenres = countGenres(draft.likedGameIds, gamesById).slice(0, 3);
  const signalDrafts: ProductProfileSignal[] = [];
  const profile: ProductProfile = {
    summary:
      "This first profile leans on a few anchor games. It should improve as more games are rated and outcomes are logged.",
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
    avoidedGenres: [],
    watchVsPlayRisk: "medium",
    signals: [],
  };

  if (likedGenres.length > 0) {
    signalDrafts.push({
      id: "genre-fit",
      tone: "positive",
      label: `Affinity visible in ${likedGenres[0]}`,
      reason: "Liked anchors show an early genre pattern the system can use.",
    });
  }

  profile.signals = uniqueSignals(signalDrafts).slice(0, 6);

  return normalizeProfileSignals(profile);
}

export function buildAdaptiveProfile(
  draft: ProductOnboardingDraft,
  gamesById: Map<string, SeedGame>,
  gameStates: Record<string, ProductGameState>,
  overrides: ProductProfileOverrides = {},
): ProductProfile {
  const profile = buildFallbackProfile(draft, gamesById);
  const signalDrafts = [...profile.signals];
  let positiveSlowNarrativeCount = 0;
  let negativeSlowNarrativeCount = 0;
  let outcomeCount = 0;
  let mixedCount = 0;

  Object.values(gameStates).forEach((record) => {
    const game = gamesById.get(record.gameId);
    if (!game) {
      return;
    }

    const outcome = ratingToOutcome(record.rating);
    if (outcome == null) {
      return;
    }

    if (outcome === "mixed") {
      mixedCount += 1;
      return;
    }

    const positive = outcome === "positive";
    const negative = outcome === "negative";

    if (record.status === "abandoned" && positive) {
      outcomeCount += 1;
      pushOutcomeSignalsForPositiveGame(profile, signalDrafts, game);
      if (isSlowNarrativeGame(game)) {
        negativeSlowNarrativeCount += 1;
      }
      if (record.storyCompleted) {
        profile.watchVsPlayRisk = "high";
        signalDrafts.push({
          id: "watch-risk",
          tone: "negative",
          label: "Some stories may read better than they play",
          reason:
            "Abandoned games with high rating and story completed suggest a watch-vs-play pattern.",
        });
      }
      return;
    }

    if (!positive && !negative) {
      return;
    }

    outcomeCount += 1;

    if (positive) {
      pushOutcomeSignalsForPositiveGame(profile, signalDrafts, game);
      if (isSlowNarrativeGame(game)) {
        positiveSlowNarrativeCount += 1;
      }
      return;
    }

    pushOutcomeSignalsForNegativeGame(profile, signalDrafts, game);
    if (isSlowNarrativeGame(game)) {
      negativeSlowNarrativeCount += 1;
    }
  });

  if (positiveSlowNarrativeCount >= 3 && positiveSlowNarrativeCount > negativeSlowNarrativeCount) {
    profile.watchVsPlayRisk = "low";
    signalDrafts.push({
      id: "watch-play-confidence",
      tone: "positive",
      label: "Slow stories can still work",
      reason: "Your finished games show slower narrative pacing is not always a watch-only risk.",
    });
  } else if (
    negativeSlowNarrativeCount >= 2 &&
    negativeSlowNarrativeCount >= positiveSlowNarrativeCount
  ) {
    profile.watchVsPlayRisk = "high";
    signalDrafts.push({
      id: "watch-risk",
      tone: "negative",
      label: "Some stories may read better than they play",
      reason: "Abandoned slower narrative games suggest a watch-vs-play risk.",
    });
  }

  if (mixedCount > 0) {
    signalDrafts.push({
      id: "mixed-outcomes",
      tone: "negative",
      label: "Some picks are mixed",
      reason: "Mixed outcomes are treated as caution, not as positive recommendation targets.",
    });
  }

  profile.summary =
    outcomeCount > 0 || mixedCount > 0
      ? "This profile combines your setup answers with outcomes from My Games. It should keep getting sharper as you log more."
      : profile.summary;
  profile.signals = uniqueSignals(signalDrafts).slice(0, 8);

  return applyProfileOverrides(profile, overrides);
}
