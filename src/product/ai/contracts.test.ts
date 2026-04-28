import { describe, expect, it } from "vitest";

import {
  validateCheckinInterpretation,
  validateFinderInsight,
  validateProfileResponse,
} from "./contracts";

describe("AI response contracts", () => {
  it("accepts a valid onboarding profile payload", () => {
    const profile = validateProfileResponse({
      summary: "profile",
      priorities: {
        story: "high",
        progression: "medium",
        hook: "high",
        aesthetic: "medium",
        emotional: "high",
        combat: "low",
        pace: "medium",
      },
      avoidPatterns: {
        slowStart: true,
        repetition: false,
        confusingSystems: true,
        weakEmotionalPull: false,
        shallowCombat: false,
      },
      likedGenres: ["jrpg"],
      avoidedGenres: ["survival"],
      watchVsPlayRisk: "medium",
      signals: [
        {
          id: "story",
          tone: "positive",
          label: "Story matters",
          reason: "Narrative came up repeatedly.",
        },
      ],
    });

    expect(profile.signals[0]?.label).toBe("Story matters");
  });

  it("rejects malformed profile signals", () => {
    expect(() =>
      validateProfileResponse({
        summary: "profile",
        priorities: {
          story: "high",
          progression: "medium",
          hook: "high",
          aesthetic: "medium",
          emotional: "high",
          combat: "low",
          pace: "medium",
        },
        avoidPatterns: {
          slowStart: true,
          repetition: false,
          confusingSystems: true,
          weakEmotionalPull: false,
          shallowCombat: false,
        },
        likedGenres: ["jrpg"],
        avoidedGenres: [],
        watchVsPlayRisk: "medium",
        signals: ["bad"],
      }),
    ).toThrow();
  });

  it("validates finder and checkin payloads", () => {
    const insight = validateFinderInsight({
      summary: "good fit",
      fitReasons: ["story"],
      cautionReasons: ["pace"],
      confidence: "medium",
    });
    const checkin = validateCheckinInterpretation({
      summary: "mixed",
      tags: ["slow_start"],
    });

    expect(insight.confidence).toBe("medium");
    expect(checkin.tags[0]).toBe("slow_start");
  });
});
