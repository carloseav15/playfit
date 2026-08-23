// Pure, DB-free logic for Game Identity v1 candidate generation.
//
// Scope (see product/docs — Game Identity Design report): this module only
// decides which pairs of catalog rows are *worth a human looking at* for the
// `edition_of` equivalence relation (same experience, for recommendation
// exclusion). It never confirms anything — see game-identity-confirmation.ts
// for the separate, explicit review/merge step. Nothing here is wired into
// Play Next, onboarding, search, or scoring.
//
// Deliberately excluded from identity signals (see prior investigation):
//   - genre_id: ~68% disagreement rate on confirmed real edition/base pairs.
//     Using it as a positive signal would systematically penalize real
//     matches. Never referenced below.
//   - series_id: used only as an auxiliary confidence *boost* when present
//     and matching on both sides. A missing series_id never counts against
//     a candidate, and a mismatch is treated as neutral (not a penalty) --
//     the evidence for penalizing series mismatches is much weaker than for
//     genre, and inventing an unrequested penalty rule is out of scope.

export type IdentityConfidence = "high" | "medium" | "low";

export interface CatalogGameForIdentity {
  gameId: string;
  title: string;
  releaseYear: number | null;
  seriesId: string | null;
}

export interface GameIdentityCandidateEvidence {
  matchedKeyword: string;
  matchType: "exact_title_after_strip" | "fuzzy_title_same_series";
  titleSimilarity: number;
  strippedTitle: string;
  seriesMatch: boolean | null; // null = at least one side has no series_id
  yearKnownBothSides: boolean;
  yearOrderValid: boolean | null; // null = year unknown on at least one side
  gameIdA: string;
  titleA: string;
  gameIdB: string;
  titleB: string;
}

export interface GameIdentityCandidateDraft {
  gameIdA: string;
  gameIdB: string;
  confidence: IdentityConfidence;
  evidence: GameIdentityCandidateEvidence;
  source: string;
}

// Keywords that plausibly indicate "this row is an edition/remaster/remake
// of some other single row". Order doesn't matter; longer phrases are tried
// before shorter ones so e.g. "game of the year edition" strips cleanly
// instead of leaving a dangling "edition".
export const EDITION_KEYWORDS = [
  "complete edition",
  "definitive edition",
  "game of the year edition",
  "game of the year",
  "goty edition",
  "goty",
  "remastered",
  "remaster",
  "enhanced edition",
  "ultimate edition",
  "deluxe edition",
  "director's cut",
  "anniversary edition",
  "special edition",
  "collector's edition",
  "remake",
] as const;

// Keywords that indicate the row is a *container* (bundles multiple distinct
// games) rather than a single-game edition. Per the Game Identity Design
// report, containers are out of scope for `edition_of` in v1 entirely --
// they need `collection_contains`, a different (non-equivalence) relation
// that isn't built yet. A title matching any of these is excluded from
// candidate generation on BOTH sides of a pair: neither as the "edition"
// being classified, nor as a possible "base" match target (this is what
// stops e.g. "BioShock" from fuzzy-matching against "BioShock: The
// Collection").
export const CONTAINER_KEYWORDS = ["collection", "trilogy", "bundle"] as const;

const WORD_BOUNDARY_CACHE = new Map<string, RegExp>();

function wordBoundaryRegex(keyword: string): RegExp {
  const cached = WORD_BOUNDARY_CACHE.get(keyword);
  if (cached) return cached;
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\b${escaped}\\b`, "i");
  WORD_BOUNDARY_CACHE.set(keyword, re);
  return re;
}

export function matchesContainerKeyword(title: string): boolean {
  return CONTAINER_KEYWORDS.some((kw) => wordBoundaryRegex(kw).test(title));
}

export function findEditionKeyword(title: string): string | null {
  const lower = title.toLowerCase();
  for (const kw of EDITION_KEYWORDS) {
    if (lower.includes(kw)) return kw;
  }
  return null;
}

function normalizeForCompare(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, "")
    .replace(/['']/g, "'")
    .replace(/[^a-z0-9']+/g, " ")
    .trim();
}

// Strips a trailing edition phrase (with an optional leading separator --
// colon, dash, en/em-dash, or a wrapping parenthesis) off the end of a
// title, e.g. "Resident Evil 4 (remake)" -> "resident evil 4",
// "The Witcher 3: Wild Hunt - Complete Edition" -> "the witcher 3 wild hunt".
// Returns null if the keyword isn't found at all (caller already checked
// findEditionKeyword first, so this should not normally happen).
export function stripEditionSuffix(title: string, keyword: string): string | null {
  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`\\s*[:\\-–—]?\\s*\\(?${escapedKeyword}\\)?\\s*$`, "i");
  if (!pattern.test(title)) return null;
  const stripped = title.replace(pattern, "");
  return normalizeForCompare(stripped);
}

// Very small, dependency-free token-overlap similarity (Jaccard over
// whitespace-separated tokens of the normalized titles). Only used for the
// fuzzy fallback path, which is itself bounded to same-series_id candidates
// (see generateGameIdentityCandidates) precisely so this never has to run
// against the full catalog.
export function titleTokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalizeForCompare(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalizeForCompare(b).split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let intersection = 0;
  for (const t of tokensA) if (tokensB.has(t)) intersection++;
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

const MIN_PLAUSIBLE_YEAR = 1950;

function isKnownYear(year: number | null): year is number {
  return year != null && year > MIN_PLAUSIBLE_YEAR;
}

// Normalizes a pair so (a, b) and (b, a) always produce the same ordered
// result -- mirrors the DB CHECK constraint (game_id_a < game_id_b) so the
// same normalization rule exists at both layers, not just enforced by the
// database after the fact.
export function normalizeCandidatePair(gameIdX: string, gameIdY: string): [string, string] {
  return gameIdX < gameIdY ? [gameIdX, gameIdY] : [gameIdY, gameIdX];
}

interface ConfidenceInput {
  titleSimilarity: number;
  isExactMatch: boolean;
  seriesIdA: string | null;
  seriesIdB: string | null;
  releaseYearA: number | null;
  releaseYearB: number | null;
  editionIsA: boolean; // true if "a" is the edition/remaster/remake side
}

interface ConfidenceResult {
  confidence: IdentityConfidence;
  seriesMatch: boolean | null;
  yearKnownBothSides: boolean;
  yearOrderValid: boolean | null;
  discard: boolean; // true = year ordering is known and violated; never surface this candidate
}

const TIER_ORDER: IdentityConfidence[] = ["low", "medium", "high"];

function bump(tier: IdentityConfidence, steps: number): IdentityConfidence {
  const idx = TIER_ORDER.indexOf(tier);
  const next = Math.max(0, Math.min(TIER_ORDER.length - 1, idx + steps));
  return TIER_ORDER[next];
}

export function computeConfidence(input: ConfidenceInput): ConfidenceResult {
  let tier: IdentityConfidence = input.isExactMatch
    ? "high"
    : input.titleSimilarity >= 0.6
      ? "medium"
      : "low";

  const yearA = input.releaseYearA;
  const yearB = input.releaseYearB;
  const yearKnownBothSides = isKnownYear(yearA) && isKnownYear(yearB);
  let yearOrderValid: boolean | null = null;

  if (isKnownYear(yearA) && isKnownYear(yearB)) {
    const editionYear = input.editionIsA ? yearA : yearB;
    const baseYear = input.editionIsA ? yearB : yearA;
    yearOrderValid = editionYear >= baseYear;
    if (!yearOrderValid) {
      // Hard gate, not a confidence penalty: a candidate whose edition
      // predates its supposed base is not plausible at all in this
      // catalog (held for every real pair sampled in the investigation).
      return {
        confidence: tier,
        seriesMatch: null,
        yearKnownBothSides,
        yearOrderValid,
        discard: true,
      };
    }
  } else {
    // Missing year data: don't discard, but don't let it reach "high"
    // either -- explicit instruction: "no descartes automáticamente; baja
    // confianza o deja la evidencia incompleta."
    tier = bump(tier, -1);
  }

  let seriesMatch: boolean | null = null;
  if (input.seriesIdA && input.seriesIdB) {
    seriesMatch = input.seriesIdA === input.seriesIdB;
    if (seriesMatch) tier = bump(tier, 1);
    // A known mismatch is intentionally neutral, not a penalty -- the
    // investigation only established that for genre_id, not series_id.
  }
  // seriesMatch stays null (neutral) when either side is missing it.

  return { confidence: tier, seriesMatch, yearKnownBothSides, yearOrderValid, discard: false };
}

export interface GenerateCandidatesOptions {
  source?: string;
}

// Generates edition_of review candidates from an in-memory catalog snapshot.
// Pure function: no I/O. The caller (scripts/generate-game-identity-candidates.ts)
// is responsible for fetching the catalog and persisting the result as
// `pending` rows -- this function never writes anything and never decides
// a candidate is confirmed.
export function generateGameIdentityCandidates(
  games: CatalogGameForIdentity[],
  options: GenerateCandidatesOptions = {},
): GameIdentityCandidateDraft[] {
  const source = options.source ?? "heuristic-v1";
  const drafts = new Map<string, GameIdentityCandidateDraft>();

  // Exact-title-by-normalized-string lookup, excluding container rows --
  // a container can never be a match target for edition_of.
  const byNormalizedTitle = new Map<string, CatalogGameForIdentity[]>();
  // Same-series pool for the fuzzy fallback, also excluding containers.
  const bySeriesId = new Map<string, CatalogGameForIdentity[]>();

  for (const game of games) {
    if (matchesContainerKeyword(game.title)) continue;
    const norm = normalizeForCompare(game.title);
    const list = byNormalizedTitle.get(norm) ?? [];
    list.push(game);
    byNormalizedTitle.set(norm, list);

    if (game.seriesId) {
      const seriesList = bySeriesId.get(game.seriesId) ?? [];
      seriesList.push(game);
      bySeriesId.set(game.seriesId, seriesList);
    }
  }

  function addDraft(
    edition: CatalogGameForIdentity,
    base: CatalogGameForIdentity,
    keyword: string,
    matchType: GameIdentityCandidateEvidence["matchType"],
    titleSimilarity: number,
    strippedTitle: string,
  ) {
    const [gameIdA, gameIdB] = normalizeCandidatePair(edition.gameId, base.gameId);
    const key = `${gameIdA}::${gameIdB}`;
    if (drafts.has(key)) return; // one draft per normalized pair, even if
    // multiple keywords/paths would independently rediscover it

    const editionIsA = gameIdA === edition.gameId;
    const result = computeConfidence({
      titleSimilarity,
      isExactMatch: matchType === "exact_title_after_strip",
      seriesIdA: editionIsA ? edition.seriesId : base.seriesId,
      seriesIdB: editionIsA ? base.seriesId : edition.seriesId,
      releaseYearA: editionIsA ? edition.releaseYear : base.releaseYear,
      releaseYearB: editionIsA ? base.releaseYear : edition.releaseYear,
      editionIsA,
    });

    if (result.discard) return;

    const gameA = editionIsA ? edition : base;
    const gameB = editionIsA ? base : edition;

    drafts.set(key, {
      gameIdA,
      gameIdB,
      confidence: result.confidence,
      source,
      evidence: {
        matchedKeyword: keyword,
        matchType,
        titleSimilarity,
        strippedTitle,
        seriesMatch: result.seriesMatch,
        yearKnownBothSides: result.yearKnownBothSides,
        yearOrderValid: result.yearOrderValid,
        gameIdA,
        titleA: gameA.title,
        gameIdB,
        titleB: gameB.title,
      },
    });
  }

  for (const game of games) {
    if (matchesContainerKeyword(game.title)) continue;
    const keyword = findEditionKeyword(game.title);
    if (!keyword) continue;

    const stripped = stripEditionSuffix(game.title, keyword);
    if (!stripped) continue;

    // Path 1: exact title match after stripping -- the proven, cheap,
    // high-precision path (covers the direct-hit majority found in the
    // investigation).
    const exactSiblings = (byNormalizedTitle.get(stripped) ?? []).filter(
      (candidate) => candidate.gameId !== game.gameId,
    );
    for (const base of exactSiblings) {
      addDraft(game, base, keyword, "exact_title_after_strip", 1, stripped);
    }
    if (exactSiblings.length > 0) continue; // exact match found; don't also fuzzy-match this row

    // Path 2: fuzzy title match, bounded to the same series_id. If the row
    // has no series_id, it is deliberately NOT fuzzy-matched against the
    // full catalog in v1 -- an unbounded fuzzy scan trades precision for
    // recall in exactly the direction the stated cost asymmetry forbids.
    // "ante ambigüedad, genera candidato para revisión o no genera nada."
    if (!game.seriesId) continue;
    const seriesPool = (bySeriesId.get(game.seriesId) ?? []).filter(
      (candidate) => candidate.gameId !== game.gameId && !findEditionKeyword(candidate.title),
    );
    let best: { game: CatalogGameForIdentity; score: number } | null = null;
    for (const candidate of seriesPool) {
      const score = titleTokenSimilarity(stripped, candidate.title);
      if (!best || score > best.score) best = { game: candidate, score };
    }
    if (best && best.score >= 0.6) {
      addDraft(game, best.game, keyword, "fuzzy_title_same_series", best.score, stripped);
    }
  }

  return [...drafts.values()];
}
