import { z } from "zod";

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
  aliases: z.array(z.string()),
  series: z.string(),
  source: z.enum(["catalog", "universe", "finder"]),
  primaryGenre: z.string(),
  tags: z.array(z.string()),
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
  status: z
    .enum(["playing", "on_hold", "shelved", "beaten", "completed", "abandoned", "want_to_play"])
    .optional(),
  rating: productRatingSchema.optional(),
  inBacklog: z.boolean(),
  inWishlist: z.boolean(),
  inPlayfitPicks: z.boolean().default(false),
  excluded: z.boolean().optional(),
  source: z.enum(["onboarding", "finder", "manual"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const productProfileSchema = z.object({
  summary: z.string(),
  likedGenres: z.array(z.string()),
  avoidedGenres: z.array(z.string()),
  likedTags: z.record(z.string(), z.number()),
  dislikedTags: z.record(z.string(), z.number()),
  ratedCount: z.number(),
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
  stateVersion: z.string().regex(/^\d+$/).default("0"),
  user: z.object({
    onboarding: z.object({
      step: z.enum(["platforms", "anchors", "dislikes"]),
      platforms: z.array(
        z.object({
          platformId: z.string(),
          status: z.enum(["available", "limited", "planned"]),
        }),
      ),
      likedGameIds: z.array(z.string()),
      dislikedGameIds: z.array(z.string()).default([]),
    }),
    onboardingCompletedAt: z.string().nullable(),
    profile: productProfileSchema.nullable(),
    gameStates: z.record(z.string(), productGameStateSchema),
    lastUpdatedAt: z.string().nullable(),
  }),
});

export const productTasteActionRequestSchema = z
  .object({
    operationId: z.uuid(),
    expectedStateVersion: z.string().regex(/^\d+$/),
    actionType: z.enum(["not_for_me", "loved", "liked", "mixed", "dropped"]),
    gameId: z.string().min(1),
    played: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.played && value.actionType === "not_for_me") {
      context.addIssue({
        code: "custom",
        path: ["played"],
        message: "played is only valid for loved or liked actions",
      });
    }
    if ((value.actionType === "mixed" || value.actionType === "dropped") && !value.played) {
      context.addIssue({
        code: "custom",
        path: ["played"],
        message: "mixed and dropped are only valid from the Already Played flow",
      });
    }
  });

export const productUndoDecisionRequestSchema = z
  .object({
    operationId: z.uuid(),
    expectedStateVersion: z.string().regex(/^\d+$/),
    actionType: z.literal("undo_decision"),
    targetOperationId: z.uuid(),
  })
  .strict();

export const productStartedActionRequestSchema = z
  .object({
    operationId: z.uuid(),
    expectedStateVersion: z.string().regex(/^\d+$/),
    actionType: z.literal("started"),
    gameId: z.string().min(1),
  })
  .strict();

export const productCanonicalDecisionRequestSchema = z.union([
  productTasteActionRequestSchema,
  productStartedActionRequestSchema,
  productUndoDecisionRequestSchema,
]);

export type ProductStateInput = z.input<typeof productStateSchema>;
