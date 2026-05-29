import { z } from "zod";

const levelSchema = z.enum(["low", "medium", "high"]);
const paceSchema = z.enum(["slow", "medium", "fast"]);
const productPrioritySchema = z.enum(["low", "medium", "high"]);
const productConfidenceSchema = z.enum(["low", "medium", "high"]);
const productRatingSchema = z.union([
  z.literal(0),
  z.literal(0.5),
  z.literal(1),
  z.literal(1.5),
  z.literal(2),
  z.literal(2.5),
  z.literal(3),
  z.literal(3.5),
  z.literal(4),
  z.literal(4.5),
  z.literal(5),
]);

export const seedGameSchema = z.object({
  gameId: z.string(),
  title: z.string(),
  aliases: z.array(z.string()).optional(),
  series: z.string(),
  source: z.enum(["catalog", "universe", "finder"]),
  scoringStatus: z.enum(["scored", "basic"]).optional(),
  primaryGenre: z.string(),
  combatStyle: z.string(),
  storyStrength: levelSchema,
  progressionClarity: levelSchema,
  earlyHook: levelSchema,
  aestheticFit: levelSchema,
  emotionalComplexity: levelSchema,
  combatDepth: levelSchema,
  endgameRepetitionRisk: levelSchema,
  pacingSpeed: paceSchema,
  notes: z.string(),
  coverPath: z.string(),
  externalCoverUrl: z.string().optional(),
  releaseYear: z.string().optional(),
  sourceRef: z.string().optional(),
  availablePlatformIds: z.array(z.string()),
  availablePlatformNames: z.array(z.string()),
  releaseState: z.enum(["released", "unreleased"]),
  sortDate: z.string().optional(),
  releaseLabel: z.string().optional(),
});

export const productGameStateSchema = z.object({
  gameId: z.string(),
  title: z.string(),
  status: z.enum(["playing", "on_hold", "shelved", "beaten", "completed", "abandoned"]).optional(),
  rating: productRatingSchema.optional(),
  storyCompleted: z.boolean().optional(),
  inBacklog: z.boolean(),
  inWishlist: z.boolean(),
  source: z.enum(["onboarding", "finder", "manual"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const productProfileSchema = z.object({
  summary: z.string(),
  priorities: z.object({
    story: productPrioritySchema,
    progression: productPrioritySchema,
    hook: productPrioritySchema,
    aesthetic: productPrioritySchema,
    emotional: productPrioritySchema,
    combat: productPrioritySchema,
    pace: productPrioritySchema,
  }),
  avoidPatterns: z.object({
    slowStart: z.boolean(),
    repetition: z.boolean(),
    confusingSystems: z.boolean(),
    weakEmotionalPull: z.boolean(),
    shallowCombat: z.boolean(),
  }),
  likedGenres: z.array(z.string()),
  avoidedGenres: z.array(z.string()),
  watchVsPlayRisk: productConfidenceSchema,
  signals: z.array(
    z.object({
      id: z.string(),
      tone: z.enum(["positive", "negative"]),
      label: z.string(),
      reason: z.string(),
    }),
  ),
});

export const productStateSchema = z.object({
  version: z.number(),
  user: z.object({
    onboarding: z.object({
      step: z.enum(["platforms", "anchors"]),
      platforms: z.array(
        z.object({
          platformId: z.string(),
          status: z.enum(["available", "limited", "planned"]),
        }),
      ),
      likedGameIds: z.array(z.string()),
    }),
    onboardingCompletedAt: z.string().nullable(),
    profile: productProfileSchema.nullable(),
    profileOverrides: z
      .object({
        priorities: productProfileSchema.shape.priorities.partial().optional(),
        avoidPatterns: productProfileSchema.shape.avoidPatterns.partial().optional(),
        watchVsPlayRisk: productConfidenceSchema.optional(),
      })
      .default({}),
    gameStates: z.record(z.string(), productGameStateSchema),
    lastUpdatedAt: z.string().nullable(),
  }),
});

export type ProductStateInput = z.input<typeof productStateSchema>;
