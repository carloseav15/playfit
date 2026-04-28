import Fuse from "fuse.js";

import type { GameRecord, SortKey } from "../data/schema";

export interface LibraryFilters {
  query: string;
  status: string;
  genre: string;
  sortKey: SortKey;
}

export function buildSearchIndex(records: GameRecord[]) {
  return new Fuse(records, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.3,
    keys: [
      { name: "title", weight: 0.7 },
      { name: "series", weight: 0.1 },
      { name: "primaryGenre", weight: 0.1 },
      { name: "combatStyle", weight: 0.1 },
    ],
  });
}

function compareNullableNumbers(left?: number, right?: number) {
  return (right ?? -1) - (left ?? -1);
}

export function sortRecords(records: GameRecord[], sortKey: SortKey) {
  const cloned = [...records];

  cloned.sort((left, right) => {
    switch (sortKey) {
      case "overall":
        return compareNullableNumbers(left.overallScore, right.overallScore);
      case "fit":
        return compareNullableNumbers(left.fitEstimate, right.fitEstimate);
      case "updated":
        return (right.lastTouched ?? "").localeCompare(left.lastTouched ?? "");
      case "watch":
        return right.watchRiskScore - left.watchRiskScore;
      case "trap":
        return right.trapRiskScore - left.trapRiskScore;
      case "priority":
        return right.backlogPriorityScore - left.backlogPriorityScore;
      case "title":
      default:
        return left.title.localeCompare(right.title);
    }
  });

  return cloned;
}

export function filterAndSortRecords(
  records: GameRecord[],
  searchIndex: Fuse<GameRecord>,
  filters: LibraryFilters,
) {
  const query = filters.query.trim();
  const searchedRecords = query
    ? searchIndex.search(query).map((result) => result.item)
    : records;

  const filteredRecords = searchedRecords.filter((record) => {
    const matchesStatus =
      filters.status === "all" || record.status === filters.status;
    const matchesGenre =
      filters.genre === "all" || record.primaryGenre === filters.genre;

    return matchesStatus && matchesGenre;
  });

  return sortRecords(filteredRecords, filters.sortKey);
}

export function uniqueStatuses(records: GameRecord[]) {
  return [...new Set(records.map((record) => record.status).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  );
}

export function uniqueGenres(records: GameRecord[]) {
  return [
    ...new Set(records.map((record) => record.primaryGenre).filter(Boolean)),
  ].sort((left, right) => left.localeCompare(right));
}
