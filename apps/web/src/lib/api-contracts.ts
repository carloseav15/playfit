import { seedGameSchema } from "@playfit/core/schemas";
import { z } from "zod";

// The mapper may preserve database nulls in mocked/legacy rows. The public
// response contract accepts those nullable optional fields while keeping the
// required game identity and display fields strict.
const apiSeedGameSchema = seedGameSchema.extend({
  externalCoverUrl: z.string().nullable().optional(),
  releaseYear: z.string().nullable().optional(),
  sourceRef: z.string().nullable().optional(),
  sortDate: z.string().nullable().optional(),
  releaseLabel: z.string().nullable().optional(),
});

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  app: z.literal("playfit"),
  timestamp: z.string(),
  checks: z.record(z.string(), z.string()),
});

export const gamesResponseSchema = z.object({
  games: z.array(apiSeedGameSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});

export const gameResponseSchema = apiSeedGameSchema;

export const batchGamesResponseSchema = z.object({
  games: z.array(apiSeedGameSchema),
});

export const platformsResponseSchema = z.object({
  platforms: z.array(
    z.object({
      platformId: z.string(),
      displayName: z.string(),
      family: z.string().nullable(),
      kind: z.string().nullable(),
      activeStatus: z.literal("active"),
      sortOrder: z.number().nullable(),
    }),
  ),
});

export const similarResponseSchema = z.object({
  similar: z.array(apiSeedGameSchema),
  series: z.array(apiSeedGameSchema),
});

export const adaptiveProfileResponseSchema = z.object({
  profile: z.object({
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
  }),
});

export const apiErrorResponseSchema = z.object({
  error: z.string().min(1),
});

const rankedSeedGameSchema = z.object({
  game: seedGameSchema,
  affinityScore: z.number(),
  riskScore: z.number(),
  confidence: z.enum(["low", "medium", "high"]),
  fitReasons: z.array(z.string()),
  cautionReasons: z.array(z.string()),
  platformAvailability: z.enum(["available", "unavailable", "unknown"]),
  accessStatus: z.enum(["playable", "not_on_platforms", "unknown_platform", "unreleased"]),
  inBacklog: z.boolean(),
  inWishlist: z.boolean(),
  inPlayfitPicks: z.boolean(),
  similarGames: z.array(
    z.object({
      gameId: z.string(),
      title: z.string(),
      similarity: z.number(),
    }),
  ),
});

export const recommendationModelSchema = z.object({
  currentRun: z.array(rankedSeedGameSchema),
  nextUp: z.array(rankedSeedGameSchema),
  resume: z.array(rankedSeedGameSchema),
  picks: z.array(rankedSeedGameSchema),
});

export const playNextModelSchema = z.object({
  primary: rankedSeedGameSchema.nullable(),
  alternatives: z.array(rankedSeedGameSchema),
  savedPickIds: z.array(z.string()),
  stateVersion: z.string(),
});

export const picksResponseSchema = z.array(rankedSeedGameSchema);
