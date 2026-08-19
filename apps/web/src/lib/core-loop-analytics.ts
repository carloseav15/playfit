import { z } from "zod";

export const CORE_LOOP_EVENT_NAMES = [
  "recommendation_shown",
  "recommendation_skipped",
  "recommendation_saved",
] as const;

export const coreLoopClientEventSchema = z
  .object({
    eventId: z.uuid(),
    eventName: z.enum(CORE_LOOP_EVENT_NAMES),
    clientPlatform: z.enum(["web", "ios", "android"]),
    recommendationId: z.string().regex(/^play-next:\d+$/),
    stateVersion: z.string().regex(/^\d+$/),
    gameId: z.string().min(1),
    rank: z.number().int().positive(),
  })
  .strict();

export function playNextRecommendationId(stateVersion: string) {
  return `play-next:${stateVersion}`;
}
