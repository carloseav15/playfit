import { describe, expect, it } from "vitest";

import { buildFallbackProfile, canAdvanceOnboarding } from "./onboarding";
import type { ProductOnboardingDraft, SeedGame } from "../types";

function createDraft(): ProductOnboardingDraft {
  return {
    step: "platforms",
    platforms: [],
    likedGameIds: [],
    dislikedGameIds: [],
    currentGameId: null,
    anchorReasons: {},
    anchorOwnership: {},
    answers: {
      love: "",
      frustration: "",
      priorities: "",
      playPattern: "",
      selectedPriorities: [],
      selectedFrictionSignals: [],
      selectedPlayPattern: "",
    },
    draftProfile: null,
  };
}

function createGame(gameId: string, title: string, primaryGenre: string): SeedGame {
  return {
    gameId,
    title,
    series: "",
    source: "catalog",
    primaryGenre,
    combatStyle: "action",
    storyStrength: "high",
    progressionClarity: "medium",
    earlyHook: "medium",
    aestheticFit: "medium",
    emotionalComplexity: "medium",
    combatDepth: "medium",
    endgameRepetitionRisk: "low",
    pacingSpeed: "medium",
    notes: "",
    coverPath: "",
    availablePlatformIds: [],
    availablePlatformNames: [],
    releaseState: "released",
  };
}

describe("onboarding domain", () => {
  it("requires the expected minimum input per step", () => {
    const draft = createDraft();
    expect(canAdvanceOnboarding(draft)).toBe(false);

    draft.platforms.push({ platformId: "ps5", status: "available" });
    expect(canAdvanceOnboarding(draft)).toBe(true);

    draft.step = "anchors";
    expect(canAdvanceOnboarding(draft)).toBe(false);
    draft.likedGameIds = ["a", "b", "c"];
    draft.dislikedGameIds = ["d", "e", "f"];
    [...draft.likedGameIds, ...draft.dislikedGameIds].forEach((gameId) => {
      draft.anchorReasons[gameId] = ["story"];
      draft.anchorOwnership[gameId] = "owned";
    });
    expect(canAdvanceOnboarding(draft)).toBe(true);

    draft.step = "interview";
    expect(canAdvanceOnboarding(draft)).toBe(false);
    draft.answers = {
      love: "Strong stories",
      frustration: "Slow starts",
      priorities: "Story and progression",
      playPattern: "If it drags I switch to YouTube",
      selectedPriorities: ["strong_story"],
      selectedFrictionSignals: ["slow_start"],
      selectedPlayPattern: "watch_instead",
    };
    expect(canAdvanceOnboarding(draft)).toBe(true);
  });

  it("builds a fallback profile from anchors and natural-language answers", () => {
    const draft = createDraft();
    draft.likedGameIds = ["ff7", "ff9", "chrono"];
    draft.dislikedGameIds = ["boring-1", "boring-2", "boring-3"];
    draft.anchorReasons = {
      ff7: ["story", "emotion"],
      ff9: ["story", "aesthetic"],
      chrono: ["pace"],
      "boring-1": ["repetition"],
      "boring-2": ["confusion"],
      "boring-3": ["grind"],
    };
    draft.anchorOwnership = {
      ff7: "owned",
      ff9: "owned",
      chrono: "owned",
      "boring-1": "owned",
      "boring-2": "owned",
      "boring-3": "owned",
    };
    draft.answers = {
      love: "I care about story, emotion, atmosphere and clear progress",
      frustration: "Slow repetitive games with confusing systems",
      priorities: "Story and hook matter most",
      playPattern: "I often watch on YouTube when a game looks good but plays poorly",
      selectedPriorities: ["strong_story", "emotional_payoff", "clear_progression"],
      selectedFrictionSignals: ["slow_start", "repetition_or_grind", "confusing_systems_or_direction"],
      selectedPlayPattern: "watch_instead",
    };

    const gamesById = new Map<string, SeedGame>([
      ["ff7", createGame("ff7", "Final Fantasy VII", "jrpg")],
      ["ff9", createGame("ff9", "Final Fantasy IX", "jrpg")],
      ["chrono", createGame("chrono", "Chrono Trigger", "jrpg")],
      ["boring-1", createGame("boring-1", "Game 1", "open world")],
      ["boring-2", createGame("boring-2", "Game 2", "open world")],
      ["boring-3", createGame("boring-3", "Game 3", "shooter")],
    ]);

    const profile = buildFallbackProfile(draft, gamesById);

    expect(profile.priorities.story).toBe("high");
    expect(profile.priorities.emotional).toBe("high");
    expect(profile.avoidPatterns.slowStart).toBe(true);
    expect(profile.avoidPatterns.repetition).toBe(true);
    expect(profile.avoidPatterns.confusingSystems).toBe(true);
    expect(profile.watchVsPlayRisk).toBe("high");
    expect(profile.likedGenres[0]).toBe("jrpg");
    expect(profile.signals.length).toBeGreaterThan(0);
  });
});
