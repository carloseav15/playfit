import type {
  ProductGameState,
  ProductOnboardingDraft,
  ProductProfile,
  ProductTasteConfidence,
  ProductTasteDecision,
  ProductTasteHistoryEntry,
  ProductTasteMapTrait,
  ProductTasteModel,
  ProductTasteSignalSource,
  ProductTasteSummaryConfidence,
  ProductTasteTone,
  SeedGame,
} from "../types";
import { buildTagPreferenceAnalysis } from "./onboarding";

const MAX_TASTE_TRAITS = 25;

function decisionFromRating(record: ProductGameState): ProductTasteDecision | null {
  if (record.status === "abandoned") return "dropped";
  if (record.excluded) return "not_for_me";
  if (record.rating == null || record.rating <= 0) return null;
  if (record.rating >= 4.5) return "loved";
  if (record.rating >= 4) return "liked";
  if (record.rating >= 3) return "mixed";
  return "not_for_me";
}

function toneFromDecision(decision: ProductTasteDecision): ProductTasteTone {
  if (decision === "setup_miss" || decision === "dropped" || decision === "not_for_me") {
    return "negative";
  }
  if (decision === "mixed") return "mixed";
  return "positive";
}

function confidenceFromCount(count: number): ProductTasteConfidence {
  if (count >= 4) return "Strong";
  if (count >= 2) return "Emerging";
  return "Early";
}

function summaryConfidence(evidenceCount: number): ProductTasteSummaryConfidence {
  if (evidenceCount >= 8) return "Strong";
  if (evidenceCount >= 4) return "Emerging";
  return "Still learning";
}

function buildHistoryEntry({
  game,
  decision,
  source,
  record,
}: {
  game: SeedGame;
  decision: ProductTasteDecision;
  source: ProductTasteSignalSource;
  record?: ProductGameState;
}): ProductTasteHistoryEntry {
  return {
    gameId: game.gameId,
    title: game.title,
    decision,
    source,
    tone: toneFromDecision(decision),
    rating: record?.rating,
    status: record?.status,
    updatedAt: record?.updatedAt,
    traits: [game.genreId ?? game.primaryGenre, ...game.tags].filter(Boolean).slice(0, 4),
  };
}

function countGenreTraits(
  historyEntries: ProductTasteHistoryEntry[],
  gamesById: Map<string, SeedGame>,
) {
  const counts = new Map<string, { positiveCount: number; negativeCount: number }>();

  for (const entry of historyEntries) {
    const game = gamesById.get(entry.gameId);
    const genre = game?.genreId ?? game?.primaryGenre;
    if (!genre) continue;
    const current = counts.get(genre) ?? { positiveCount: 0, negativeCount: 0 };
    if (entry.tone === "positive") current.positiveCount += 1;
    if (entry.tone === "negative") current.negativeCount += 1;
    counts.set(genre, current);
  }

  return counts;
}

function buildTrait({
  id,
  label,
  kind,
  positiveCount,
  negativeCount,
}: {
  id: string;
  label: string;
  kind: ProductTasteMapTrait["kind"];
  positiveCount: number;
  negativeCount: number;
}): ProductTasteMapTrait {
  const netScore = positiveCount - negativeCount;
  const strength = Math.abs(netScore);
  const totalCount = positiveCount + negativeCount;
  return {
    id,
    label,
    kind,
    positiveCount,
    negativeCount,
    netScore,
    strength,
    confidence: confidenceFromCount(totalCount),
    direction: netScore > 0 ? "positive" : netScore < 0 ? "negative" : "neutral",
  };
}

export function formatTasteTraitLabel(trait: string) {
  if (typeof trait !== "string" || !trait) return "";
  return trait
    .replace(/[_-]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildTasteModel(
  draft: ProductOnboardingDraft,
  gameStates: Record<string, ProductGameState>,
  gamesById: Map<string, SeedGame>,
  profile: ProductProfile | null,
): ProductTasteModel {
  const entriesByGame = new Map<string, ProductTasteHistoryEntry>();

  for (const record of Object.values(gameStates)) {
    const game = gamesById.get(record.gameId);
    if (!game) continue;
    const decision = decisionFromRating(record);
    if (!decision) continue;
    entriesByGame.set(
      record.gameId,
      buildHistoryEntry({ game, decision, source: "rating", record }),
    );
  }

  for (const gameId of draft.likedGameIds) {
    if (entriesByGame.has(gameId)) continue;
    const game = gamesById.get(gameId);
    if (!game) continue;
    entriesByGame.set(
      gameId,
      buildHistoryEntry({ game, decision: "setup_favorite", source: "onboarding_liked" }),
    );
  }

  for (const gameId of draft.dislikedGameIds ?? []) {
    if (entriesByGame.has(gameId)) continue;
    const game = gamesById.get(gameId);
    if (!game) continue;
    entriesByGame.set(
      gameId,
      buildHistoryEntry({ game, decision: "setup_miss", source: "onboarding_disliked" }),
    );
  }

  const historyEntries = [...entriesByGame.values()].sort((left, right) => {
    const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0;
    const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0;
    return rightTime - leftTime || left.title.localeCompare(right.title);
  });

  const tagEvidence = buildTagPreferenceAnalysis(draft, gamesById, gameStates);
  const traitsById = new Map<string, ProductTasteMapTrait>();

  for (const entry of [...tagEvidence.higherRatedTags, ...tagEvidence.lowerRatedTags]) {
    if (entry.positiveCount === 0 && entry.negativeCount === 0) continue;
    traitsById.set(
      `tag:${entry.tag}`,
      buildTrait({
        id: entry.tag,
        label: formatTasteTraitLabel(entry.tag),
        kind: "tag",
        positiveCount: entry.positiveCount,
        negativeCount: entry.negativeCount,
      }),
    );
  }

  const genreCounts = countGenreTraits(historyEntries, gamesById);
  for (const [genre, counts] of genreCounts) {
    traitsById.set(
      `genre:${genre}`,
      buildTrait({
        id: genre,
        label: formatTasteTraitLabel(genre),
        kind: "genre",
        positiveCount: counts.positiveCount,
        negativeCount: counts.negativeCount,
      }),
    );
  }

  for (const genre of profile?.likedGenres ?? []) {
    if (!traitsById.has(`genre:${genre}`)) {
      traitsById.set(
        `genre:${genre}`,
        buildTrait({
          id: genre,
          label: formatTasteTraitLabel(genre),
          kind: "genre",
          positiveCount: 1,
          negativeCount: 0,
        }),
      );
    }
  }

  for (const genre of profile?.avoidedGenres ?? []) {
    if (!traitsById.has(`genre:${genre}`)) {
      traitsById.set(
        `genre:${genre}`,
        buildTrait({
          id: genre,
          label: formatTasteTraitLabel(genre),
          kind: "genre",
          positiveCount: 0,
          negativeCount: 1,
        }),
      );
    }
  }

  const mapTraits = [...traitsById.values()]
    .filter((trait) => trait.strength > 0)
    .sort(
      (left, right) =>
        right.strength - left.strength ||
        right.positiveCount + right.negativeCount - (left.positiveCount + left.negativeCount) ||
        left.label.localeCompare(right.label),
    )
    .slice(0, MAX_TASTE_TRAITS);

  const positiveCount = historyEntries.filter((entry) => entry.tone === "positive").length;
  const negativeCount = historyEntries.filter((entry) => entry.tone === "negative").length;
  const evidenceCount = historyEntries.length;

  return {
    evidenceCount,
    historyEntries,
    mapTraits,
    positiveCount,
    negativeCount,
    confidenceLabel: summaryConfidence(evidenceCount),
  };
}
