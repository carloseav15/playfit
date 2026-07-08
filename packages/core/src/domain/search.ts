import Fuse from "fuse.js";
import type { SeedGame } from "../types";

export const ROMAN_TO_NUMBER: Record<string, string> = {
  i: "1",
  ii: "2",
  iii: "3",
  iv: "4",
  v: "5",
  vi: "6",
  vii: "7",
  viii: "8",
  ix: "9",
  x: "10",
  xi: "11",
  xii: "12",
  xiii: "13",
  xiv: "14",
  xv: "15",
  xvi: "16",
};

export const NUMBER_TO_ROMAN = Object.fromEntries(
  Object.entries(ROMAN_TO_NUMBER).map(([roman, number]) => [number, roman]),
);

export const LOW_QUALITY_SEARCH_TERMS = [
  "bonus disc",
  "classic nes series",
  "collector's edition",
  "demo",
  "demo disc",
  "not for resale",
  "picross",
  "soundtrack",
  "wii u",
];

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function swapNumberTokens(value: string, lookup: Record<string, string>): string {
  return value
    .split(" ")
    .map((token) => lookup[token] ?? token)
    .join(" ");
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function textVariants(value: string): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) return [];
  return unique([
    normalized,
    swapNumberTokens(normalized, ROMAN_TO_NUMBER),
    swapNumberTokens(normalized, NUMBER_TO_ROMAN),
  ]);
}

export function searchTerms(value: string): string[] {
  const variants = textVariants(value);
  const tokens = variants
    .flatMap((variant) => variant.split(" "))
    .filter((token) => token.length >= 3)
    .sort((a, b) => b.length - a.length);

  return unique([...variants, ...tokens]).slice(0, 8);
}

export function computeScore(title: string, query: string): number {
  let score = 0;
  for (const valueVariant of textVariants(title)) {
    const valueTokens = new Set(valueVariant.split(" "));
    for (const queryVariant of textVariants(query)) {
      const queryTokens = queryVariant.split(" ").filter(Boolean);
      if (valueVariant === queryVariant) score = Math.max(score, 160);
      else if (valueVariant.startsWith(queryVariant)) score = Math.max(score, 126);
      else if (valueVariant.includes(queryVariant)) score = Math.max(score, 96);
      else if (queryTokens.length > 1 && queryTokens.every((token) => valueTokens.has(token))) {
        score = Math.max(score, 72);
      }
    }
  }
  return score;
}

export function searchQualityPenalty(game: SeedGame): number {
  const searchable = normalizeSearchText(
    [game.title, game.series ?? "", ...(game.aliases ?? [])].join(" "),
  );
  let penalty = 0;

  for (const term of LOW_QUALITY_SEARCH_TERMS) {
    if (searchable.includes(normalizeSearchText(term))) {
      penalty += 22;
    }
  }

  if (!game.tags || game.tags.length === 0) penalty += 20;
  if (!game.genreId && !game.primaryGenre) penalty += 16;
  if (game.genreId === "unknown" || game.primaryGenre === "unknown") penalty += 16;
  if (!game.coverPath) penalty += 6;

  return penalty;
}

export function directSearchScore(game: SeedGame, query: string): number {
  const title = normalizeSearchText(game.title);
  const series = normalizeSearchText(game.series ?? "");
  const aliases = game.aliases?.map(normalizeSearchText) ?? [];

  if (title === query) return 160;
  if (aliases.some((alias) => alias === query)) return 150;
  if (series === query) return 138;
  if (title.startsWith(query)) return 126;
  if (aliases.some((alias) => alias.startsWith(query))) return 116;
  if (series.startsWith(query)) return 108;
  if (title.includes(query)) return 96;
  if (aliases.some((alias) => alias.includes(query))) return 88;
  if (series.includes(query)) return 78;
  return 0;
}

const SEARCH_KEYS = [
  { name: "title", weight: 0.7 },
  { name: "aliases", weight: 0.15 },
  { name: "series", weight: 0.1 },
  { name: "tags", weight: 0.05 },
];

export function buildFinderIndex(games: SeedGame[]) {
  return new Fuse(games, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.34,
    keys: SEARCH_KEYS,
  });
}

export function searchSeedGames(games: SeedGame[], query: string, index: Fuse<SeedGame>) {
  const normalized = normalizeSearchText(query);

  if (!normalized) {
    return [...games]
      .filter((game) => game.tags && game.tags.length > 0)
      .sort((left, right) => searchQualityPenalty(left) - searchQualityPenalty(right))
      .slice(0, 12);
  }

  const scored = new Map<string, { game: SeedGame; score: number }>();

  for (const game of games) {
    const directScore = directSearchScore(game, normalized);
    if (directScore > 0) {
      scored.set(game.gameId, {
        game,
        score: directScore - searchQualityPenalty(game),
      });
    }
  }

  for (const result of index.search(normalized)) {
    const current = scored.get(result.item.gameId);
    const fuzzyScore =
      72 - Math.round((result.score ?? 1) * 60) - searchQualityPenalty(result.item);
    scored.set(result.item.gameId, {
      game: result.item,
      score: Math.max(current?.score ?? Number.NEGATIVE_INFINITY, fuzzyScore),
    });
  }

  return [...scored.values()]
    .sort(
      (left, right) => right.score - left.score || left.game.title.localeCompare(right.game.title),
    )
    .map(({ game }) => game)
    .slice(0, 12);
}

export function findExactSeedGame(games: SeedGame[], query: string) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  return (
    games.find((game) => game.title.toLowerCase() === normalized) ??
    games.find((game) => game.aliases?.some((alias) => alias.toLowerCase() === normalized)) ??
    games.find((game) => game.series?.toLowerCase() === normalized) ??
    null
  );
}
